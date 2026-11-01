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
import { subbeatsStemPolicyPatchSchema, subbeatsBrowseQuerySchema, subbeatsEnqueueSchema, subbeatsPauseSchema, subbeatsPreviewSchema } from '../../schemas/subbeats.js';
import * as db from '../../music/library-db.js';
import * as library from '../../music/library.js';
import { subbeatsStore, kickSubbeats } from '../../music/subbeats-manager.js';
import { previewSubbeats, subbeatsCapability } from '../../music/analyzer.js';
import { tagger } from '../../broadcast/tagger.js';
import { subbeatsReferences } from '../../music/subbeats-references.js';

export const router = express.Router();
const view = () => ({ ...subbeatsStore.read(), capable: subbeatsCapability(),
  maintenanceRunning: tagger.running, progress: tagger.running ? tagger.progress?.label ?? null : null,
  references: subbeatsReferences });

router.get('/library/subbeats', requireAdmin, (_req, res) => {
  try { res.json(view()); }
  catch { res.status(503).json({ error: 'The Sub/Beats preparation list could not be read' }); }
});
router.get('/library/subbeats/candidates', requireAdmin, async (req, res) => {
  await library.load();
  const parsed = subbeatsBrowseQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Choose valid Sub/Beats filters.' });
  try {
    const { q, offset, ...filters } = parsed.data;
    res.json(db.subbeatsCandidates(q, offset, filters, subbeatsStore.read().jobs));
  } catch { res.status(503).json({ error: 'Tracks could not be loaded. Retry shortly.' }); }
});
router.post('/library/subbeats/queue', requireAdmin, validateBody(subbeatsEnqueueSchema), async (req, res) => {
  if (subbeatsRemovalRunning()) return res.status(409).json({error:'Wait for entry removal to finish'});
  await library.load();
  if (subbeatsRemovalRunning()) return res.status(409).json({error:'Wait for entry removal to finish'});
  const tracks = [...new Set<string>(req.body.ids)].map(id => db.getTrack(id));
  if (tracks.some(t => !t)) return res.status(400).json({ error: 'Some tracks are no longer in the library' });
  try {
    subbeatsStore.enqueue(tracks.map(t => ({ id: t!.id, title: t!.title ?? '', artist: t!.artist ?? '', album: t!.album ?? '' })));
    kickSubbeats();
    res.status(202).json(view());
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
});
router.post('/library/subbeats/assess', requireAdmin, validateBody(subbeatsEnqueueSchema), (req,res) => {
  if (subbeatsRemovalRunning()) return res.status(409).json({error:'Wait for entry removal to finish'});
  try { subbeatsStore.assess(req.body.ids); kickSubbeats(); res.status(202).json(view()); }
  catch (error) { res.status(409).json({error:error instanceof Error ? error.message : 'Suitability checks could not be queued'}); }
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
  if (previewBusy) return res.status(409).json({ error: 'Another transition preview is being prepared. Try again shortly.' });
  const abort = new AbortController();
  const cancel = () => abort.abort();
  res.once('close', cancel);
  previewBusy = true;
  try {
    const state = subbeatsStore.read();
    const tracks = parsed.data.trackIds.map(id => state.jobs.find(j => j.id === id));
    if (tracks[0]?.id === tracks[1]?.id || tracks.some(j => j?.status !== 'prepared' || !j.bundleKey)) throw new Error('Choose two different prepared tracks.');
    await library.load();
    await blocklist.load();
    const songs = parsed.data.trackIds.map(id => db.getTrack(id));
    for (const track of songs) {
      if (!track || blocklist.hitOf(track)) throw new Error('A selected track is unavailable or blocked. Choose another pair.');
    }
    let reference;
    if (parsed.data.referenceBars !== undefined) {
      const [outgoing, incoming] = parsed.data.trackIds.map(id => subbeatsReferences.find(ref => ref.id === id));
      if (!outgoing || !incoming || !incoming.introBars.includes(parsed.data.referenceBars)) throw new Error('Choose an annotated pair and a suitable intro length.');
      if (parsed.data.barShift !== 0) throw new Error('Annotated previews use the saved release point. Reset the bar shift.');
      reference = { out_seconds: outgoing.outroStart, in_resolve: incoming.introResolve,
        bars: parsed.data.referenceBars, out_id: outgoing.id, in_id: incoming.id };
    }
    const gains = await Promise.all(songs.map(song => resolveGainDb(song && { ...song })));
    const preview = await previewSubbeats(tracks[0]!.bundleKey!, tracks[1]!.bundleKey!, config.stateDir, subbeatsStore.cacheId(), abort.signal, gains.map(gain => gain ?? 0), parsed.data.barShift, reference, {stems_root:stemCache.stemsRoot(), track_ids:parsed.data.trackIds});
    if (!abort.signal.aborted) {
      if (preview.timeline) res.set('X-Subbeats-Timeline', JSON.stringify(preview.timeline)).set('Access-Control-Expose-Headers', 'X-Subbeats-Timeline');
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
