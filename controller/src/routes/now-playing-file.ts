// GET /now-playing/file: the playing file's own format, for the Dash.
//
// Admin-only by choice, not by sensitivity: it is an operator detail, and the
// public /now-playing shape every listener polls stays exactly as it was.
// Answers for the track ON AIR only (no arbitrary-id lookup), so it can never
// become a generic Navidrome proxy. `?id=` names the track the Dash is
// showing, and is only compared: when a different track is on air the answer
// carries that track's id and a null format, with no lookup, so an answer the
// Dash caches under one track is always about that track.
//
//   200 { id: string, format: FileFormat | null }   a library track (format
//                                                    null = Navidrome did not
//                                                    answer, or ?id= named a
//                                                    track no longer on air)
//   200 { id: null, format: null }                   no library song on record:
//                                                    boot before the first one,
//                                                    the stream idled down, or
//                                                    a song with no library id
//
// The track on air is the song now-playing.json names, which is also the
// Dash's title. A jingle, bed or pause-talk break never writes that file, so
// while one airs the answer is still the song before it, as the title is.

import { Router } from 'express';
import { readFileSync } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { requireAdmin } from '../middleware/auth.js';
import { queue } from '../broadcast/queue.js';
import { config } from '../config.js';
import * as subsonic from '../music/subsonic.js';
import { createFileFormatLookup, type FileFormat } from '../music/file-format.js';
import * as settings from '../settings.js';
import { fetchWithTimeout } from '../util/fetch-timeout.js';

type NowPlaying = { subsonic_id?: string | null; [k: string]: unknown } | null | undefined;

export function createNowPlayingFileRouter(deps: {
  nowPlaying: () => Promise<NowPlaying>;
  lookup: (id: string) => Promise<FileFormat | null>;
  streamAudio?: (id: string, signal: AbortSignal) => Promise<Response>;
  latestJingle?: () => { filename?: string; startedAt?: number; durationSec?: number; queuedSec?: number; placement?: string } | null;
  crossfadeSeconds?: () => number;
}): Router {
  const router = Router();
  router.get('/now-playing/file', requireAdmin, async (req, res) => {
    let id: string | null = null;
    try {
      const np = await deps.nowPlaying();
      id = typeof np?.subsonic_id === 'string' && np.subsonic_id ? np.subsonic_id : null;
    } catch { /* treated as nothing on air */ }
    const asked = typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
    if (!id || (asked && asked !== id)) {
      res.json({ id, format: null });
      return;
    }
    let format: FileFormat | null = null;
    try { format = await deps.lookup(id); } catch { /* null: the lookup fails open */ }
    res.json({ id, format });
  });
  // Audio for the current library track only. The caller must name the id it
  // saw in /now-playing, preventing this endpoint from becoming an arbitrary
  // Navidrome proxy when the station changes tracks between polling and load.
  router.get('/now-playing/audio', requireAdmin, async (req, res) => {
    const asked = typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
    let id: string | null = null;
    try {
      const np = await deps.nowPlaying();
      id = typeof np?.subsonic_id === 'string' && np.subsonic_id ? np.subsonic_id : null;
    } catch { /* treated as nothing on air */ }
    if (!id) {
      res.status(404).json({ error: 'No library track is on air.' });
      return;
    }
    if (asked !== id) {
      res.status(409).json({ error: 'The requested track is no longer on air.' });
      return;
    }
    if (!deps.streamAudio) {
      res.status(501).json({ error: 'On-air audio is unavailable.' });
      return;
    }

    const abort = new AbortController();
    const cancel = () => abort.abort();
    res.on('close', cancel);
    try {
      const source = await deps.streamAudio(id, abort.signal);
      const type = source.headers.get('content-type')?.toLowerCase() ?? '';
      if (!source.ok || !source.body || type.includes('json') || type.includes('xml') || type.startsWith('text/')) {
        throw new Error('The on-air recording could not be loaded.');
      }
      const maxBytes = 256 * 1024 * 1024;
      if (Number(source.headers.get('content-length')) > maxBytes) throw new Error('The recording is too large to visualize.');
      res.set('Cache-Control', 'no-store').type(type || 'application/octet-stream');
      await pipeline((async function* () {
        let bytes = 0;
        for await (const chunk of source.body as unknown as AsyncIterable<Uint8Array>) {
          bytes += chunk.length;
          if (bytes > maxBytes) throw new Error('The recording is too large to visualize.');
          yield chunk;
        }
      })(), res);
    } catch {
      if (!abort.signal.aborted && !res.headersSent) res.status(502).json({ error: 'Could not load the on-air recording.' });
      else if (!res.destroyed) res.destroy();
    } finally {
      abort.abort();
      res.off('close', cancel);
    }
  });
  router.get('/now-playing/visual-events', requireAdmin, async (req, res) => {
    const asked = typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
    let id: string | null = null;
    try {
      const np = await deps.nowPlaying();
      id = typeof np?.subsonic_id === 'string' && np.subsonic_id ? np.subsonic_id : null;
    } catch { /* treated as nothing on air */ }
    if (!id || asked !== id) {
      res.status(id ? 409 : 404).json({ jingle: null });
      return;
    }
    let jingle = null;
    try {
      const marker = deps.latestJingle?.();
      const startedAt = Number(marker?.startedAt) * 1000;
      const durationMs = Number(marker?.durationSec) * 1000;
      if (Number.isFinite(startedAt) && startedAt > 0 && Number.isFinite(durationMs) && durationMs > 0) {
        const delayMs = marker?.placement === 'over'
          ? 0
          : ((Number(marker?.queuedSec) || 0) + (deps.crossfadeSeconds?.() ?? 10)) * 1000;
        jingle = {
          airedAt: new Date(startedAt + delayMs).toISOString(),
          durationMs,
          filename: marker?.filename,
        };
      }
    } catch { /* no usable marker */ }
    res.set('Cache-Control', 'no-store').json({ jingle });
  });
  return router;
}

export const router = createNowPlayingFileRouter({
  nowPlaying: () => queue.getNowPlaying(),
  lookup: createFileFormatLookup({ getSong: subsonic.getSong }),
  streamAudio: (id, signal) => fetchWithTimeout(subsonic.getRawStreamUrl(id), {
    timeoutMs: 5 * 60_000, bodyDeadline: true, signal,
  }),
  latestJingle: () => {
    try { return JSON.parse(readFileSync(config.liquidsoap.jinglePlayingFile, 'utf8')); }
    catch { return null; }
  },
  crossfadeSeconds: () => Number(settings.get()?.crossfadeDuration) || 10,
});
