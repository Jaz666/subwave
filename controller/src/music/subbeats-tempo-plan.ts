/** Versioned, offline-only tempo profiles for Stem Beats audition work.
 *
 * Keep this policy separate from live pick-time admission until a rendered
 * sample has been reviewed. The Python renderer mirrors this contract; the
 * shared JSON fixtures guard cross-language agreement.
 */
export const STEM_BEATS_TEMPO_PLAN_VERSION = 1 as const;

export type StemBeatsTempoPlan = {
  planVersion: typeof STEM_BEATS_TEMPO_PLAN_VERSION;
  mode: 'incoming-only' | 'split';
  outgoingBpm: number;
  incomingBpm: number;
  commonBpm: number;
  outgoingRate: number;
  incomingRate: number;
  symmetricGap: number;
};

export type StemBeatsTempoTimelineInput = {
  outgoingCueSeconds: number;
  handoverSeconds: number;
  outgoingDurationSeconds: number;
  incomingCueSeconds: number;
  incomingDurationSeconds: number;
  rampBars?: number;
  releaseBeats?: number;
  nativeTailBars?: number;
  seamGuardSeconds?: number;
  sampleRate?: number;
};

export type StemBeatsTempoTimeline = {
  planVersion: typeof STEM_BEATS_TEMPO_PLAN_VERSION;
  mode: StemBeatsTempoPlan['mode'];
  sampleRate: number;
  clipStartSeconds: number;
  clipFrames: number;
  incomingEntrySeconds: number;
  handoverOutputSeconds: number;
  outgoingEndOutputSeconds: number;
  outgoingCueSourceSeconds: number;
  outgoingRampStartSourceSeconds: number | null;
  outgoingRampEndOutputSeconds: number | null;
  incomingReleaseEndOutputSeconds: number;
  incomingEntryFrame: number;
  handoverFrame: number;
  outgoingEndFrame: number;
  rampStartFrame: number | null;
  rampEndFrame: number | null;
  releaseStartFrame: number;
  releaseEndFrame: number;
  outgoingEndSourceSeconds: number;
  incomingResumeSourceSeconds: number;
  incomingEndSourceSeconds: number;
};

const LEGACY_DIRECTIONAL_LIMIT = 0.08;
const SPLIT_PAIR_GAP_LIMIT = 0.12;
const SPLIT_DECK_ADJUSTMENT_LIMIT = 0.06;

export function planStemBeatsTempo(
  outgoingBpm: number,
  incomingBpm: number,
): StemBeatsTempoPlan | null {
  if (![outgoingBpm, incomingBpm].every(Number.isFinite)
      || outgoingBpm <= 0 || incomingBpm <= 0) return null;

  const ratio = outgoingBpm / incomingBpm;
  const symmetricGap = Math.max(ratio, 1 / ratio) - 1;
  if (Math.abs(ratio - 1) <= LEGACY_DIRECTIONAL_LIMIT) {
    return {
      planVersion: STEM_BEATS_TEMPO_PLAN_VERSION,
      mode: 'incoming-only',
      outgoingBpm,
      incomingBpm,
      commonBpm: outgoingBpm,
      outgoingRate: 1,
      incomingRate: ratio,
      symmetricGap,
    };
  }

  if (symmetricGap > SPLIT_PAIR_GAP_LIMIT + Number.EPSILON) return null;

  const commonBpm = Math.sqrt(outgoingBpm * incomingBpm);
  const outgoingRate = commonBpm / outgoingBpm;
  const incomingRate = commonBpm / incomingBpm;
  if (Math.max(Math.abs(outgoingRate - 1), Math.abs(incomingRate - 1))
      > SPLIT_DECK_ADJUSTMENT_LIMIT + Number.EPSILON) return null;

  return {
    planVersion: STEM_BEATS_TEMPO_PLAN_VERSION,
    mode: 'split',
    outgoingBpm,
    incomingBpm,
    commonBpm,
    outgoingRate,
    incomingRate,
    symmetricGap,
  };
}

/** Build an offline timing proposal. Frames are clip-relative; source seconds
 * remain original-file positions. The ramp spends the requested number of
 * outgoing beats moving linearly from native rate to the synchronized rate.
 */
export function buildStemBeatsTempoTimeline(
  plan: StemBeatsTempoPlan,
  input: StemBeatsTempoTimelineInput,
): StemBeatsTempoTimeline | null {
  const rampBars = input.rampBars ?? 8;
  const releaseBeats = input.releaseBeats ?? 64;
  const nativeTailBars = input.nativeTailBars ?? 4;
  const seamGuardSeconds = input.seamGuardSeconds ?? 0.3;
  const sampleRate = input.sampleRate ?? 44_100;
  const values = [input.outgoingCueSeconds, input.handoverSeconds,
    input.outgoingDurationSeconds, input.incomingCueSeconds,
    input.incomingDurationSeconds, rampBars, releaseBeats,
    nativeTailBars, seamGuardSeconds, sampleRate];
  if (!values.every(Number.isFinite) || input.outgoingCueSeconds < 0
      || input.handoverSeconds < input.outgoingCueSeconds
      || input.handoverSeconds > input.outgoingDurationSeconds
      || input.incomingCueSeconds < 0 || input.incomingCueSeconds >= input.incomingDurationSeconds
      || input.outgoingDurationSeconds <= 0 || input.incomingDurationSeconds <= 0
      || rampBars < 0 || releaseBeats < 0 || nativeTailBars <= 0
      || seamGuardSeconds < 0 || sampleRate <= 0) return null;

  let rampStartSource: number | null = null;
  let rampEndOutput: number | null = null;
  let handoverOutput: number;
  let outgoingEndOutput: number;
  let incomingEntry: number;
  if (plan.mode === 'split' && plan.outgoingRate !== 1 && rampBars > 0) {
    const rampSourceSeconds = rampBars * 4 * 60 / plan.outgoingBpm;
    const rampOutputSeconds = rampBars * 4 * 60
      / (plan.outgoingBpm * (1 + plan.outgoingRate) / 2);
    rampStartSource = input.outgoingCueSeconds - rampSourceSeconds;
    if (rampStartSource < 0) return null;
    rampEndOutput = rampStartSource + rampOutputSeconds;
    handoverOutput = rampEndOutput
      + (input.handoverSeconds - input.outgoingCueSeconds) / plan.outgoingRate;
    outgoingEndOutput = rampEndOutput
      + (input.outgoingDurationSeconds - input.outgoingCueSeconds) / plan.outgoingRate;
    incomingEntry = handoverOutput - input.incomingCueSeconds / plan.incomingRate;
  } else {
    handoverOutput = input.handoverSeconds;
    outgoingEndOutput = input.outgoingDurationSeconds;
    incomingEntry = handoverOutput - input.incomingCueSeconds / plan.incomingRate;
  }

  const releaseDuration = plan.incomingRate === 1 || releaseBeats === 0 ? 0
    : releaseBeats * 60 / (plan.incomingBpm * (plan.incomingRate + 1) / 2);
  const releaseStartOutput = outgoingEndOutput;
  const releaseEndOutput = releaseStartOutput + releaseDuration;
  const incomingResumeSource = (releaseStartOutput - incomingEntry) * plan.incomingRate
    + releaseDuration * (plan.incomingRate + 1) / 2;
  const incomingEndSource = incomingResumeSource + nativeTailBars * 4 * 60 / plan.incomingBpm;
  if (incomingEntry < 0 || incomingEndSource > input.incomingDurationSeconds) return null;

  const outgoingStartOutput = rampStartSource ?? input.outgoingCueSeconds;
  const clipStartSeconds = Math.max(0, Math.min(outgoingStartOutput, incomingEntry) - seamGuardSeconds);
  const clipEndSeconds = releaseEndOutput + nativeTailBars * 4 * 60 / plan.incomingBpm;
  const frame = (seconds: number): number => Math.round((seconds - clipStartSeconds) * sampleRate);
  const clipFrames = Math.round((clipEndSeconds - clipStartSeconds) * sampleRate);
  if (clipFrames <= 0 || clipFrames > 120 * sampleRate) return null;
  const rampStartFrame = rampStartSource === null ? null : frame(rampStartSource);
  const rampEndFrame = rampEndOutput === null ? null : frame(rampEndOutput);
  return {
    planVersion: STEM_BEATS_TEMPO_PLAN_VERSION,
    mode: plan.mode,
    sampleRate,
    clipStartSeconds,
    clipFrames,
    incomingEntrySeconds: incomingEntry,
    handoverOutputSeconds: handoverOutput,
    outgoingEndOutputSeconds: outgoingEndOutput,
    outgoingCueSourceSeconds: input.outgoingCueSeconds,
    outgoingRampStartSourceSeconds: rampStartSource,
    outgoingRampEndOutputSeconds: rampEndOutput,
    incomingReleaseEndOutputSeconds: releaseEndOutput,
    incomingEntryFrame: frame(incomingEntry),
    handoverFrame: frame(handoverOutput),
    outgoingEndFrame: frame(outgoingEndOutput),
    rampStartFrame,
    rampEndFrame,
    releaseStartFrame: frame(releaseStartOutput),
    releaseEndFrame: frame(releaseEndOutput),
    outgoingEndSourceSeconds: input.outgoingDurationSeconds,
    incomingResumeSourceSeconds: incomingResumeSource,
    incomingEndSourceSeconds: incomingEndSource,
  };
}

/** Map one track's original source clock at an absolute output time. A null
 * result means the incoming track has not entered yet. */
export function stemBeatsSourceSecondsAtOutput(
  plan: StemBeatsTempoPlan,
  timeline: StemBeatsTempoTimeline,
  side: 'outgoing' | 'incoming',
  outputSeconds: number,
): number | null {
  if (!Number.isFinite(outputSeconds) || outputSeconds < 0) return null;
  if (side === 'outgoing') {
    if (timeline.outgoingRampStartSourceSeconds === null
        || timeline.outgoingRampEndOutputSeconds === null) return outputSeconds;
    const start = timeline.outgoingRampStartSourceSeconds;
    const end = timeline.outgoingRampEndOutputSeconds;
    if (outputSeconds <= start) return outputSeconds;
    if (outputSeconds <= end) {
      const elapsed = outputSeconds - start;
      const duration = end - start;
      return start + elapsed + (plan.outgoingRate - 1) * elapsed * elapsed / (2 * duration);
    }
    return timeline.outgoingCueSourceSeconds + (outputSeconds - end) * plan.outgoingRate;
  }
  if (outputSeconds < timeline.incomingEntrySeconds) return null;
  const releaseStart = timeline.outgoingEndOutputSeconds;
  const releaseEnd = timeline.incomingReleaseEndOutputSeconds;
  if (outputSeconds <= releaseStart) {
    return (outputSeconds - timeline.incomingEntrySeconds) * plan.incomingRate;
  }
  const beforeRelease = (releaseStart - timeline.incomingEntrySeconds) * plan.incomingRate;
  const releaseDuration = releaseEnd - releaseStart;
  if (outputSeconds <= releaseEnd && releaseDuration > 0) {
    const elapsed = outputSeconds - releaseStart;
    return beforeRelease + plan.incomingRate * elapsed
      + (1 - plan.incomingRate) * elapsed * elapsed / (2 * releaseDuration);
  }
  return timeline.incomingResumeSourceSeconds + outputSeconds - releaseEnd;
}
