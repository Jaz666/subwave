// Render cache-hit stem transitions and return outgoing/incoming cue points shifted by the
// seam overlap. Any miss or failure returns null for the normal pair-aware crossfade.
// docs/stem-transitions-research.md.

import path from 'node:path';
import { regularStemBlendsEnabled, regularStemWorkingMode } from './regular-stem-mode.js';
import { createHash, randomUUID } from 'node:crypto';
import { readRegularStemPreview, type RegularStemPreview } from './regular-stem-preview.js';
import { readdir, stat, unlink } from 'node:fs/promises';
import { config } from '../config.js';
import * as settings from '../settings.js';
import * as analyzer from '../music/analyzer.js';
import * as db from '../music/library-db.js';
import * as library from '../music/library.js';
import * as loudness from '../music/loudness.js';
import * as stemCache from '../music/stem-cache.js';
import { preparedRegularTail } from '../music/regular-tail-grid.js';
import { bulkPassRunning } from '../music/tagger-lock.js';
import { separationInFlight } from './pick-stems.js';
import { renderStandsDown } from './pick-stems-policy.js';
import { HARD_DEADLINE_SEC } from './drain-policy.js';
import { CLIP_SEAM_CROSS_SEC, clipSeamCues, type ClipSeamCues } from './stem-seam.js';
import type { SubbeatsPlayback } from './subbeats-clock.js';
import { regularStemRuntime } from './regular-stem-runtime.js';

// Cross length at the two clip seams (X→clip, clip→Y); the overlap arithmetic
// lives with it in broadcast/stem-seam.ts.
export { CLIP_SEAM_CROSS_SEC };

export type RegularStemBlendStyle = 'drums-late' | 'rhythm-late' | 'vocals-late';
const REGULAR_TEST_STYLES: RegularStemBlendStyle[] = ['drums-late', 'rhythm-late', 'vocals-late'];

interface RegularStemTestPair { out: string; in: string }

function regularStemTestPairs(): RegularStemTestPair[] {
  try {
    const parsed: unknown = JSON.parse(process.env.SUBWAVE_REGULAR_STEM_TEST_PAIRS ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((pair): pair is RegularStemTestPair =>
      !!pair && typeof pair.out === 'string' && !!pair.out
      && typeof pair.in === 'string' && !!pair.in);
  } catch {
    return [];
  }
}

export function regularStemTestEnabled(): boolean { return regularStemWorkingMode() || regularStemTestPairs().length > 0; }

export function regularStemTestTrack(id: string): boolean {
  return regularStemWorkingMode() || regularStemTestPairs().some(pair => pair.out === id || pair.in === id);
}

export function regularStemTestStyle(outId: string, inId: string): RegularStemBlendStyle | null {
  if (regularStemWorkingMode()) return REGULAR_TEST_STYLES[createHash('sha256').update(JSON.stringify([outId,inId])).digest()[0] % REGULAR_TEST_STYLES.length];
  const index = regularStemTestPairs().findIndex((pair) => pair.out === outId && pair.in === inId);
  return index < 0 ? null : REGULAR_TEST_STYLES[index % REGULAR_TEST_STYLES.length];
}

// Only identity fields and loudness inputs are read here.
export type BlendTrack = loudness.LoudnessTrack & {
  title?: string | null;
  gainDb?: number;
};

export interface BlendPlan extends ClipSeamCues {
  regular?: RegularStemPreview;
  clipPath: string;
  clipSec: number;
  leadPath?: string;
  subbeats?: SubbeatsPlayback;
}

function transitionsDir(): string {
  return path.join(config.stateDir, 'transitions');
}

// bars/outro/lufs are never on the slim track objects, so they resolve from
// library.db here. The outgoing `outro` comes from library.get()'s projection,
// the one place music/tail-levels.ts applies transitions.tailFromCurve, so the
// blend reads the same tail level readings (`startMs`, `lufs`) as the queue's
// ending, exit canvas and audible-end cut. Off, that projection is the stored
// outro, so a blend reads exactly what it did.
export function blendSides(outId: string, inId: string) {
  const out = db.getTrack(outId);
  const inn = db.getTrack(inId);
  if (!out || !inn) return null;
  return { out: { ...out, outro: library.get(outId)?.outro ?? out.outro }, inn };
}

async function renderBlend(
  outTrack: BlendTrack,
  inTrack: BlendTrack,
  remainingSec: number | null,
  opts: {
    outCapped?: boolean;
    outTrimEndSec?: number | null;
    inHeadTrimmed?: boolean;
    regularStyle?: RegularStemBlendStyle;
    workingSources?: { tail: { stemsDir: string; regularKey: string }; head: { stemsDir: string; regularKey: string } };
    log?: (kind: 'warn', message: string) => void;
  } = {},
): Promise<BlendPlan | null> {
  const reject = (reason: string): null => {
    if (opts.regularStyle) opts.log?.('warn', `Regular stems fallback: ${reason}`);
    return null;
  };
  const s = settings.get();
  if (!regularStemBlendsEnabled()) return reject('stem blends are disabled');
  if (s?.transitions?.pairDrain === false) return reject('pair drain is disabled');
  if (!settings.getEffectivePersona()?.djMode) return reject('DJ mode is disabled');
  if (!outTrack?.id || !inTrack?.id) return reject('track identity is missing');
  if (opts.outCapped) return reject('the outgoing track is capped or cut at a show boundary');
  // Dead-air trim veto (music/silence-trim.ts). The incoming head is
  // unconditional: the clip is rendered from the successor's head window starting
  // at zero, so a trimmed leading blank would be baked into the seam.
  if (opts.inHeadTrimmed) return reject('the incoming head has a silence trim');
  // A bulk pass holds the single-flight analyzer worker for minutes; a render would
  // only time out behind it. The pidfile is that pass's own lock.
  if (bulkPassRunning()) return reject('a library analysis pass is running');

  const sides = blendSides(outTrack.id, inTrack.id);
  if (!sides) return reject('library analysis is missing');
  const { out, inn } = sides;
  const outro = (opts.regularStyle && preparedRegularTail(outTrack.id, (out.durationSec ?? 0) * 1000))
    || out.outro;
  // The renderer rechecks marker coverage against the extracted audio.
  if (!outro?.bars?.length || !out.durationSec || !inn.bars?.length) return reject('a measured head or tail grid is missing');
  if (opts.regularStyle && (outro.bars.length < 9 || inn.bars.length < 9)) {
    return reject(`eight bars need nine markers (outgoing ${outro.bars.length}, incoming ${inn.bars.length})`);
  }
  // Legacy starts after the wind-down. Regular uses the span before it
  // and checks the actual cue against the silence trim after rendering.
  if (!opts.regularStyle && opts.outTrimEndSec != null && opts.outTrimEndSec <= outro.startMs / 1000) {
    return reject('the outgoing silence trim cuts the blend region');
  }
  // Cache-hit-only: both windows must already be separated.
  const [outStems, inStems] = opts.workingSources ? [opts.workingSources.tail, opts.workingSources.head] : await Promise.all([
    stemCache.renderSource(outTrack.id, 'tail'),
    stemCache.renderSource(inTrack.id, 'head'),
  ]);
  if (!outStems || !inStems) return reject('separated source windows are missing');
  // A pick-time separation (broadcast/pick-stems.ts) holds a worker for a
  // minute or more. Only a cache hit gets this far, so this costs exactly the
  // seams that would have blended; with one worker the render would lose the
  // blend anyway, after holding the sender for its whole budget, and a spare
  // pool member serves it at once (pick-stems-policy.ts renderStandsDown).
  if (renderStandsDown({
    separating: separationInFlight(),
    backend: analyzer.backendLabel(),
    concurrency: config.analyzer.concurrency,
    sidecarConcurrency: analyzer.sidecarConcurrency(),
  })) return reject('another separation is using the analyzer');

  // The render must lose the race to the drain's hard fallback, so it gets the
  // window to the hard deadline minus a write/stamp margin, capped by the render
  // budget. An unknown clock vetoes outright: the sender is blocked while it runs.
  if (remainingSec == null) return reject('the handoff clock is unknown');
  const windowMs = Math.floor((remainingSec - HARD_DEADLINE_SEC - 5) * 1000);
  if (windowMs < 3000) return reject('the render deadline is too close');
  const timeoutMs = Math.min(config.analyzer.renderTimeoutMs, windowMs);

  // Level match (#1240). The clip carries no liq_amplify of its own, so the render
  // bakes in the same dB the station would apply to each side — resolved through
  // music/loudness.ts, never re-derived from the analyzer's LUFS (which ignores
  // ReplayGain tags and both caps). Resolving the incoming side here also caches
  // its ReplayGain answer onto the track object for its own drain.
  const outGainDb = typeof outTrack.gainDb === 'number'
    ? outTrack.gainDb
    : await loudness.resolveGainDb(outTrack);
  const inGainDb = await loudness.resolveGainDb(inTrack);

  let renderFailure = 'the analyzer returned no usable transition';
  const result = await analyzer.renderTransition({
    out: {
      stems_dir: outStems.stemsDir,
      ...('regularKey' in outStems && typeof outStems.regularKey === 'string' ? { regular_key: outStems.regularKey } : {}),
      ...('subbeatsBundleDir' in outStems ? {
        subbeats_bundle_dir: outStems.subbeatsBundleDir,
        subbeats_bundle_key: outStems.subbeatsBundleKey,
      } : {}),
      // Advisory only: the worker aligns the tail window from the stems' own
      // tail-meta.json, and treats stems without that sidecar as a cache miss.
      duration_s: out.durationSec,
      outro: {
        start_ms: outro.startMs,
        bars: outro.bars,
        lufs: outro.lufs ?? null,
      },
      // gain_db is what the worker uses; lufs stays on the wire so an older
      // analyzer image still renders.
      gain_db: outGainDb,
      lufs: out.loudnessLufs ?? null,
    },
    in: {
      stems_dir: inStems.stemsDir,
      ...('regularKey' in inStems && typeof inStems.regularKey === 'string' ? { regular_key: inStems.regularKey } : {}),
      ...('subbeatsBundleDir' in inStems ? {
        subbeats_bundle_dir: inStems.subbeatsBundleDir,
        subbeats_bundle_key: inStems.subbeatsBundleKey,
      } : {}),
      bars: inn.bars,
      gain_db: inGainDb,
      lufs: inn.loudnessLufs ?? null,
    },
    out_dir: transitionsDir(),
    clip_name: `${path.basename(String(outTrack.id))}-${path.basename(String(inTrack.id))}${opts.regularStyle ? `-${randomUUID()}` : ''}.wav`,
    ...(opts.regularStyle ? { regular_style: opts.regularStyle } : {}),
    target_lufs: s?.loudness?.targetLufs ?? -14,
  }, { timeoutMs, onFailure: reason => { renderFailure = reason; } });
  if (!result) return reject(renderFailure);

  // The worker's points are where the clip starts and ends; the stamped cues
  // sit one seam overlap outside them so each crossfade mixes the same instant
  // of the music on both sides (broadcast/stem-seam.ts).
  const cues = clipSeamCues(result);
  // Cue points must sit inside their tracks and leave real audio either side.
  if (!(result.blendStartSec > 10 && cues.outCueSec < out.durationSec)) return reject('the rendered outgoing cue falls outside the track');
  if (!(result.inCueSec > 1 && result.clipSec > 2)) return reject('the rendered incoming cue or clip is too short');
  // cue_outs arbitrate as earliest-wins, so a trimmed end before the extended
  // cue would cut X before the seam overlap (or the clip's source region) plays.
  if (opts.outTrimEndSec != null && opts.outTrimEndSec < cues.outCueSec) return reject('the outgoing trim cuts the rendered cue');
  return {
    ...(opts.regularStyle ? { regular: { id: path.basename(result.path), gainsDb: [outGainDb ?? 0, inGainDb ?? 0].map(db => Math.max(-12, Math.min(12, db))) as [number, number], style: opts.regularStyle,
      outgoingStartSec: result.blendStartSec, incomingStartSec: result.inCueSec-result.clipSec } } : {}),
    clipPath: result.path,
    ...cues,
    clipSec: result.clipSec,
  };
}

// Age sweep for orphaned clips. Age alone is not proof: a clip can out-age the
// window behind a long track, so `keep` (queue.pendingClipPaths()) is skipped
// regardless of age.
export async function cleanupOldClips(
  keep: Set<string> = new Set(),
  maxAgeMs = 60 * 60 * 1000,
): Promise<number> {
  let removed = 0;
  try {
    const dir = transitionsDir();
    const now = Date.now();
    for (const f of await readdir(dir)) {
      if (keep.has(f)) continue; // queued for a seam that hasn't aired yet
      try {
        const p = path.join(dir, f);
        const st = await stat(p);
        if (st.isFile() && now - st.mtimeMs > maxAgeMs) {
          await unlink(p);
          removed += 1;
        }
      } catch { /* file vanished mid-sweep */ }
    }
  } catch { /* no transitions dir yet */ }
  return removed;
}

// New-style renders consume only this queue's verified working windows. Hold
// both source leases until the independent transition WAV has been written.
export async function maybeRenderBlend(
  out: BlendTrack, incoming: BlendTrack, remaining: number | null,
  opts: Omit<NonNullable<Parameters<typeof renderBlend>[3]>, 'workingSources'> = {},
): Promise<BlendPlan | null> {
  if (!opts.regularStyle) return regularStemWorkingMode() ? null : renderBlend(out, incoming, remaining, opts);
  // A library refresh can replace timing/source evidence without changing
  // the queue objects. Recheck it after the async render, before arming.
  const evidence=() => JSON.stringify([out.id,incoming.id].map(id => {
    const row=db.getTrack(String(id));
    const outro=library.get(String(id))?.outro ?? row?.outro;
    return [row?.durationSec,row?.bpm,row?.bars,row?.gridProvenance,outro,
      id === out.id ? preparedRegularTail(String(id), (row?.durationSec ?? 0) * 1000) : null];
  }));
  const before=evidence();
  const sources = await regularStemRuntime.sources(String(out.id), String(incoming.id));
  if (!sources) {
    const pair = regularStemRuntime.pair(String(out.id), String(incoming.id));
    const states = pair ? ` (tail ${regularStemRuntime.lane.state(pair.tail.key)}, head ${regularStemRuntime.lane.state(pair.head.key)})` : ' (pair not admitted or role evidence missing)';
    opts.log?.('warn', `Regular stems fallback: working windows not ready at handoff${states}`);
    return null;
  }
  let completed = false;
  try {
    const result = await renderBlend(out, incoming, remaining, { ...opts, workingSources: sources });
    completed = !!result;
    if (result?.regular) result.regular.envelopes = {
      outgoing: await readRegularStemPreview(sources.tail, 'tail'),
      incoming: await readRegularStemPreview(sources.head, 'head'),
    };
    if (result && (!sources.valid() || evidence() !== before)) {
      await unlink(result.clipPath).catch(() => {});
      opts.log?.('warn','regular stem test: queue or analysis changed during render; using ordinary transition');
      return null;
    }
    return result;
  } finally { await sources.release(completed); }
}
