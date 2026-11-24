import { removeSubbeatsEntry, subbeatsRemovalRunning } from '../../music/subbeats-removal.js';
import { startSubbeatsCleanup, startSubbeatsCleanupEstimate, subbeatsCleanupState, invalidateSubbeatsCleanupEstimate } from '../../music/subbeats-stem-cleanup.js';
import { statfs } from 'node:fs/promises';
import * as stemCache from '../../music/stem-cache.js';
import { readSubbeatsStemPolicy, updateSubbeatsStemPolicy } from '../../music/subbeats-stem-policy.js';
import express from 'express';
import { config } from '../../config.js';
import { resolveGainDb } from '../../music/loudness.js';
import * as blocklist from '../../music/blocklist.js';
import { requireAdmin } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { subbeatsPairPlanRequestSchema, subbeatsCueMatchQuerySchema, subbeatsMatchQuerySchema, subbeatsStemPolicyPatchSchema, subbeatsBrowseQuerySchema, subbeatsEnqueueSchema, subbeatsPauseSchema, subbeatsPlaylistExportSchema, subbeatsPreviewSchema, subbeatsQueueSchema } from '../../schemas/subbeats.js';
import * as db from '../../music/library-db.js';
import * as library from '../../music/library.js';
import * as recipes from '../../music/playlist-recipes.js';
import { queue } from '../../broadcast/queue.js';
import { subbeatsStore, kickSubbeats } from '../../music/subbeats-manager.js';
import { matchSubbeatsCues, matchSubbeats, previewSubbeats, subbeatsCapability } from '../../music/analyzer.js';
import { tagger } from '../../broadcast/tagger.js';
import { bulkPassRunning } from '../../music/tagger-lock.js';
import { subbeatsReferences } from '../../music/subbeats-references.js';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as subsonic from '../../music/subsonic.js';
import { fetchWithTimeout } from '../../util/fetch-timeout.js';
import * as settings from '../../settings.js';
import { withSubbeatsLyrics } from '../../music/subbeats-lyrics.js';
import { assessSubbeatsPair, subbeatsHarmonicChoice, subbeatsPairSnapshot } from '../../music/subbeats-pair.js';
import { createSubbeatsPrepV2Store, subbeatsPrepV2BaselineMatches, subbeatsPrepV2TimingSummary } from '../../music/subbeats-prep-v2-store.js';
import { SUBBEATS_PREP_V2_ALGORITHM_VERSION, subbeatsPrepV2CreateRequestSchema } from '../../schemas/subbeats-prep-v2-server.js';
import { pauseSubbeatsPrepV2, startSubbeatsPrepV2, subbeatsPrepV2RunActive, subbeatsPrepV2WaitingForPickTime, subbeatsPrepV2WaitingReason } from '../../music/subbeats-prep-v2-library.js';
import { trackGridCurrent } from '../../music/beat-grid-upgrade.js';

export const router = express.Router();
const view = () => ({ ...subbeatsStore.read(), capable: subbeatsCapability(),
  maintenanceRunning: tagger.running, progress: tagger.running ? tagger.progress?.label ?? null : null,
  references: subbeatsReferences });
const prepV2Store = createSubbeatsPrepV2Store(config.stateDir, join(stemCache.stemsRoot(), 'stembeats'));
function assertPrepV2V1Baseline(runId: string) {
  const run = prepV2Store.read(runId);
  if (run.scope === 'track' || run.scope === 'library' || run.scope === 'library-selected' || run.baselineSha256 === null) return;
  const queue = JSON.parse(readFileSync(join(config.stateDir, 'subbeats', 'queue.json'), 'utf8'));
  if (!subbeatsPrepV2BaselineMatches(run, queue)) throw new Error('The V1 supported recordings changed after this V2 run was created.');
}

router.get('/library/subbeats', requireAdmin, (_req, res) => {
  try { res.json(view()); }
  catch { res.status(503).json({ error: 'The Sub/Beats preparation list could not be read' }); }
});
router.get('/library/subbeats/prep-v2/runs', requireAdmin, (_req, res) => {
  try { res.set('Cache-Control', 'no-store').json({ runs: prepV2Store.listRuns().map(prepV2Progress) }); }
  catch { res.status(503).json({ error: 'V2 preparation runs could not be read.' }); }
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
        const half = (job.source?.durationSeconds ?? 0) / 2;
        return job.roles[role].cuePoints.some(cue => cue.timingValidated !== false
          && (role !== 'outgoing' || cue.sourceSeconds >= half)
          && cue.sourceSeconds < (job.source?.durationSeconds ?? 0));
      };
      return { ...track, scanned: current, incomingReady: roleReady('incoming'), outgoingReady: roleReady('outgoing') };
    });
    return res.set('Cache-Control', 'no-store').json({ tracks });
  } catch { return res.status(503).json({ error: 'Stem Beats candidates could not be read.' }); }
});
function prepV2Progress(run: ReturnType<typeof prepV2Store.read>) {
  const counts = { queued: 0, running: 0, complete: 0, failed: 0, sourceChanged: 0,
    incomingReady: 0, outgoingReady: 0 };
  for (const job of run.jobs) {
    if (job.status === 'source-changed') counts.sourceChanged++;
    else counts[job.status]++;
    if (job.roles.incoming.status === 'cue-ready') counts.incomingReady++;
    if (job.roles.outgoing.status === 'cue-ready') counts.outgoingReady++;
  }
  const currentJob = run.jobs.find(job => job.status === 'running') ?? run.jobs.find(job => job.status === 'queued');
  return { runId: run.runId, createdAt: run.createdAt, status: run.status, scope: run.scope,
    airplay: run.airplay === true, waitingForPickTime: subbeatsPrepV2WaitingForPickTime(run.runId),
    waitingReason: subbeatsPrepV2WaitingReason(run.runId),
    currentJob: currentJob ? { title: currentJob.title, artist: currentJob.artist, status: currentJob.status } : null,
    algorithmVersion: run.algorithmVersion, total: run.jobs.length, counts,
    timing: subbeatsPrepV2TimingSummary(run) };
}
router.get<{runId:string}>('/library/subbeats/prep-v2/runs/:runId/progress', requireAdmin, (req, res) => {
  try {
    const run = prepV2Store.read(req.params.runId);
    res.set('Cache-Control', 'no-store').json({ ...prepV2Progress(run), active: subbeatsPrepV2RunActive(run.runId) });
  } catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : 'V2 run not found.' }); }
});
router.get<{runId:string}>('/library/subbeats/prep-v2/runs/:runId', requireAdmin, (req, res) => {
  try {
    const run = prepV2Store.read(req.params.runId);
    res.set('Cache-Control', 'no-store').json({ ...run, active: subbeatsPrepV2RunActive(run.runId),
      timing: subbeatsPrepV2TimingSummary(run) });
  } catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : 'V2 run not found.' }); }
});
router.post('/library/subbeats/prep-v2/runs', requireAdmin, validateBody(subbeatsPrepV2CreateRequestSchema), async (req, res) => {
  try {
    if (req.body.scope === 'track') {
      const track = db.getTrack(req.body.id);
      if (!track) return res.status(404).json({ error: 'The requested recording is not in the library.' });
      const run = prepV2Store.createRun({
        baselineSha256: null,
        scope: 'track',
        algorithmVersion: SUBBEATS_PREP_V2_ALGORITHM_VERSION,
        jobs: [{ id: track.id, title: track.title ?? track.id, artist: track.artist ?? '', album: track.album ?? '', v1: null }],
      });
      return res.status(201).set('Cache-Control', 'no-store').json(run);
    }
    if (req.body.scope === 'library-selected') {
      const transitions = settings.get().transitions;
      if (transitions?.stemsEnabled !== true || transitions.stemsStyle !== 'new-style' || transitions.newStyleStemBeats !== true) {
        return res.status(409).json({ error: 'Stem Beats preparation is available only when Stems and Stem Beats are enabled in New Style.' });
      }
      await library.load();
      const candidates = new Set(db.subbeatsDanceCandidates().map(track => track.id));
      const selected = req.body.ids.map(id => {
        if (!candidates.has(id)) return null;
        const track = db.getTrack(id);
        const bytes = db.trackFileSize(id);
        return track && bytes ? { track, bytes } : null;
      });
      if (selected.some(item => !item)) return res.status(400).json({ error: 'Some selected recordings are no longer Stem Beats candidates in the library.' });
      const run = prepV2Store.createRun({
        baselineSha256: null,
        scope: 'library-selected',
        algorithmVersion: SUBBEATS_PREP_V2_ALGORITHM_VERSION,
        jobs: selected.map(item => ({
          id: item!.track.id,
          title: item!.track.title ?? item!.track.id,
          artist: item!.track.artist ?? '',
          album: item!.track.album ?? '',
          expectedSourceBytes: item!.bytes,
          v1: null,
        })),
      });
      return res.status(201).set('Cache-Control', 'no-store').json(run);
    }
    if (req.body.scope === 'library') {
      if (req.body.mode && (settings.get().transitions?.stemsEnabled === false
          || settings.get().transitions?.stemsStyle !== 'new-style')) {
        return res.status(409).json({ error: 'New Style library preparation is available only when Stems is enabled in New Style.' });
      }
      await library.load();
      const candidates = db.subbeatsDanceCandidates();
      if (req.body.mode) await prepV2Store.primeLatestCompleteJobs();
      const selected = candidates.filter(track => {
        const latest = prepV2Store.latestJob(track.id)?.job;
        const complete = prepV2Store.latestCompleteJob(track.id)?.job;
        const sourceBytes = db.trackFileSize(track.id);
        const current = !!complete && complete.source?.bytes === sourceBytes && trackGridCurrent(track.id);
        if (req.body.mode === 'missing') return !current && !(latest && ['queued', 'running'].includes(latest.status));
        if (req.body.mode === 'refresh') return !!complete;
        return true;
      }).slice(0, req.body.limit);
      if (!selected.length) return res.status(400).json({ error: req.body.mode === 'refresh'
        ? 'There are no current Stem Beats preparation results to re-scan.'
        : req.body.mode === 'missing'
          ? 'All eligible Dance Candidates already have current Stem Beats preparation.'
          : 'There are no Dance Candidates to prepare.' });
      if (selected.length > 20_000) return res.status(400).json({ error: 'The library candidate set exceeds the 20,000-recording run limit.' });
      const run = prepV2Store.createRun({
        baselineSha256: null,
        scope: 'library',
        algorithmVersion: SUBBEATS_PREP_V2_ALGORITHM_VERSION,
        jobs: selected.map(track => ({
          id: track.id, title: track.title, artist: track.artist, album: track.album,
          expectedSourceBytes: db.trackFileSize(track.id) ?? undefined, v1: null,
        })),
      });
      return res.status(201).set('Cache-Control', 'no-store').json(run);
    }
    const queuePath = join(config.stateDir, 'subbeats', 'queue.json');
    const queueBytes = readFileSync(queuePath);
    const baselineSha256 = createHash('sha256').update(queueBytes).digest('hex');
    const queue = subbeatsQueueSchema.parse(JSON.parse(queueBytes.toString('utf8')));
    const byId = new Map(queue.jobs.map(job => [job.id, job]));
    const selected = req.body.scope === 'supported'
      ? queue.jobs.filter(job => job.status === 'prepared' && (
        job.suitability?.incoming.level === 'subbeat' || job.suitability?.outgoing.level === 'subbeat'))
      : req.body.ids.map((id: string) => byId.get(id)).filter(Boolean);
    if (req.body.scope === 'selected' && selected.length !== req.body.ids.length) {
      return res.status(400).json({ error: 'Some selected recordings are no longer in the V1 preparation list.' });
    }
    if (!selected.length) return res.status(400).json({ error: 'There are no V1 recordings to prepare.' });
    const run = prepV2Store.createRun({
      baselineSha256,
      scope: req.body.scope,
      algorithmVersion: SUBBEATS_PREP_V2_ALGORITHM_VERSION,
      jobs: selected.map(job => ({
        id: job!.id, title: job!.title, artist: job!.artist, album: job!.album,
        v1: {
          status: job!.status, attempts: job!.attempts, error: job!.error, updatedAt: job!.updatedAt,
          task: job!.task ?? null, headSupported: job!.suitability?.incoming.level === 'subbeat',
          tailSupported: job!.suitability?.outgoing.level === 'subbeat',
          preparationMethod: job!.preparationMethod ?? null, bundleKey: job!.bundleKey,
          cuePoints: job!.cuePoints ?? null, cueCoverage: job!.cueCoverage ?? null,
          suitability: job!.suitability ?? null, lyricEvidence: job!.lyricEvidence ?? null,
        },
        status: job!.status, attempts: job!.attempts, error: job!.error, updatedAt: job!.updatedAt,
        task: job!.task ?? null,
        headSupported: job!.suitability?.incoming.level === 'subbeat',
        tailSupported: job!.suitability?.outgoing.level === 'subbeat',
        preparationMethod: job!.preparationMethod ?? null,
        bundleKey: job!.bundleKey,
        cuePoints: job!.cuePoints ?? null,
        cueCoverage: job!.cueCoverage ?? null,
        suitability: job!.suitability ?? null,
        lyricEvidence: job!.lyricEvidence ?? null,
      })),
    });
    res.status(201).set('Cache-Control', 'no-store').json(run);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'V2 preparation run could not be created.' });
  }
});
router.post<{runId:string}>('/library/subbeats/prep-v2/runs/:runId/start', requireAdmin, (req, res) => {
  try {
    assertPrepV2V1Baseline(req.params.runId);
    startSubbeatsPrepV2(req.params.runId);
    res.status(202).set('Cache-Control', 'no-store').json(prepV2Store.read(req.params.runId));
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'V2 preparation could not start.' }); }
});
router.post<{runId:string}>('/library/subbeats/prep-v2/runs/:runId/retry-failed', requireAdmin, (req, res) => {
  try {
    assertPrepV2V1Baseline(req.params.runId);
    const run = prepV2Store.retryFailed(req.params.runId);
    startSubbeatsPrepV2(run.runId);
    res.status(202).set('Cache-Control', 'no-store').json(prepV2Store.read(run.runId));
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'V2 retry could not start.' }); }
});
router.post<{runId:string}>('/library/subbeats/prep-v2/runs/:runId/pause', requireAdmin, validateBody(subbeatsPauseSchema), (req, res) => {
  try {
    if (!req.body.paused) assertPrepV2V1Baseline(req.params.runId);
    pauseSubbeatsPrepV2(req.params.runId, req.body.paused);
    res.set('Cache-Control', 'no-store').json(prepV2Store.read(req.params.runId));
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : 'V2 preparation could not be paused.' }); }
});
// Diagnostic proposal only: does not modify preparation, queue or playback.
router.post('/library/subbeats/pair-plan', requireAdmin, validateBody(subbeatsPairPlanRequestSchema), async (req,res) => {
  try {
    const assessment = await assessSubbeatsPair(req.body.outgoingId,req.body.incomingId);
    res.set('Cache-Control','no-store').json(assessment);
  } catch (error) {
    res.status(400).json({error:error instanceof Error ? error.message : 'The pair could not be assessed.'});
  }
});
// Audition original recordings without modifying Subwave playback state.
// Keep Navidrome credentials server-side and stream without writing shared state.
router.get<{id:string}>(['/library/subbeats/outgoing-audio/:id','/library/subbeats/source-audio/:id'], requireAdmin, async (req, res) => {
  const abort = new AbortController();
  const cancel = () => abort.abort();
  res.on('close', cancel);
  try {
    await library.load();
    await blocklist.load();
    const job = subbeatsStore.read().jobs.find(item => item.id === req.params.id);
    const track = db.getTrack(req.params.id);
    if (!track || blocklist.hitOf(track) || !job) {
      return res.status(400).json({ error: 'Choose an available track in the Sub/Beats preparation list.' });
    }
    const source = await fetchWithTimeout(subsonic.getRawStreamUrl(track.id), {
      timeoutMs: 5 * 60_000, bodyDeadline: true, signal: abort.signal,
    });
    const type = source.headers.get('content-type')?.toLowerCase() ?? '';
    if (!source.ok || !source.body || type.includes('json') || type.includes('xml') || type.startsWith('text/')) {
      throw new Error('The original recording could not be loaded. Try again.');
    }
    const body = source.body;
    const maxBytes = 256 * 1024 * 1024;
    if (Number(source.headers.get('content-length')) > maxBytes) throw new Error('This recording is too large for an audition.');
    res.set('Cache-Control', 'no-store').type(type || 'application/octet-stream');
    await pipeline((async function* () {
      let bytes = 0;
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        bytes += chunk.length;
        if (bytes > maxBytes) throw new Error('This recording is too large for an audition.');
        yield chunk;
      }
    })(), res);
  } catch {
    if (!abort.signal.aborted && !res.headersSent) res.status(400).json({ error: 'Could not load the complete recording for this audition. Try again or choose another track.' });
    else if (!res.destroyed) res.destroy();
  } finally {
    abort.abort();
    res.off('close', cancel);
  }
});
router.get('/library/subbeats/matches', requireAdmin, async (req,res) => {
  const parsed = subbeatsMatchQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({error:'Choose an outgoing track and a valid bar shift'});
  try {
    await blocklist.load();
    const jobs = subbeatsStore.read().jobs.filter(job => !blocklist.hitOf(job));
    res.set('Cache-Control','no-store').json(await matchSubbeats(jobs,parsed.data.outgoingId,parsed.data.barShift));
  } catch (error) { res.status(400).json({error:error instanceof Error ? error.message : 'Matches could not be found'}); }
});
router.get('/library/subbeats/cue-matches', requireAdmin, async (req,res) => {
  const parsed = subbeatsCueMatchQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({error:'Choose an outgoing track and a saved cue.'});
  try {
    await library.load();
    await blocklist.load();
    const jobs = subbeatsStore.read().jobs.filter(job => {
      const track = db.getTrack(job.id);
      return track && !blocklist.hitOf(track);
    });
    res.set('Cache-Control','no-store').json(await matchSubbeatsCues(withSubbeatsLyrics(jobs,config.stateDir),parsed.data.outgoingId,parsed.data.outgoingCueIndex));
  } catch (error) { res.status(400).json({error:error instanceof Error ? error.message : 'Candidates could not be found.'}); }
});
router.get('/library/subbeats/candidates', requireAdmin, async (req, res) => {
  await library.load();
  const parsed = subbeatsBrowseQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Choose valid Sub/Beats filters.' });
  try {
    const { q, offset, ...filters } = parsed.data;
    const members = filters.scope === 'playlist' ? (filters.playlistId
      ? (await subsonic.getPlaylist(filters.playlistId)).map(track => String(track.id)) : []) : undefined;
    res.json(db.subbeatsCandidates(q, offset, filters, subbeatsStore.read().jobs,members));
  } catch { res.status(503).json({ error: 'Tracks could not be loaded. Retry shortly.' }); }
});
router.post('/library/subbeats/queue', requireAdmin, validateBody(subbeatsEnqueueSchema), async (req, res) => {
  if (subbeatsRemovalRunning()) return res.status(409).json({error:'Wait for entry removal to finish'});
  await library.load();
  if (subbeatsRemovalRunning()) return res.status(409).json({error:'Wait for entry removal to finish'});
  const tracks = [...new Set<string>(req.body.ids)].map(id => db.getTrack(id));
  if (tracks.some(t => !t)) return res.status(400).json({ error: 'Some tracks are no longer in the library' });
  try {
    subbeatsStore.enqueue(tracks.map(t => ({ id: t!.id, title: t!.title ?? '', artist: t!.artist ?? '', album: t!.album ?? '' })),req.body.method);
    kickSubbeats();
    res.status(202).json(view());
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
});
router.post('/library/subbeats/assess', requireAdmin, validateBody(subbeatsEnqueueSchema), (req,res) => {
  if (subbeatsRemovalRunning()) return res.status(409).json({error:'Wait for entry removal to finish'});
  try { subbeatsStore.assess(req.body.ids); kickSubbeats(); res.status(202).json(view()); }
  catch (error) { res.status(409).json({error:error instanceof Error ? error.message : 'Suitability checks could not be queued'}); }
});

router.post('/library/subbeats/coverage', requireAdmin, validateBody(subbeatsEnqueueSchema), (_req,res) => {
  if (subbeatsRemovalRunning()) return res.status(409).json({error:'Wait for entry removal to finish'});
  try { subbeatsStore.upgradeCoverage(_req.body.ids); kickSubbeats(); res.status(202).json(view()); }
  catch (error) { res.status(409).json({error:error instanceof Error ? error.message : 'Coverage upgrades could not be queued.'}); }
});

router.post('/library/subbeats/pause', requireAdmin, validateBody(subbeatsPauseSchema), (req, res) => {
  try {
    subbeatsStore.pause(req.body.paused);
    if (!req.body.paused) kickSubbeats();
    res.json(view());
  } catch { res.status(503).json({ error: 'The preparation list could not be saved' }); }
});

router.post('/library/subbeats/playlist-export', requireAdmin, validateBody(subbeatsPlaylistExportSchema), async (req, res) => {
  try {
    await library.load();
    const ids = subbeatsStore.read().jobs
      .filter(job => job.status === 'prepared' && !!job.bundleKey && !!db.getTrack(job.id))
      .map(job => job.id);
    if (!ids.length) return res.status(409).json({ error: 'There are no prepared Sub/Beats tracks to export.' });

    const { name, playlistId } = req.body;
    if (playlistId) {
      const existing = await subsonic.getPlaylists();
      if (!existing.some(playlist => String(playlist.id) === playlistId)) {
        return res.status(404).json({ error: 'That Navidrome playlist no longer exists. Refresh the page and try again.' });
      }
    }
    const playlist = await subsonic.createPlaylist(name, ids, { playlistId });
    const id = playlist?.id || playlistId;
    if (playlistId) await subsonic.updatePlaylistMeta(playlistId, { name, public: true });
    if (id) recipes.remove(id);
    queue.log('info', `Sub/Beats playlist "${name}" ${playlistId ? 'overwritten' : 'created'} (${ids.length} prepared tracks)`);
    res.json({ playlistId: id ?? null, name, added: ids.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    queue.log('error', `Sub/Beats playlist export failed: ${message}`);
    res.status(500).json({ error: message || 'The Navidrome playlist could not be saved.' });
  }
});

let previewBusy = false;
router.delete('/library/subbeats/entries/:id', requireAdmin, async (req,res) => {
  if (tagger.running || previewBusy || subbeatsCleanupState().busy) return res.status(409).json({error:'Wait for analysis, preview rendering or cache cleanup to finish before removing an entry'});
  try {
    await removeSubbeatsEntry(req.params.id);
    res.json(view());
  } catch (error) { res.status(409).json({error:error instanceof Error ? error.message : 'The entry could not be removed. Retry shortly.'}); }
  finally { invalidateSubbeatsCleanupEstimate(); }
});

router.post('/library/subbeats/join-preview', requireAdmin, async (req, res) => {
  const parsed = subbeatsPreviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose two prepared tracks.' });
  if (subbeatsRemovalRunning()) return res.status(409).json({error:'Wait for entry removal to finish before preparing a preview'});
  const waitingForQuiet = tagger.running && tagger.progress?.waitingForQuiet === true;
  if (parsed.data.method === 'cue-points' && !waitingForQuiet && (tagger.running || bulkPassRunning())) return res.status(409).json({error:'Wait for library preparation to finish or pause for quiet time before preparing this cue preview.'});
  if (previewBusy) return res.status(409).json({ error: 'Another transition preview is being prepared. Try again shortly.' });
  const abort = new AbortController();
  const cancel = () => abort.abort();
  res.once('close', cancel);
  previewBusy = true;
  try {
    const state = subbeatsStore.read();
    let tracks = parsed.data.trackIds.map(id => state.jobs.find(j => j.id === id));
    if (tracks[0]?.id === tracks[1]?.id || tracks.some(j => j?.status !== 'prepared' || !j.bundleKey)) throw new Error('Choose two different prepared tracks.');
    const cueMode = parsed.data.method === 'cue-points';
    if (!cueMode && parsed.data.mixStyle && parsed.data.mixStyle !== 'long-blend') throw new Error('Mixing styles require a cue-point preview.');
    const autoPlan = parsed.data.autoPlan === true;
    if (parsed.data.handoff && (!cueMode || !autoPlan)) throw new Error('Complete handoffs require automatic cue-point planning.');
    if (parsed.data.handoff && parsed.data.cueIndices) throw new Error('Complete handoffs use the shared pair plan. Remove the manual cue override.');
    if (autoPlan && !cueMode) throw new Error('Automatic transition planning requires cue-point preview mode.');
    if (cueMode && (parsed.data.matched || parsed.data.referenceBars !== undefined || parsed.data.barShift !== 0)) throw new Error('Cue-point previews use saved cue choices. Reset the bar shift and match selection.');
    let cueIndices = parsed.data.cueIndices ?? [0,0];
    if (cueMode && !autoPlan && tracks.some(track => !track?.cuePoints?.algorithmVersion || track.cuePoints.algorithmVersion < 5)) throw new Error('Rescan both tracks with Beat This! for the new phrase preview.');
    if (cueMode && !autoPlan && (!tracks[0]?.cuePoints?.outgoing[cueIndices[0]!] || !tracks[1]?.cuePoints?.incoming[cueIndices[1]!])) throw new Error('Recheck both tracks with a Beat This! preparation method and choose saved cue points.');
    await library.load();
    await blocklist.load();
    const songs = parsed.data.trackIds.map(id => db.getTrack(id));
    for (const track of songs) {
      if (!track || blocklist.hitOf(track)) throw new Error('A selected track is unavailable or blocked. Choose another pair.');
    }
    if (cueMode && !autoPlan) {
      const duration = tracks[0]!.cuePoints!.durationSeconds ?? songs[0]?.durationSec;
      const seconds = tracks[0]!.cuePoints!.outgoing[cueIndices[0]!]!.sourceSeconds;
      if (!duration || seconds < duration*.5 || seconds >= duration) {
        throw new Error('Choose an outgoing cue in the second half. Recheck preparation if the saved cues are older.');
      }
    }
    let reference;
    if (parsed.data.referenceBars !== undefined) {
      const [outgoing, incoming] = parsed.data.trackIds.map(id => subbeatsReferences.find(ref => ref.id === id));
      if (!outgoing || !incoming || !incoming.introBars.includes(parsed.data.referenceBars)) throw new Error('Choose an annotated pair and a suitable intro length.');
      if (parsed.data.barShift !== 0) throw new Error('Annotated previews use the saved release point. Reset the bar shift.');
      reference = { out_seconds: outgoing.outroStart, in_resolve: incoming.introResolve,
        bars: parsed.data.referenceBars, out_id: outgoing.id, in_id: incoming.id };
    }
    const windowPlan = parsed.data.matched ? (await matchSubbeats(tracks as typeof state.jobs, parsed.data.trackIds[0]!, parsed.data.barShift)).matches.find(match => match.id === parsed.data.trackIds[1])?.plan : undefined;
    if (parsed.data.matched && !windowPlan) throw new Error('The saved measurements no longer match. Find matches again.');
    let handoff;
    let mixStyle = parsed.data.mixStyle ?? 'long-blend';
    if (autoPlan) mixStyle = subbeatsHarmonicChoice(songs[0]!,songs[1]!).mixStyle;
    if (parsed.data.handoff) {
      const assessment = await assessSubbeatsPair(parsed.data.trackIds[0]!,parsed.data.trackIds[1]!);
      const candidate = assessment.plan.plans[0];
      if (!candidate) throw new Error(assessment.plan.reason);
      if (parsed.data.mixStyle && parsed.data.mixStyle !== assessment.plan.mixStyle) {
        throw new Error('Complete handoffs currently use the automatically planned mixing style. Omit the style override.');
      }
      const snapshot = subbeatsPairSnapshot(parsed.data.trackIds[0]!,parsed.data.trackIds[1]!);
      if (snapshot.evidenceFingerprint !== assessment.evidenceFingerprint) throw new Error('The prepared evidence changed. Retry planning.');
      tracks = parsed.data.trackIds.map(id => snapshot.jobs.find(job => job.id === id));
      cueIndices = [candidate.outgoingCueIndex,candidate.incomingCueIndex];
      mixStyle = assessment.plan.mixStyle;
      handoff = {version:1 as const,evidenceFingerprint:assessment.evidenceFingerprint,candidate};
    }
    const gains = await Promise.all(songs.map(song => resolveGainDb(song && { ...song })));
    const preview = await previewSubbeats(tracks[0]!.bundleKey!, tracks[1]!.bundleKey!, config.stateDir, subbeatsStore.cacheId(), abort.signal, gains.map(gain => gain ?? 0), parsed.data.barShift, reference, {stems_root:stemCache.stemsRoot(), track_ids:parsed.data.trackIds, ...(windowPlan ? {window_plan:windowPlan} : {}),
      ...(cueMode ? {method:'cue-points' as const,auto_plan:handoff ? false : autoPlan,mix_style:mixStyle,...(handoff ? {handoff} : {}),
        lyric_evidence:withSubbeatsLyrics(tracks as typeof state.jobs,config.stateDir).map(track => track.lyricEvidence ?? null),
        cue_keys:tracks.map(track => track?.cuePoints?.algorithmVersion && track.cuePoints.algorithmVersion >= 5 ? track.cuePoints.artifactKey : null),
        cue_indices:cueIndices,coverage_keys:tracks.map(track => track?.cueCoverage?.artifactKey ?? null),
        ...(autoPlan ? {crossfade_seconds:settings.get().crossfadeDuration,
          equal_power_crossfade:settings.get().transitions?.equalPowerCrossfade === true} : {})} : {})});
    if (handoff && subbeatsPairSnapshot(parsed.data.trackIds[0]!,parsed.data.trackIds[1]!).evidenceFingerprint !== handoff.evidenceFingerprint) {
      throw new Error('The prepared evidence changed during rendering. Retry the handoff preview.');
    }
    if (!abort.signal.aborted) {
      if (preview.timeline) res.set('X-Subbeats-Timeline', JSON.stringify(preview.timeline).replace(/[^\x00-\x7F]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`)).set('Access-Control-Expose-Headers', 'X-Subbeats-Timeline');
      res.set('Cache-Control', 'no-store').type('audio/wav').send(preview.audio);
    }
  } catch (error) {
    if (!abort.signal.aborted) res.status(400).json({ error: error instanceof Error ? error.message : 'Preview could not be prepared.' });
  } finally { previewBusy = false; res.off('close', cancel); }
});

// No cache walk on a read: use the stored measurement and one filesystem stat.
router.get('/library/subbeats/cache', requireAdmin, async (_req, res) => {
  try {
    const online = await stemCache.stemsRootStatus({ readOnly: true });
    const disk = online.online ? await statfs(stemCache.stemsRoot()).catch(() => null) : null;
    res.json({ policy: readSubbeatsStemPolicy(), budgetBytes: stemCache.budgetBytes(),
      usage: await stemCache.storedUsage(),
      disk: disk && { total: disk.blocks * disk.bsize, available: disk.bavail * disk.bsize } });
  } catch { res.status(503).json({ error: 'Stem cache details could not be read. Saved policy has been kept.' }); }
});
router.post('/library/subbeats/cache', requireAdmin, validateBody(subbeatsStemPolicyPatchSchema), async (req, res) => {
  if (subbeatsRemovalRunning()) return res.status(409).json({error:'Wait for entry removal to finish before changing cache choices'});
  await library.load();
  if (req.body.track?.include && !db.getTrack(req.body.track.id)) return res.status(400).json({ error: 'Track is no longer in the library' });
  if (req.body.enabled === true && req.body.confirmCleanup !== true) return res.status(400).json({error:'Confirm the seven-day stem cleanup before enabling it'});
  try {
    const policy = updateSubbeatsStemPolicy(req.body);
    startSubbeatsCleanup();
    res.json(policy);
  }
  catch { res.status(503).json({ error: 'Cache policy could not be saved. Retry shortly.' }); }
});

router.get('/library/subbeats/cache/cleanup', requireAdmin, (_req, res) => res.json(subbeatsCleanupState()));
router.post('/library/subbeats/cache/estimate', requireAdmin, async (_req, res) => {
  if (subbeatsRemovalRunning()) return res.status(409).json({error:'Wait for entry removal to finish'});
  await library.load();
  try { startSubbeatsCleanupEstimate(); res.status(202).json(subbeatsCleanupState()); }
  catch (error) { res.status(409).json({error:error instanceof Error ? error.message : 'A cache scan is already running'}); }
});
router.post('/library/subbeats/cache/cleanup', requireAdmin, async (_req, res) => {
  if (subbeatsRemovalRunning()) return res.status(409).json({error:'Wait for entry removal to finish'});
  await library.load();
  try { startSubbeatsCleanup(); res.status(202).json(subbeatsCleanupState()); }
  catch { res.status(409).json({error:'Cleanup could not start'}); }
});
