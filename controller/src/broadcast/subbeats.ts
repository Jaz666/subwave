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
import { planSubbeatsPrepV2Extraction, roundStemBeatsSample, subbeatsPairSnapshot, subbeatsPrepV2PairSnapshot } from '../music/subbeats-pair.js';
import { stageSubbeatsPairForPickTime } from '../music/subbeats-picktime-extraction.js';
import { getRawStreamUrl } from '../music/subsonic.js';
import { bulkPassRunning } from '../music/tagger-lock.js';
import { separationInFlight } from './pick-stems.js';
import { renderStandsDown } from './pick-stems-policy.js';
import { stemBeatsEnabled } from './regular-stem-mode.js';
import { DRAIN_DEADLINE_SEC, HARD_DEADLINE_SEC } from './drain-policy.js';
import { stemBeatsWindowEvidenceSchema } from '../schemas/subbeats.js';
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

// Once a successor is selected, its selection allowance is already spent.
export function subbeatsExecutionReserveSeconds(renderTimeoutMs: number): number {
  return Math.min(MAX_RENDER_MS, renderTimeoutMs) / 1000 + HARD_DEADLINE_SEC + COMMIT_MARGIN_SEC;
}

export function subbeatsPairHasV2Plan(outgoingId: string, incomingId: string): boolean {
  if (!stemBeatsEnabled() || settings.get().transitions.pairDrain === false
      || !settings.getEffectivePersona()?.djMode) return false;
  try {
    const pair = subbeatsPrepV2PairSnapshot(outgoingId, incomingId);
    return pair.outgoingRole.state === 'cue-ready' && pair.incomingRole.state === 'cue-ready'
      && planSubbeatsPrepV2Extraction(pair.outgoingRole, pair.incomingRole).state === 'windows-ready';
  } catch { return false; }
}

export function subbeatsStillCurrent(playback: SubbeatsPlayback): boolean {
  try {
    const evidenceFingerprint = playback.version === 2
      ? subbeatsPrepV2PairSnapshot(playback.outgoingId, playback.incomingId).evidenceFingerprint
      : subbeatsPairSnapshot(playback.outgoingId, playback.incomingId).evidenceFingerprint;
    return stemBeatsEnabled()
      && settings.get().transitions.pairDrain !== false && !!settings.getEffectivePersona()?.djMode
      && JSON.stringify(settings.get().loudness) === playback.loudnessSettings
      && evidenceFingerprint === playback.evidenceFingerprint;
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
  if (!stemBeatsEnabled()) return null;
  const fallback = (reason: string, details: Record<string, unknown> = {}) => { opts.log(`Stem Beats fallback: ${reason}`, {
    subbeats:'fallback',reason,outgoingId:outTrack.id,incomingId:inTrack.id,
    ...details,
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
    try { if (!opts.valid() || !stemBeatsEnabled()) abort.abort(); }
    catch { abort.abort(); }
  },100);
  let result: BlendPlan | null = null;
  let keep = false;
  let stagedV2: Awaited<ReturnType<typeof stageSubbeatsPairForPickTime>> | null = null;
  let rejectAbort: (() => void) | undefined;
  let readinessTimer: ReturnType<typeof setTimeout> | undefined;
  const startedAt = Date.now();
  try {
    const loudnessSettings = JSON.stringify(settings.get().loudness);
    const interrupted = new Promise<never>((_,reject) => {
      rejectAbort = () => reject(new Error('The handoff was cancelled or exceeded its budget.'));
      abort.signal.addEventListener('abort',rejectAbort,{once:true});
    });
    const v2 = subbeatsPrepV2PairSnapshot(outTrack.id, inTrack.id);
    if (v2.outgoingRole.state === 'cue-ready' && v2.incomingRole.state === 'cue-ready') {
      const v2Plan = planSubbeatsPrepV2Extraction(v2.outgoingRole, v2.incomingRole);
      if (v2Plan.state === 'windows-ready' && v2Plan.plan) {
        if (!await analyzer.stembeatsStemWindowsAvailable()) return fallback('The Stem Beats analyzer is unavailable.');
        opts.log(`Stem Beats attempt starting (${analyzer.stemBeatsModelResidency()} analyzer models, ${((deadlineMs-Date.now())/1000).toFixed(1)}s budget)`,
          { subbeats:'stembeats-timing', phase:'start', modelResidency:analyzer.stemBeatsModelResidency() });
        const gains = await Promise.race([Promise.all([
          typeof outTrack.gainDb === 'number' ? outTrack.gainDb : loudness.resolveGainDb(outTrack),
          loudness.resolveGainDb(inTrack),
        ]),interrupted]);
        abort.signal.throwIfAborted();
        stagedV2 = await stageSubbeatsPairForPickTime(v2.outgoingRole, v2.incomingRole, deadlineMs, abort.signal,
          message => opts.log(message, { subbeats:'stembeats-timing' }));
        if (!stagedV2.windows || !stagedV2.sources) return fallback('The selected Stem Beats windows could not be extracted.');
        const selected = v2Plan.plan;
        const roles = [
          { role:v2.outgoingRole, side:'tail' as const, cueIndex:selected.outgoingCueIndex,
            cue:v2.outgoingRole.cues[selected.outgoingCueIndex], source:stagedV2.sources[0], window:stagedV2.windows.outgoing },
          { role:v2.incomingRole, side:'head' as const, cueIndex:selected.incomingCueIndex,
            cue:v2.incomingRole.cues[selected.incomingCueIndex], source:stagedV2.sources[1], window:stagedV2.windows.incoming },
        ];
        if (roles.some(item => !item.cue || !item.window)) return fallback('The selected Stem Beats evidence is incomplete.');
        const gainsDb = gains.map(gain => gain ?? 0);
        const renderRole = (item: typeof roles[number]) => ({ id:item.role.job.id, side:item.side,
          cueIndex:item.cueIndex, cue:item.cue!,
          source:{ path:item.source.path, sha256:item.source.sha256, bytes:item.source.bytes,
            durationSeconds:item.source.durationSeconds },
          window:{ directory:item.window.directory, evidence:stemBeatsWindowEvidenceSchema.parse(item.window.evidence) } });
        opts.log(`Stem Beats rendering started: ${outTrack.title} → ${inTrack.title} (${v2.mixStyle}, ${((deadlineMs-Date.now())/1000).toFixed(1)}s budget remains)`, { subbeats:'stembeats-timing' });
        const renderStartedAt = Date.now();
        const rendered = await analyzer.renderStemBeatsLive({ version:2, transitionId:randomUUID(), deadlineMs,
          stateDir:config.stateDir, stemsRoot:stemCache.stemsRoot(), outgoingId:outTrack.id, incomingId:inTrack.id,
          roles:[renderRole(roles[0]!), renderRole(roles[1]!)],
          gainsDb, mixStyle:v2.mixStyle, evidenceFingerprint:v2.evidenceFingerprint }, abort.signal);
        opts.log(`Stem Beats rendering finished in ${((Date.now()-renderStartedAt)/1000).toFixed(1)}s`, { subbeats:'stembeats-timing' });
        if (rendered.status === 'unavailable') return fallback(rendered.reason);
        const timing = rendered.timing;
        const cues = clipSeamCues({ blendStartSec:timing.outgoingStartSample/44100,
          inCueSec:timing.incomingResumeSample/44100 }, CLIP_SEAM_CROSS_SEC, 44100);
        result = { clipPath:rendered.clipPath, ...(rendered.leadPath ? { leadPath:rendered.leadPath } : {}),
          clipSec:timing.clipFrames/44100, ...cues,
          subbeats:{ version:2, transitionId:rendered.transitionId, outgoingId:outTrack.id, incomingId:inTrack.id,
            evidenceFingerprint:v2.evidenceFingerprint, mixStyle:v2.mixStyle, timing,
            loudnessSettings, gainsDb, clipPath:rendered.clipPath, leadPath:rendered.leadPath,
            incomingDurationSeconds:v2.incomingRole.job.source!.durationSeconds,
            previewWindows:{
              outgoing:{directory:stagedV2.windows.outgoing.directory,
                startSeconds:selected.outgoing.startSeconds,endSeconds:selected.outgoing.endSeconds,
                evidence:stemBeatsWindowEvidenceSchema.parse(stagedV2.windows.outgoing.evidence)},
              incoming:{directory:stagedV2.windows.incoming.directory,
                startSeconds:selected.incoming.startSeconds,endSeconds:selected.incoming.endSeconds,
                evidence:stemBeatsWindowEvidenceSchema.parse(stagedV2.windows.incoming.evidence)},
            } } };
        if (timing.outgoingStartSample !== roundStemBeatsSample(selected.firstSeconds*44100)
            || timing.incomingResumeSample !== roundStemBeatsSample(selected.incomingEndSeconds*44100)) {
          return fallback('The rendered Stem Beats timing falls outside its prepared windows.');
        }
        if (!opts.valid() || subbeatsPrepV2PairSnapshot(outTrack.id,inTrack.id).evidenceFingerprint !== v2.evidenceFingerprint
            || abort.signal.aborted) return fallback('The pair or V2 evidence changed during rendering.');
        if (cues.outCueSec <= Math.max(10,(opts.outCueInSec ?? 0)+1)
            || (opts.outTrimEndSec != null && opts.outTrimEndSec < cues.outCueSec)) {
          return fallback('The Stem Beats handoff conflicts with an existing cue or trim.');
        }
        for (const file of [rendered.clipPath,rendered.leadPath].filter((p): p is string => !!p)) {
          const info = await lstat(file);
          if (!info.isFile() || info.isSymbolicLink() || info.size < 44 || info.size > 48*1024*1024)
            return fallback('A lossless Stem Beats handoff part is unavailable.');
          const wav = parseWav(await readFile(file,{signal:abort.signal}));
          const frames = file === rendered.clipPath ? timing.clipFrames-timing.incomingEntryFrame
            : timing.incomingEntryFrame+Math.round(CLIP_SEAM_CROSS_SEC*44100);
          if (!wav || wav.fmt.audioFormat !== 3 || wav.fmt.channels !== 2 || wav.fmt.sampleRate !== 44100
              || wav.fmt.bitsPerSample !== 32 || wav.dataLen !== frames*8)
            return fallback('A lossless Stem Beats handoff part has invalid format or duration.');
        }
        abort.signal.throwIfAborted();
        opts.log(`Stem Beats rendered: ${v2.mixStyle}, ${((timing.incomingRate-1)*100).toFixed(2)}% tempo`,
          { subbeats:'stembeats-rendered', transitionId:rendered.transitionId, vocal:rendered.vocal });
        keep = true;
        return result;
      }
    }
    const before = subbeatsPairSnapshot(outTrack.id,inTrack.id);
    const unavailable = before.roles.findIndex(role => role.state !== 'coverage-ready');
    if (unavailable >= 0) {
      const role = unavailable === 0 ? 'outgoing tail' : 'incoming head';
      const track = unavailable === 0 ? outTrack : inTrack;
      const label = [track.title, track.artist].filter(Boolean).join(' — ') || track.id;
      return fallback(`${label} ${role}: ${before.roles[unavailable].reason}`, {
        reasonCode:before.roles[unavailable].reason,role,state:before.roles[unavailable].state,
      });
    }
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
      if (!ready) return fallback('The legacy V1 analyzer could not confirm readiness within its check window.');
    }
    const gains = await Promise.race([Promise.all([
      typeof outTrack.gainDb === 'number' ? outTrack.gainDb : loudness.resolveGainDb(outTrack),
      loudness.resolveGainDb(inTrack),
    ]),interrupted]);
    abort.signal.throwIfAborted();
    opts.log(`Legacy V1 Sub/Beats attempt: ${outTrack.title} → ${inTrack.title} (${before.mixStyle})`,{subbeats:'attempt'});
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
    const incomingGrid = before.sourceEvidence[1].grid;
    if (!before.roles[0].cueIndices.includes(rendered.candidate.outgoingCueIndex)
      || !before.roles[1].cueIndices.includes(rendered.candidate.incomingCueIndex)
      || !incomingGrid || timing.incomingResumeSample * 1000 / timing.sampleRate > incomingGrid.windowEndMs + 2) {
      return fallback('The selected cues fall outside current role coverage.', {reasonCode:'window-too-short'});
    }
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
    opts.log(`Legacy V1 Sub/Beats rendered: ${before.mixStyle}, ${((timing.incomingRate-1)*100).toFixed(2)}% tempo, ${timing.loop ? 'drum loop' : 'no loop'}`,
      {subbeats:'rendered',transitionId:rendered.transitionId,style:before.mixStyle,vocal:rendered.candidate.vocal});
    keep = true;
    return result;
  } catch { return fallback('The handoff was unavailable, cancelled or exceeded its time budget.'); }
  finally {
    clearTimeout(timer);clearTimeout(readinessTimer);clearInterval(check);
    if (rejectAbort) abort.signal.removeEventListener('abort',rejectAbort);
    if (result && !keep) await discardSubbeatsClips(result);
    await stagedV2?.release(keep).catch(() => {});
    opts.log(`Stem Beats pick-time pipeline finished in ${((Date.now()-startedAt)/1000).toFixed(1)}s (${keep ? 'rendered' : 'fallback'})`,
      { subbeats:'stembeats-timing' });
    busy = false;
  }
}
