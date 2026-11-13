// Isolated upstream regular Stem Blend auditions. No cache admission, stem
// separation, live-queue mutation or Sub/Beats coverage reuse happens here.
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { requireAdmin } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import * as db from '../music/library-db.js';
import * as library from '../music/library.js';
import * as blocklist from '../music/blocklist.js';
import * as stemCache from '../music/stem-cache.js';
import { resolveGainDb } from '../music/loudness.js';
import { previewStemBlend } from '../music/analyzer.js';
import { stemBlendPreviewRequestSchema } from '../schemas/stem-blend-preview.js';
import { mapPool } from '../util/async-pool.js';
import { tagger } from '../broadcast/tagger.js';

export const router = Router();
const querySchema = z.object({ q: z.string().max(200).default(''),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0) });

router.get('/stems/blend-preview/tracks', requireAdmin, async (req, res) => {
  const query = querySchema.safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Choose a valid track search and page.' });
  try {
    await library.load();
    await blocklist.load();
    const page = db.stemBlendPreviewTracks([...await stemCache.cachedTrackIdSet()], query.data.q, query.data.offset);
    const rows = await mapPool(page.rows, 4, async row => {
      const track = db.getTrack(row.id);
      if (!track || blocklist.hitOf(track)) return null;
      const [head, tail] = await Promise.all([stemCache.hasWindow(row.id, 'head'), stemCache.hasWindow(row.id, 'tail')]);
      return { ...row, head, tail, headGrid: (track.bars?.length ?? 0) >= 7,
        tailGrid: (track.outro?.bars?.length ?? 0) >= 2 };
    });
    res.set('Cache-Control', 'no-store').json({ ...page, rows: rows.filter(row => row !== null) });
  } catch { res.status(503).json({ error: 'Cached tracks could not be read. Try again shortly.' }); }
});

let busy = false;
router.post('/stems/blend-preview', requireAdmin, validateBody(stemBlendPreviewRequestSchema), async (req, res) => {
  if (busy) return res.status(409).json({ error: 'Another Stem Blend audition is being prepared. Try again shortly.' });
  if (tagger.running && tagger.progress?.waitingForQuiet !== true) return res.status(409).json({ error: 'Pause Library Analysis before preparing an audition.' });
  const abort = new AbortController();
  const cancel = () => abort.abort();
  res.once('close', cancel);
  busy = true;
  try {
    await library.load();
    await blocklist.load();
    const [outId, inId] = req.body.trackIds as [string, string];
    const out = db.getTrack(outId), inn = db.getTrack(inId);
    if (!out || !inn || blocklist.hitOf(out) || blocklist.hitOf(inn)) throw new Error('Choose two available library tracks.');
    if (!out.durationSec || !out.outro?.bars?.length || !inn.bars?.length) throw new Error('The pair needs saved outgoing tail bars and incoming head bars. Run Library Analysis first.');
    if (!(await stemCache.hasWindow(outId, 'tail')) || !(await stemCache.hasWindow(inId, 'head'))) throw new Error('This baseline needs regular outgoing tail stems and regular incoming head stems. Sub/Beats coverage is not substituted.');
    const gains = await Promise.all([resolveGainDb({ ...out }), resolveGainDb({ ...inn })]);
    const preview = await previewStemBlend({
      out: { stems_dir: stemCache.dirFor(outId), duration_s: out.durationSec,
        outro: { start_ms: out.outro.startMs, bars: out.outro.bars }, gain_db: gains[0] ?? 0 },
      in: { stems_dir: stemCache.dirFor(inId), bars: inn.bars, gain_db: gains[1] ?? 0 },
    }, config.stateDir, req.body.mode, abort.signal);
    if (!abort.signal.aborted) res.set('Cache-Control', 'no-store')
      .set('X-Stem-Blend-Report', JSON.stringify(preview.report))
      .set('Access-Control-Expose-Headers', 'X-Stem-Blend-Report')
      .type('audio/wav').send(preview.audio);
  } catch (error) {
    if (!abort.signal.aborted) res.status(400).json({ error: error instanceof Error ? error.message : 'The Stem Blend audition could not be prepared.' });
  } finally { busy = false; res.off('close', cancel); }
});
