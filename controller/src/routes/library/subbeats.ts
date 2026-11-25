// New Style Stem Beats preparation and pick-time extraction metrics.
import express from 'express';
import { join } from 'node:path';
import { config } from '../../config.js';
import { requireAdmin } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import * as db from '../../music/library-db.js';
import * as library from '../../music/library.js';
import * as stemCache from '../../music/stem-cache.js';
import { createStemExtractionMetricsStore, summarizeStemExtractions } from '../../music/stem-extraction-metrics.js';
import { SUBBEATS_PREP_V2_ALGORITHM_VERSION, subbeatsPrepV2CreateRequestSchema } from '../../schemas/subbeats-prep-v2-server.js';
import { subbeatsPauseSchema } from '../../schemas/subbeats.js';
import { createSubbeatsPrepV2Store, subbeatsPrepV2TimingSummary } from '../../music/subbeats-prep-v2-store.js';
import { pauseSubbeatsPrepV2, startSubbeatsPrepV2, subbeatsPrepV2RunActive, subbeatsPrepV2WaitingForPickTime, subbeatsPrepV2WaitingReason } from '../../music/subbeats-prep-v2-library.js';
import { trackGridCurrent } from '../../music/beat-grid-upgrade.js';

export const router = express.Router();
const prepV2Store = createSubbeatsPrepV2Store(config.stateDir, join(stemCache.stemsRoot(), 'stembeats'));

function prepV2RunStatus(run: ReturnType<typeof prepV2Store.read>) {
  const counts = { queued: 0, running: 0, complete: 0, failed: 0, sourceChanged: 0,
    incomingReady: 0, outgoingReady: 0 };
  for (const job of run.jobs) {
    if (job.status === 'source-changed') counts.sourceChanged++;
    else counts[job.status]++;
    if (job.roles.incoming.status === 'cue-ready') counts.incomingReady++;
    if (job.roles.outgoing.status === 'cue-ready') counts.outgoingReady++;
  }
  const currentJob = run.jobs.find(job => job.status === 'running') ?? run.jobs.find(job => job.status === 'queued');
  return { ...run, active: subbeatsPrepV2RunActive(run.runId), airplay: run.airplay === true,
    waitingForPickTime: subbeatsPrepV2WaitingForPickTime(run.runId),
    waitingReason: subbeatsPrepV2WaitingReason(run.runId),
    currentJob: currentJob ? { title: currentJob.title, artist: currentJob.artist, status: currentJob.status,
      stage: currentJob.stage ?? null } : null,
    counts, timing: subbeatsPrepV2TimingSummary(run) };
}

router.get('/library/subbeats/prep-v2/runs', requireAdmin, (_req, res) => {
  try { res.set('Cache-Control', 'no-store').json({ runs: prepV2Store.listRuns().map(prepV2RunStatus) }); }
  catch { res.status(503).json({ error: 'Stem Beats preparation runs could not be read.' }); }
});

router.get('/library/stems/pick-time-metrics', requireAdmin, async (_req, res) => {
  try {
    const samples = await createStemExtractionMetricsStore(stemCache.stemsRoot()).read();
    res.set('Cache-Control', 'no-store').json({ summaries: summarizeStemExtractions(samples) });
  } catch { res.status(503).json({ error: 'Stem extraction timings could not be read.' }); }
});

router.get('/library/subbeats/prep-v2/candidates', requireAdmin, async (_req, res) => {
  try {
    await library.load();
    const latest = new Map<string, { createdAt: string; job: ReturnType<typeof prepV2Store.read>['jobs'][number] }>();
    for (const run of prepV2Store.listRuns()) {
      if (run.algorithmVersion !== 3 && run.algorithmVersion !== SUBBEATS_PREP_V2_ALGORITHM_VERSION) continue;
      for (const job of run.jobs) {
        if (job.status !== 'complete' || !job.source) continue;
        const previous = latest.get(job.id);
        if (!previous || run.createdAt >= previous.createdAt) latest.set(job.id, { createdAt: run.createdAt, job });
      }
    }
    const tracks = db.subbeatsDanceCandidates().map(track => {
      const job = latest.get(track.id)?.job;
      const current = !!job && job.source?.bytes === db.trackFileSize(track.id) && trackGridCurrent(track.id);
      const roleReady = (role: 'incoming' | 'outgoing') => {
        if (!current || !job || job.roles[role].status !== 'cue-ready' || !job.roles[role].gridArtifact) return false;
        const duration = job.source?.durationSeconds ?? 0;
        return job.roles[role].cuePoints.some(cue => cue.timingValidated !== false
          && (role !== 'outgoing' || cue.sourceSeconds >= duration / 2)
          && cue.sourceSeconds < duration);
      };
      return { ...track, scanned: current, incomingReady: roleReady('incoming'), outgoingReady: roleReady('outgoing') };
    });
    return res.set('Cache-Control', 'no-store').json({ tracks });
  } catch { return res.status(503).json({ error: 'Stem Beats candidates could not be read.' }); }
});

router.get<{runId:string}>('/library/subbeats/prep-v2/runs/:runId', requireAdmin, (req, res) => {
  try {
    res.set('Cache-Control', 'no-store').json(prepV2RunStatus(prepV2Store.read(req.params.runId)));
  } catch { res.status(404).json({ error: 'Stem Beats preparation run not found.' }); }
});

router.post('/library/subbeats/prep-v2/runs', requireAdmin, validateBody(subbeatsPrepV2CreateRequestSchema), async (req, res) => {
  try {
    if (req.body.scope === 'library') {
      await library.load();
      const candidates = db.subbeatsDanceCandidates();
      if (req.body.mode) await prepV2Store.primeLatestCompleteJobs();
      const selected = candidates.filter(track => {
        const latest = prepV2Store.latestJob(track.id)?.job;
        const complete = prepV2Store.latestCompleteJob(track.id)?.job;
        const current = !!complete && complete.source?.bytes === db.trackFileSize(track.id) && trackGridCurrent(track.id);
        if (req.body.mode === 'missing') return !current && !(latest && ['queued', 'running'].includes(latest.status));
        if (req.body.mode === 'refresh') return !!complete;
        return true;
      }).slice(0, req.body.limit);
      if (!selected.length) return res.status(400).json({ error: req.body.mode === 'refresh'
        ? 'There are no current Stem Beats preparation results to re-scan.'
        : req.body.mode === 'missing'
          ? 'All eligible Dance Candidates already have current Stem Beats preparation.'
          : 'There are no Dance Candidates to prepare.' });
      const run = prepV2Store.createRun({
        baselineSha256: null, scope: 'library', algorithmVersion: SUBBEATS_PREP_V2_ALGORITHM_VERSION,
        jobs: selected.map(track => ({
          id: track.id, title: track.title, artist: track.artist, album: track.album,
          expectedSourceBytes: db.trackFileSize(track.id) ?? undefined, v1: null,
        })),
      });
      return res.status(201).set('Cache-Control', 'no-store').json(run);
    }

    await library.load();
    if (req.body.scope === 'library-selected') {
      const candidates = new Map(db.subbeatsDanceCandidates().map(track => [track.id, track]));
      const selected = req.body.ids.map(id => {
        const track = candidates.get(id);
        const bytes = db.trackFileSize(id);
        return track && bytes ? { track, bytes } : null;
      });
      if (selected.some(item => !item)) return res.status(400).json({ error: 'Some selected recordings are no longer Stem Beats candidates in the library.' });
      const run = prepV2Store.createRun({
        baselineSha256: null, scope: 'library-selected', algorithmVersion: SUBBEATS_PREP_V2_ALGORITHM_VERSION,
        jobs: selected.map(item => ({ ...item!.track, expectedSourceBytes: item!.bytes, v1: null })),
      });
      return res.status(201).set('Cache-Control', 'no-store').json(run);
    }

    if (req.body.scope === 'track') {
      const track = db.getTrack(req.body.id);
      const bytes = db.trackFileSize(req.body.id);
      if (!track || !bytes) return res.status(404).json({ error: 'The selected recording is not available in the library.' });
      const run = prepV2Store.createRun({
        baselineSha256: null, scope: 'track', algorithmVersion: SUBBEATS_PREP_V2_ALGORITHM_VERSION,
        jobs: [{ id: track.id, title: track.title ?? '', artist: track.artist ?? '', album: track.album ?? '', expectedSourceBytes: bytes, v1: null }],
      });
      return res.status(201).set('Cache-Control', 'no-store').json(run);
    }

    return res.status(400).json({ error: 'Legacy V1 preparation scopes are retired. Choose a Stem Beats candidate or track.' });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Stem Beats preparation run could not be created.' });
  }
});

router.post<{runId:string}>('/library/subbeats/prep-v2/runs/:runId/start', requireAdmin, (req, res) => {
  try {
    startSubbeatsPrepV2(req.params.runId);
    res.status(202).set('Cache-Control', 'no-store').json(prepV2Store.read(req.params.runId));
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'Stem Beats preparation could not start.' }); }
});

router.post<{runId:string}>('/library/subbeats/prep-v2/runs/:runId/retry-failed', requireAdmin, (req, res) => {
  try {
    const run = prepV2Store.retryFailed(req.params.runId);
    startSubbeatsPrepV2(run.runId);
    res.status(202).set('Cache-Control', 'no-store').json(prepV2Store.read(run.runId));
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'Stem Beats retry could not start.' }); }
});

router.post<{runId:string}>('/library/subbeats/prep-v2/runs/:runId/pause', requireAdmin, validateBody(subbeatsPauseSchema), (req, res) => {
  try {
    pauseSubbeatsPrepV2(req.params.runId, req.body.paused);
    res.set('Cache-Control', 'no-store').json(prepV2Store.read(req.params.runId));
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'Stem Beats preparation could not be paused.' }); }
});
