import express from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { validateBody } from '../../middleware/validate.js';
import { subbeatsEnqueueSchema, subbeatsPauseSchema } from '../../schemas/subbeats.js';
import * as db from '../../music/library-db.js';
import * as library from '../../music/library.js';
import { subbeatsStore, kickSubbeats } from '../../music/subbeats-manager.js';
import { subbeatsCapability } from '../../music/analyzer.js';
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
