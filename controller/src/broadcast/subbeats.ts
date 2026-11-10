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
import { HARD_DEADLINE_SEC } from './drain-policy.js';
import { clipSeamCues, CLIP_SEAM_CROSS_SEC } from './stem-seam.js';
import type { BlendPlan, BlendTrack } from './stem-blend.js';
import type { SubbeatsPlayback } from './subbeats-clock.js';

let busy = false;
let probing = false;

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
    outCueInSec?: number; incomingHasSpeech?: boolean; valid: () => boolean;
    log: (message: string, meta?: Record<string, unknown>) => void },
): Promise<BlendPlan | null> {
  if (settings.get().transitions.subbeatsLive !== true) return null;
  const fallback = (reason: string) => { opts.log(`Sub/Beats fallback: ${reason}`, {subbeats:'fallback',reason}); return null; };
  if (!outTrack.id || !inTrack.id || outTrack.id === inTrack.id) return fallback('The pair needs two library tracks.');
  if (settings.get().transitions.pairDrain === false || !settings.getEffectivePersona()?.djMode) return fallback('DJ mode and pair-aware transitions are required.');
  if (opts.outCapped || opts.inHeadTrimmed || opts.incomingHasSpeech) return fallback('A trim, boundary or spoken handoff owns this seam.');
  if (busy || bulkPassRunning() || renderStandsDown({separating:separationInFlight(),backend:analyzer.backendLabel(),
    concurrency:config.analyzer.concurrency})) return fallback('Analysis is busy.');
  if (analyzer.subbeatsCapability() !== true) {
    // Cold/previously offline backends warm outside the sender's deadline.
    // The current pair falls through; a later pair can use the ready backend.
    if (!probing) {
      probing = true;
      void analyzer.subbeatsAvailable().catch(() => false).finally(() => {probing=false;});
    }
    return fallback('The updated Sub/Beats analyzer is unavailable or still starting.');
  }
  const windowMs = remainingSec == null ? 0 : Math.floor((remainingSec - HARD_DEADLINE_SEC - 10) * 1000);
  const budgetMs = Math.min(120_000,config.analyzer.renderTimeoutMs,windowMs);
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
    clearTimeout(timer);clearInterval(check);
    if (rejectAbort) abort.signal.removeEventListener('abort',rejectAbort);
    if (result && !keep) await discardSubbeatsClips(result);
    busy = false;
  }
}
