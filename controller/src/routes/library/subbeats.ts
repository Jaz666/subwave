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
import { subbeatsCueMatchQuerySchema, subbeatsMatchQuerySchema, subbeatsStemPolicyPatchSchema, subbeatsBrowseQuerySchema, subbeatsEnqueueSchema, subbeatsPauseSchema, subbeatsPreviewSchema } from '../../schemas/subbeats.js';
import * as db from '../../music/library-db.js';
import * as library from '../../music/library.js';
import { subbeatsStore, kickSubbeats } from '../../music/subbeats-manager.js';
import { matchSubbeatsCues, matchSubbeats, previewSubbeats, subbeatsCapability } from '../../music/analyzer.js';
import { tagger } from '../../broadcast/tagger.js';
import { bulkPassRunning } from '../../music/tagger-lock.js';
import { subbeatsReferences } from '../../music/subbeats-references.js';
import { pipeline } from 'node:stream/promises';
import * as subsonic from '../../music/subsonic.js';
import { fetchWithTimeout } from '../../util/fetch-timeout.js';
import * as settings from '../../settings.js';

export const router = express.Router();
const view = () => ({ ...subbeatsStore.read(), capable: subbeatsCapability(),
  maintenanceRunning: tagger.running, progress: tagger.running ? tagger.progress?.label ?? null : null,
  references: subbeatsReferences });

router.get('/library/subbeats', requireAdmin, (_req, res) => {
  try { res.json(view()); }
  catch { res.status(503).json({ error: 'The Sub/Beats preparation list could not be read' }); }
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
    res.set('Cache-Control','no-store').json(await matchSubbeatsCues(jobs,parsed.data.outgoingId,parsed.data.outgoingCueIndex));
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
  if (parsed.data.method === 'cue-points' && (tagger.running || bulkPassRunning())) return res.status(409).json({error:'Wait for library preparation to finish before preparing this cue preview.'});
  if (previewBusy) return res.status(409).json({ error: 'Another transition preview is being prepared. Try again shortly.' });
  const abort = new AbortController();
  const cancel = () => abort.abort();
  res.once('close', cancel);
  previewBusy = true;
  try {
    const state = subbeatsStore.read();
    const tracks = parsed.data.trackIds.map(id => state.jobs.find(j => j.id === id));
    if (tracks[0]?.id === tracks[1]?.id || tracks.some(j => j?.status !== 'prepared' || !j.bundleKey)) throw new Error('Choose two different prepared tracks.');
    const cueMode = parsed.data.method === 'cue-points';
    const autoPlan = parsed.data.autoPlan === true;
    if (autoPlan && !cueMode) throw new Error('Automatic transition planning requires cue-point preview mode.');
    if (cueMode && (parsed.data.matched || parsed.data.referenceBars !== undefined || parsed.data.barShift !== 0)) throw new Error('Cue-point previews use saved cue choices. Reset the bar shift and match selection.');
    const cueIndices = parsed.data.cueIndices ?? [0,0];
    if (cueMode && !autoPlan && tracks.some(track => track?.cuePoints?.algorithmVersion !== 5)) throw new Error('Rescan both tracks with Beat This! for the new phrase preview.');
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
    const gains = await Promise.all(songs.map(song => resolveGainDb(song && { ...song })));
    const preview = await previewSubbeats(tracks[0]!.bundleKey!, tracks[1]!.bundleKey!, config.stateDir, subbeatsStore.cacheId(), abort.signal, gains.map(gain => gain ?? 0), parsed.data.barShift, reference, {stems_root:stemCache.stemsRoot(), track_ids:parsed.data.trackIds, ...(windowPlan ? {window_plan:windowPlan} : {}),
      ...(cueMode ? {method:'cue-points' as const,auto_plan:autoPlan,
        cue_keys:tracks.map(track => track?.cuePoints?.algorithmVersion === 5 ? track.cuePoints.artifactKey : null),
        cue_indices:cueIndices,coverage_keys:tracks.map(track => track?.cueCoverage?.artifactKey ?? null),
        ...(autoPlan ? {crossfade_seconds:settings.get().crossfadeDuration,
          equal_power_crossfade:settings.get().transitions?.equalPowerCrossfade === true} : {})} : {})});
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
