// Upgrade an already selected pair using saved Sub/Beats evidence. Every veto
// loses only this upgrade; the queue continues through ordinary Stem Blend.
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { lstat, readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { parseWav } from '../audio/wav-edges.js';
import * as settings from '../settings.js';
import * as analyzer from '../music/analyzer.js';
import * as loudness from '../music/loudness.js';
import * as stemCache from '../music/stem-cache.js';
import { subbeatsPairSnapshot } from '../music/subbeats-pair.js';
import { getRawStreamUrl } from '../music/subsonic.js';
import { bulkPassRunning } from '../music/tagger-lock.js';
import { separationInFlight } from './pick-stems.js';
import { renderStandsDown } from './pick-stems-policy.js';
import { DRAIN_DEADLINE_SEC, HARD_DEADLINE_SEC } from './drain-policy.js';
import { clipSeamCues, CLIP_SEAM_CROSS_SEC } from './stem-seam.js';
import type { BlendPlan, BlendTrack } from './stem-blend.js';
import type { SubbeatsPlayback } from './subbeats-clock.js';

let busy = false;

const MAX_RENDER_MS = 120_000;
const COMMIT_MARGIN_SEC = 10;
const READINESS_CHECK_MS = 5000;

// Keep the ordinary selection allowance, then add the live render's ceiling
// and commit reserve. A full two-minute render cannot fit inside the ordinary
// two-minute pick window after selection has already consumed part of it.
export function subbeatsPickLeadSeconds(renderTimeoutMs: number): number {
  const selectionSec = DRAIN_DEADLINE_SEC - HARD_DEADLINE_SEC;
  return Math.max(DRAIN_DEADLINE_SEC,
    selectionSec + Math.min(MAX_RENDER_MS, renderTimeoutMs) / 1000 + HARD_DEADLINE_SEC + COMMIT_MARGIN_SEC);
}

export function subbeatsStillCurrent(playback: SubbeatsPlayback): boolean {
  try {
    return settings.get().transitions.subbeatsLive === true
      && settings.get().transitions.pairDrain !== false && !!settings.getEffectivePersona()?.djMode
      && JSON.stringify(settings.get().loudness) === playback.loudnessSettings
      && subbeatsPairSnapshot(playback.outgoingId, playback.incomingId).evidenceFingerprint === playback.evidenceFingerprint;
  } catch { return false; }
}

export async function discardSubbeatsClips(blend: Pick<BlendPlan,'clipPath'|'leadPath'>) {
  await Promise.all([blend.clipPath,blend.leadPath].filter((p): p is string => !!p)
    .map(p => unlink(p).catch(() => {})));
}

export async function maybeRenderSubbeats(
  outTrack: BlendTrack, inTrack: BlendTrack, remainingSec: number | null,
  opts: { outCapped?: boolean; outTrimEndSec?: number | null; inHeadTrimmed?: boolean;
    outCueInSec?: number; valid: () => boolean;
    log: (message: string, meta?: Record<string, unknown>) => void },
): Promise<BlendPlan | null> {
  if (settings.get().transitions.subbeatsLive !== true) return null;
  const fallback = (reason: string) => { opts.log(`Sub/Beats fallback: ${reason}`, {
    subbeats:'fallback',reason,outgoingId:outTrack.id,incomingId:inTrack.id,
  }); return null; };
  if (!outTrack.id || !inTrack.id || outTrack.id === inTrack.id) return fallback('The pair needs two library tracks.');
  if (settings.get().transitions.pairDrain === false || !settings.getEffectivePersona()?.djMode) return fallback('DJ mode and pair-aware transitions are required.');
  if (opts.outCapped) return fallback('A track-length cap or show boundary owns this transition.');
  if (opts.inHeadTrimmed) return fallback('The incoming track has a silence trim.');
  if (busy || bulkPassRunning() || renderStandsDown({separating:separationInFlight(),backend:analyzer.backendLabel(),
    concurrency:config.analyzer.concurrency})) return fallback('Analysis is busy.');
  const windowMs = remainingSec == null ? 0 : Math.floor((remainingSec - HARD_DEADLINE_SEC - COMMIT_MARGIN_SEC) * 1000);
  const budgetMs = Math.min(MAX_RENDER_MS,config.analyzer.renderTimeoutMs,windowMs);
  if (budgetMs < 10_000) return fallback('There is insufficient time before the queue deadline.');
  busy = true;
  const deadlineMs = Date.now()+budgetMs;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(),budgetMs);
  const check = setInterval(() => {
    try { if (!opts.valid() || settings.get().transitions.subbeatsLive !== true) abort.abort(); }
    catch { abort.abort(); }
  },100);
  let result: BlendPlan | null = null;
  let keep = false;
  let rejectAbort: (() => void) | undefined;
  let readinessTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    const before = subbeatsPairSnapshot(outTrack.id,inTrack.id);
    if (before.jobs.length !== 2 || before.jobs.some(job => job.status !== 'prepared' || !job.bundleKey || !job.cueCoverage)) {
      return fallback('Both tracks need completed saved Sub/Beats coverage.');
    }
    const loudnessSettings = JSON.stringify(settings.get().loudness);
    const interrupted = new Promise<never>((_,reject) => {
      rejectAbort = () => reject(new Error('The handoff was cancelled or exceeded its budget.'));
      abort.signal.addEventListener('abort',rejectAbort,{once:true});
    });
    if (analyzer.subbeatsCapability() !== true) {
      // Probe inside the existing commitment budget, so a healthy cold
      // controller can use this pair. The whole wait remains cancellable;
      // readiness cannot consume more than five seconds of render time.
      const ready = await Promise.race([
        analyzer.subbeatsAvailable().catch(() => false),
        new Promise<false>(resolve => { readinessTimer = setTimeout(() => resolve(false), READINESS_CHECK_MS); }),
        interrupted,
      ]);
      clearTimeout(readinessTimer);
      if (!ready) return fallback('The Sub/Beats analyzer could not confirm readiness within its check window.');
    }
    const gains = await Promise.race([Promise.all([
      typeof outTrack.gainDb === 'number' ? outTrack.gainDb : loudness.resolveGainDb(outTrack),
      loudness.resolveGainDb(inTrack),
    ]),interrupted]);
    abort.signal.throwIfAborted();
    opts.log(`Sub/Beats attempt: ${outTrack.title} → ${inTrack.title} (${before.mixStyle})`,{subbeats:'attempt'});
    const gainsDb = gains.map(gain => gain ?? 0);
    const rendered = await analyzer.renderSubbeatsLive({version:1,transitionId:randomUUID(),deadlineMs,
      stateDir:config.stateDir,cacheId:readFileSync(join(config.stateDir,'subbeats','.cache-id'),'utf8').trim(),
      stemsRoot:stemCache.stemsRoot(),jobs:before.jobs,outgoingId:outTrack.id,incomingId:inTrack.id,
      sourceUrls:[outTrack.id,inTrack.id].map(id => getRawStreamUrl(id)),gainsDb,
      mixStyle:before.mixStyle,evidenceFingerprint:before.evidenceFingerprint},abort.signal);
    if (rendered.status === 'unavailable') return fallback(rendered.reason);
    const timing = rendered.candidate.timing;
    const cues = clipSeamCues({blendStartSec:timing.outgoingStartSample/44100,inCueSec:timing.incomingResumeSample/44100},CLIP_SEAM_CROSS_SEC,44100);
    result = {clipPath:rendered.clipPath,...(rendered.leadPath ? {leadPath:rendered.leadPath} : {}),
      clipSec:timing.clipFrames/44100,...cues,subbeats:{version:1,transitionId:rendered.transitionId,
        outgoingId:outTrack.id,incomingId:inTrack.id,evidenceFingerprint:before.evidenceFingerprint,
        mixStyle:rendered.mixStyle,timing,loudnessSettings,gainsDb,
        clipPath:rendered.clipPath,leadPath:rendered.leadPath,
        incomingDurationSeconds:before.jobs.find(job => job.id === inTrack.id)!.cuePoints!.durationSeconds!}};
    if (!opts.valid() || !subbeatsStillCurrent(result.subbeats!) || abort.signal.aborted) return fallback('The pair or saved evidence changed during rendering.');
    if (cues.outCueSec <= Math.max(10,(opts.outCueInSec ?? 0)+1)
      || (opts.outTrimEndSec != null && opts.outTrimEndSec < cues.outCueSec)) return fallback('The handoff conflicts with an existing cue or trim.');
    for (const file of [rendered.clipPath,rendered.leadPath].filter((p):p is string => !!p)) {
      const stat = await lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 44 || stat.size > 48*1024*1024) return fallback('A lossless handoff part is unavailable.');
      const wav = parseWav(await readFile(file,{signal:abort.signal}));
      const frames = file === rendered.clipPath ? timing.clipFrames-timing.incomingEntryFrame
        : timing.incomingEntryFrame+Math.round(CLIP_SEAM_CROSS_SEC*44100);
      if (!wav || wav.fmt.audioFormat !== 3 || wav.fmt.channels !== 2 || wav.fmt.sampleRate !== 44100
        || wav.fmt.bitsPerSample !== 32 || wav.dataLen !== frames*8) return fallback('A lossless handoff part has invalid format or duration.');
    }
    abort.signal.throwIfAborted();
    opts.log(`Sub/Beats rendered: ${before.mixStyle}, ${((timing.incomingRate-1)*100).toFixed(2)}% tempo, ${timing.loop ? 'drum loop' : 'no loop'}`,
      {subbeats:'rendered',transitionId:rendered.transitionId,style:before.mixStyle,vocal:rendered.candidate.vocal});
    keep = true;
    return result;
  } catch { return fallback('The handoff was unavailable, cancelled or exceeded its time budget.'); }
  finally {
    clearTimeout(timer);clearTimeout(readinessTimer);clearInterval(check);
    if (rejectAbort) abort.signal.removeEventListener('abort',rejectAbort);
    if (result && !keep) await discardSubbeatsClips(result);
    busy = false;
  }
}
