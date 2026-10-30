import express from 'express';
import { config } from '../../config.js';
import { resolveGainDb } from '../../music/loudness.js';
import * as blocklist from '../../music/blocklist.js';
import { requireAdmin } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { subbeatsEnqueueSchema, subbeatsPauseSchema, subbeatsPreviewSchema } from '../../schemas/subbeats.js';
import * as db from '../../music/library-db.js';
import * as library from '../../music/library.js';
import { subbeatsStore, kickSubbeats } from '../../music/subbeats-manager.js';
import { previewSubbeats, subbeatsCapability } from '../../music/analyzer.js';
import { tagger } from '../../broadcast/tagger.js';

export const router = express.Router();
const view = () => ({ ...subbeatsStore.read(), capable: subbeatsCapability(),
  maintenanceRunning: tagger.running, progress: tagger.running ? tagger.progress?.label ?? null : null });

router.get('/library/subbeats', requireAdmin, (_req, res) => {
  try { res.json(view()); }
  catch { res.status(503).json({ error: 'The Sub/Beats preparation list could not be read' }); }
});
router.get('/library/subbeats/candidates', requireAdmin, async (req, res) => {
  await library.load();
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 200) : '';
  const offset = Math.max(0, Math.min(1000000, Number(req.query.offset) || 0));
  res.json(db.subbeatsCandidates(q, Math.floor(offset)));
});
router.post('/library/subbeats/queue', requireAdmin, validateBody(subbeatsEnqueueSchema), async (req, res) => {
  await library.load();
  const tracks = [...new Set<string>(req.body.ids)].map(id => db.getTrack(id));
  if (tracks.some(t => !t)) return res.status(400).json({ error: 'Some tracks are no longer in the library' });
  try {
    subbeatsStore.enqueue(tracks.map(t => ({ id: t!.id, title: t!.title ?? '', artist: t!.artist ?? '', album: t!.album ?? '' })));
    kickSubbeats();
    res.status(202).json(view());
  } catch (error) { res.status(409).json({ error: error instanceof Error ? error.message : String(error) }); }
});
router.post('/library/subbeats/pause', requireAdmin, validateBody(subbeatsPauseSchema), (req, res) => {
  try {
    subbeatsStore.pause(req.body.paused);
    if (!req.body.paused) kickSubbeats();
    res.json(view());
  } catch { res.status(503).json({ error: 'The preparation list could not be saved' }); }
});

let previewBusy = false;
router.post('/library/subbeats/join-preview', requireAdmin, async (req, res) => {
  const parsed = subbeatsPreviewSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Choose two prepared tracks.' });
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
    const gains = await Promise.all(songs.map(song => resolveGainDb(song && { ...song })));
    const preview = await previewSubbeats(tracks[0]!.bundleKey!, tracks[1]!.bundleKey!, config.stateDir, subbeatsStore.cacheId(), abort.signal, gains.map(gain => gain ?? 0), parsed.data.barShift);
    if (!abort.signal.aborted) {
      if (preview.timeline) res.set('X-Subbeats-Timeline', JSON.stringify(preview.timeline)).set('Access-Control-Expose-Headers', 'X-Subbeats-Timeline');
      res.set('Cache-Control', 'no-store').type('audio/wav').send(preview.audio);
    }
  } catch (error) {
    if (!abort.signal.aborted) res.status(400).json({ error: error instanceof Error ? error.message : 'Preview could not be prepared.' });
  } finally { previewBusy = false; res.off('close', cancel); }
});
