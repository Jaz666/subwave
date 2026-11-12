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
import { spawn } from 'node:child_process';
import { createReadStream, lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { requireAdmin } from '../middleware/auth.js';
import { queue } from '../broadcast/queue.js';
import { config } from '../config.js';
import * as subsonic from '../music/subsonic.js';
import { createFileFormatLookup, type FileFormat } from '../music/file-format.js';
import * as settings from '../settings.js';
import * as stemCache from '../music/stem-cache.js';
import { readSubbeatsQueue } from '../music/subbeats-store.js';
import type { SubbeatsTiming } from '../broadcast/subbeats-clock.js';
import { fetchWithTimeout } from '../util/fetch-timeout.js';

type NowPlaying = { subsonic_id?: string | null; [k: string]: unknown } | null | undefined;
const VISUAL_STEMS = ['vocals', 'drums', 'bass', 'other'] as const;
type VisualStem = typeof VISUAL_STEMS[number];
type VisualStemSide = 'outgoing' | 'incoming';
type StemSource = { path: string; startSec: number; endSec: number | null; storageGain: number };
type VisualTransition = {
  kind: 'stem-blend' | 'subbeats'; durationSec: number; incomingAtSec: number; outgoingUntilSec: number;
  incomingAiredAt?: string;
  outgoingId?: string; incomingId?: string;
  mixStyle?: 'long-blend' | 'short-exchange' | 'bass-swap' | 'drums-first';
  gainsDb?: [number, number]; timing?: SubbeatsTiming; periodSec?: number;
  outgoingGainDb?: number; incomingGainDb?: number;
  sources?: { outgoing: Omit<StemSource, 'path'>; incoming: Omit<StemSource, 'path'> };
};

const PEAK_SAMPLE_RATE = 8_000;
const PEAK_BIN_SAMPLES = 800; // one peak per 100 ms
const PEAK_FRAME_BYTES = 4; // two 16-bit channels; retain the louder channel, as WaveSurfer does
const PEAK_CACHE_MAX = 128;
const PEAK_PCM_MAX_BYTES = 64 * 1024 * 1024;
type WaveformPeaks = { durationSec: number; peaks: number[] };
const waveformPeakCache = new Map<string, WaveformPeaks>();
const waveformPeakPending = new Map<string, Promise<WaveformPeaks>>();

export function waveformPeaksFromPcm(pcm: Buffer): WaveformPeaks {
  const sampleCount = Math.floor(pcm.length / PEAK_FRAME_BYTES);
  const peaks: number[] = [];
  for (let start = 0; start < sampleCount; start += PEAK_BIN_SAMPLES) {
    let peak = 0;
    const end = Math.min(sampleCount, start + PEAK_BIN_SAMPLES);
    for (let i = start; i < end; i++) {
      const offset = i * PEAK_FRAME_BYTES;
      peak = Math.max(peak, Math.abs(pcm.readInt16LE(offset)) / 32768,
        Math.abs(pcm.readInt16LE(offset + 2)) / 32768);
    }
    peaks.push(peak);
  }
  return { durationSec: sampleCount / PEAK_SAMPLE_RATE, peaks };
}

async function decodeWaveformPeaks(body: AsyncIterable<Uint8Array>, signal: AbortSignal, maxInputBytes: number): Promise<WaveformPeaks> {
  const decoder = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-map', '0:a:0', '-vn',
    '-ac', '2', '-ar', String(PEAK_SAMPLE_RATE), '-f', 's16le', 'pipe:1'], { signal });
  const chunks: Buffer[] = [];
  let outputBytes = 0;
  let inputBytes = 0;
  const stderr: Buffer[] = [];
  let stderrBytes = 0;
  decoder.stderr.on('data', (chunk: Buffer) => {
    if (stderrBytes < 16_384) {
      const kept = chunk.subarray(0, 16_384 - stderrBytes);
      stderr.push(kept);
      stderrBytes += kept.length;
    }
  });
  const output = (async () => {
    for await (const chunk of decoder.stdout) {
      outputBytes += chunk.length;
      if (outputBytes > PEAK_PCM_MAX_BYTES) throw new Error('The recording is too long to visualize.');
      chunks.push(Buffer.from(chunk));
    }
  })();
  const closed = new Promise<void>((resolve, reject) => {
    decoder.once('error', reject);
    decoder.once('close', code => code === 0 ? resolve()
      : reject(new Error(Buffer.concat(stderr).toString('utf8').trim() || `ffmpeg exited with ${code}`)));
  });
  const input = pipeline(async function* () {
    for await (const chunk of body) {
      inputBytes += chunk.length;
      if (inputBytes > maxInputBytes) throw new Error('The recording is too large to visualize.');
      yield chunk;
    }
  }, decoder.stdin);
  try {
    await Promise.all([output, input, closed]);
    const result = waveformPeaksFromPcm(Buffer.concat(chunks));
    if (!(result.durationSec > 0)) throw new Error('The recording has no usable audio.');
    return result;
  } catch (error) {
    decoder.kill('SIGKILL');
    throw error;
  }
}

async function makeWaveformPeaks(id: string, signal: AbortSignal,
  streamAudio: (id: string, signal: AbortSignal) => Promise<Response>): Promise<WaveformPeaks> {
  const source = await streamAudio(id, signal);
  const type = source.headers.get('content-type')?.toLowerCase() ?? '';
  if (!source.ok || !source.body || type.includes('json') || type.includes('xml') || type.startsWith('text/')) {
    throw new Error('The recording could not be loaded.');
  }
  if (Number(source.headers.get('content-length')) > 256 * 1024 * 1024) {
    throw new Error('The recording is too large to visualize.');
  }
  return decodeWaveformPeaks(source.body as unknown as AsyncIterable<Uint8Array>, signal, 256 * 1024 * 1024);
}

function cachedWaveformPeaks(id: string, load: () => Promise<WaveformPeaks>): Promise<WaveformPeaks> {
  const cached = waveformPeakCache.get(id);
  if (cached) {
    waveformPeakCache.delete(id);
    waveformPeakCache.set(id, cached);
    return Promise.resolve(cached);
  }
  const pending = waveformPeakPending.get(id);
  if (pending) return pending;
  const task = load().then(value => {
    waveformPeakCache.set(id, value);
    if (waveformPeakCache.size > PEAK_CACHE_MAX) waveformPeakCache.delete(waveformPeakCache.keys().next().value!);
    return value;
  }).finally(() => waveformPeakPending.delete(id));
  waveformPeakPending.set(id, task);
  return task;
}

function regularStemSource(id: string, side: VisualStemSide, stem: VisualStem): StemSource | null {
  const window = side === 'outgoing' ? 'tail' : 'head';
  const folder = stemCache.dirFor(id);
  try {
    if (!lstatSync(folder).isDirectory()) return null;
    const file = stemCache.stemPath(id, window, stem);
    if (!lstatSync(file).isFile()) return null;
    const metaPath = path.join(folder, 'tail-meta.json');
    if (side !== 'outgoing') return { path: file, startSec: 0, endSec: null, storageGain: 1 };
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { tail_start_sec?: number; duration_sec?: number };
    if (!Number.isFinite(meta.tail_start_sec) || !Number.isFinite(meta.duration_sec)) return null;
    return { path: file, startSec: meta.tail_start_sec!, endSec: meta.duration_sec!, storageGain: 1 };
  } catch { return null; }
}

async function stemSource(id: string, side: VisualStemSide, stem: VisualStem, subbeats: boolean): Promise<StemSource | null> {
  if (subbeats) {
    const window = side === 'outgoing' ? 'tail' : 'head';
    const job = readSubbeatsQueue(config.stateDir).jobs.find(item => item.id === id);
    const region = await stemCache.subbeatsCachedRegion(id, window, job);
    if (region) return {
      path: path.join(region.subbeatsBundleDir, `${window === 'tail' ? 'exit' : 'head'}-${stem}.flac`),
      startSec: region.startSec, endSec: region.endSec, storageGain: region.storageGain,
    };
  }
  return regularStemSource(id, side, stem);
}

export function createNowPlayingFileRouter(deps: {
  nowPlaying: () => Promise<NowPlaying>;
  lookup: (id: string) => Promise<FileFormat | null>;
  streamAudio?: (id: string, signal: AbortSignal) => Promise<Response>;
  nextTrackId?: () => string | null;
  latestJingle?: () => { filename?: string; startedAt?: number; durationSec?: number; queuedSec?: number; placement?: string } | null;
  latestBed?: () => { filename?: string; startedAt?: number; durationSec?: number | string } | null;
  stemTransition?: (currentId: string) => VisualTransition | null | Promise<VisualTransition | null>;
  preparedSpeech?: () => boolean;
  speechPreparing?: () => boolean;
  speechForecasts?: () => Array<{ voiceId: string; expectedAt: string; durationMs: number; text: string }>;
  stemSource?: (id: string, side: VisualStemSide, stem: VisualStem, subbeats: boolean) => StemSource | null | Promise<StemSource | null>;
  waveformPeaks?: (id: string, signal: AbortSignal) => Promise<WaveformPeaks>;
  stemWaveformPeaks?: (source: StemSource, signal: AbortSignal) => Promise<WaveformPeaks>;
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
  // Audio for the current library track or queue head only. The caller must
  // name one of those ids, preventing this from becoming an arbitrary
  // Navidrome proxy when the queue changes between polling and load.
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
    const nextId = deps.nextTrackId?.() ?? null;
    if (!asked || (asked !== id && asked !== nextId)) {
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
      const source = await deps.streamAudio(asked, abort.signal);
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
  // Test-page waveform data is generated on first request and held in a small
  // process-local LRU. The live Dash keeps using /now-playing/audio unchanged.
  router.get('/now-playing/waveform-peaks', requireAdmin, async (req, res) => {
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
    const nextId = deps.nextTrackId?.() ?? null;
    if (!asked || (asked !== id && asked !== nextId)) {
      res.status(409).json({ error: 'The requested track is no longer on air.' });
      return;
    }
    const abort = new AbortController();
    try {
      const peaks = await cachedWaveformPeaks(asked, () => deps.waveformPeaks
        ? deps.waveformPeaks!(asked, abort.signal)
        : deps.streamAudio ? makeWaveformPeaks(asked, abort.signal, deps.streamAudio)
          : Promise.reject(new Error('On-air audio is unavailable.')));
      if (!res.destroyed) res.set('Cache-Control', 'no-store').json(peaks);
    } catch {
      if (!abort.signal.aborted && !res.headersSent) res.status(502).json({ error: 'Could not prepare the waveform.' });
    } finally {
      abort.abort();
    }
  });
  router.get('/now-playing/stem-audio', requireAdmin, async (req, res) => {
    const side = req.query.side;
    const stem = req.query.stem;
    if ((side !== 'outgoing' && side !== 'incoming') || !VISUAL_STEMS.includes(stem as VisualStem)) {
      res.status(400).json({ error: 'Choose a valid stem and transition side.' });
      return;
    }
    let currentId: string | null = null;
    try {
      const np = await deps.nowPlaying();
      currentId = typeof np?.subsonic_id === 'string' && np.subsonic_id ? np.subsonic_id : null;
    } catch { /* treated as nothing on air */ }
    if (!currentId) {
      res.status(404).json({ error: 'No library track is on air.' });
      return;
    }
    const askedOutgoing = typeof req.query.outgoingId === 'string' ? req.query.outgoingId : currentId;
    const transition = await deps.stemTransition?.(askedOutgoing);
    const nextId = deps.nextTrackId?.() ?? null;
    const expectedId = side === 'outgoing' ? transition?.outgoingId : transition?.incomingId;
    const currentPair = transition?.outgoingId === currentId && transition?.incomingId === nextId;
    const activePair = transition?.incomingId === currentId && transition?.kind === 'subbeats';
    if (!transition || !expectedId || (!currentPair && !activePair) || askedOutgoing !== transition.outgoingId) {
      res.status(409).json({ error: 'The stem transition is no longer current.' });
      return;
    }
    const source = await (deps.stemSource ?? stemSource)(expectedId, side, stem as VisualStem, transition.kind === 'subbeats');
    if (!source) {
      res.status(404).json({ error: 'The prepared stem waveform is unavailable.' });
      return;
    }
    try {
      const stat = lstatSync(source.path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 44 || stat.size > 64 * 1024 * 1024) {
        res.status(404).json({ error: 'The prepared stem waveform is unavailable.' });
        return;
      }
      res.set({ 'Cache-Control': 'no-store', 'Content-Type': 'audio/flac' });
      await pipeline(createReadStream(source.path), res);
    } catch {
      if (!res.headersSent) res.status(404).json({ error: 'The prepared stem waveform is unavailable.' });
      else if (!res.destroyed) res.destroy();
    }
  });
  router.get('/now-playing/stem-waveform-peaks', requireAdmin, async (req, res) => {
    const side = req.query.side;
    const stem = req.query.stem;
    if ((side !== 'outgoing' && side !== 'incoming') || !VISUAL_STEMS.includes(stem as VisualStem)) {
      res.status(400).json({ error: 'Choose a valid stem and transition side.' });
      return;
    }
    let currentId: string | null = null;
    try {
      const np = await deps.nowPlaying();
      currentId = typeof np?.subsonic_id === 'string' && np.subsonic_id ? np.subsonic_id : null;
    } catch { /* treated as nothing on air */ }
    if (!currentId) {
      res.status(404).json({ error: 'No library track is on air.' });
      return;
    }
    const askedOutgoing = typeof req.query.outgoingId === 'string' ? req.query.outgoingId : currentId;
    const transition = await deps.stemTransition?.(askedOutgoing);
    const nextId = deps.nextTrackId?.() ?? null;
    const expectedId = side === 'outgoing' ? transition?.outgoingId : transition?.incomingId;
    const currentPair = transition?.outgoingId === currentId && transition?.incomingId === nextId;
    const activePair = transition?.incomingId === currentId && transition?.kind === 'subbeats';
    if (!transition || !expectedId || (!currentPair && !activePair) || askedOutgoing !== transition.outgoingId) {
      res.status(409).json({ error: 'The stem transition is no longer current.' });
      return;
    }
    const source = await (deps.stemSource ?? stemSource)(expectedId, side, stem as VisualStem, transition.kind === 'subbeats');
    if (!source) {
      res.status(404).json({ error: 'The prepared stem waveform is unavailable.' });
      return;
    }
    try {
      const stat = lstatSync(source.path);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 44 || stat.size > 64 * 1024 * 1024) {
        res.status(404).json({ error: 'The prepared stem waveform is unavailable.' });
        return;
      }
      const cacheKey = `stem:${source.path}:${stat.size}:${stat.mtimeMs}`;
      const abort = new AbortController();
      try {
        const peaks = await cachedWaveformPeaks(cacheKey, () => deps.stemWaveformPeaks
          ? deps.stemWaveformPeaks(source, abort.signal)
          : decodeWaveformPeaks(createReadStream(source.path), abort.signal, 64 * 1024 * 1024));
        if (!res.destroyed) res.set('Cache-Control', 'no-store').json({ ...peaks, startSec: source.startSec,
          endSec: source.endSec, storageGain: source.storageGain });
      } finally {
        abort.abort();
      }
    } catch {
      if (!res.headersSent) res.status(502).json({ error: 'Could not prepare the stem waveform.' });
      else if (!res.destroyed) res.destroy();
    }
  });
  router.get('/now-playing/visual-events', requireAdmin, async (req, res) => {
    const asked = typeof req.query.id === 'string' && req.query.id ? req.query.id : null;
    let id: string | null = null;
    try {
      const np = await deps.nowPlaying();
      id = typeof np?.subsonic_id === 'string' && np.subsonic_id ? np.subsonic_id : null;
    } catch { /* treated as nothing on air */ }
    let stemTransition: VisualTransition | null = null;
    try { if (asked) stemTransition = await deps.stemTransition?.(asked) ?? null; }
    catch { /* no usable transition */ }
    const bufferedPair = stemTransition?.kind === 'subbeats'
      && stemTransition.outgoingId === asked && stemTransition.incomingId === id;
    if (!id || (asked !== id && !bufferedPair)) {
      res.status(id ? 409 : 404).json({ jingle: null });
      return;
    }
    let jingle: { airedAt: string; durationMs: number; filename?: string } | null = null;
    let bed: { airedAt: string; durationMs?: number; filename?: string } | null = null;
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
    try {
      const marker = deps.latestBed?.();
      const startedAt = Number(marker?.startedAt) * 1000;
      const duration = Number(marker?.durationSec) * 1000;
      if (Number.isFinite(startedAt) && startedAt > 0) {
        bed = { airedAt: new Date(startedAt).toISOString(),
          ...(Number.isFinite(duration) && duration > 0 ? { durationMs: duration } : {}), filename: marker?.filename };
      }
    } catch { /* no usable marker */ }
    let preparedSpeech = false;
    try { preparedSpeech = deps.preparedSpeech?.() ?? false; }
    catch { /* no prepared-speech indicator */ }
    let speechPreparing = false;
    try { speechPreparing = deps.speechPreparing?.() ?? false; }
    catch { /* no speech-preparing indicator */ }
    let speechForecasts: Array<{ voiceId: string; expectedAt: string; durationMs: number; text: string }> = [];
    try { speechForecasts = deps.speechForecasts?.() ?? []; }
    catch { /* no speech forecasts */ }
    res.set('Cache-Control', 'no-store').json({ jingle, bed, stemTransition, preparedSpeech, speechPreparing, speechForecasts });
  });
  return router;
}

export async function nowPlayingStemTransition(currentId: string): Promise<VisualTransition | null> {
  let outgoing = queue.current;
  let incoming = queue.upcoming[0];
  const remaining = queue.remainingSecOnAir();
  let incomingAtMs = remaining == null ? NaN : Date.now() + remaining * 1000;
  // The incoming metadata arrives while the mixed clip still has audio left.
  // Retain that one adjacent pair through the maximum 60-second listener buffer.
  const previous = queue.history[0];
  const active = previous?.stemBlend?.subbeats;
  const entryMs = Date.parse(queue.current?.startedAt ?? '');
  if (active && queue.current?.subbeatsHandoff?.transitionId === active.transitionId
    && Date.now() < entryMs + ((active.timing.clipFrames - active.timing.incomingEntryFrame) / active.timing.sampleRate + 60) * 1000) {
    outgoing = previous;
    incoming = queue.current;
    incomingAtMs = entryMs;
  }
  const blend = outgoing?.stemBlend;
  if (![outgoing?.track?.id, incoming?.track?.id].includes(currentId) || !incoming?.stemSeam || !blend) return null;
  if (!outgoing?.track?.id || !incoming.track?.id) return null;
  const timing = blend.subbeats?.timing;
  const durationSec = Number(blend.clipSec) || (timing ? timing.clipFrames / timing.sampleRate : 0);
  if (!(durationSec > 0)) return null;
  const ids = { outgoingId: outgoing.track.id, incomingId: incoming.track.id };
  const sourceInfo = async (side: VisualStemSide) => {
    const id = side === 'outgoing' ? ids.outgoingId : ids.incomingId;
    const source = await stemSource(id, side, 'drums', !!timing);
    return source ? { startSec: source.startSec, endSec: source.endSec, storageGain: source.storageGain } : undefined;
  };
  const [outgoingSource, incomingSource] = await Promise.all([sourceInfo('outgoing'), sourceInfo('incoming')]);
  const sources = { outgoing: outgoingSource, incoming: incomingSource };
  const trackGains = {
    outgoingGainDb: Number(outgoing.track.gainDb) || 0,
    incomingGainDb: Number(incoming.track.gainDb) || 0,
  };
  if (timing) {
    return {
      kind: 'subbeats',
      ...(Number.isFinite(incomingAtMs) ? { incomingAiredAt: new Date(incomingAtMs).toISOString() } : {}),
      durationSec,
      incomingAtSec: timing.incomingEntryFrame / timing.sampleRate,
      outgoingUntilSec: timing.outgoingEndFrame / timing.sampleRate,
      ...ids,
      mixStyle: blend.subbeats!.mixStyle,
      gainsDb: [blend.subbeats!.gainsDb[0] ?? 0, blend.subbeats!.gainsDb[1] ?? 0],
      timing,
      ...trackGains,
      ...(sources.outgoing && sources.incoming ? { sources: { outgoing: sources.outgoing, incoming: sources.incoming } } : {}),
    };
  }
  // The regular rendered blend has no published internal handoff frame.
  // Show its duration and the short clip seam as an estimate.
  const seam = Math.min(0.3, durationSec / 4);
  const middle = durationSec / 2;
  return { kind: 'stem-blend', durationSec,
    incomingAtSec: middle - seam / 2, outgoingUntilSec: middle + seam / 2,
    ...ids, ...trackGains,
    ...(sources.outgoing && sources.incoming ? { sources: { outgoing: sources.outgoing, incoming: sources.incoming } } : {}),
  };
}

export const router = createNowPlayingFileRouter({
  nowPlaying: () => queue.getNowPlaying(),
  lookup: createFileFormatLookup({ getSong: subsonic.getSong }),
  streamAudio: (id, signal) => fetchWithTimeout(subsonic.getRawStreamUrl(id), {
    timeoutMs: 5 * 60_000, bodyDeadline: true, signal,
  }),
  nextTrackId: () => queue.upcoming[0]?.track?.id || null,
  preparedSpeech: () => queue.hasPreparedSpeech(),
  speechPreparing: () => queue.speechPreparing(),
  speechForecasts: () => queue.speechForecasts(),
  latestJingle: () => {
    try { return JSON.parse(readFileSync(config.liquidsoap.jinglePlayingFile, 'utf8')); }
    catch { return null; }
  },
  latestBed: () => {
    try { return JSON.parse(readFileSync(config.liquidsoap.bedPlayingFile, 'utf8')); }
    catch { return null; }
  },
  stemTransition: nowPlayingStemTransition,
  crossfadeSeconds: () => Number(settings.get()?.crossfadeDuration) || 10,
});
