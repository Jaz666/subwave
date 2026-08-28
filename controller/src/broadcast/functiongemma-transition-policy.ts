// A deliberately narrow controller policy for FunctionGemma's ID-only fast
// selector. Vanilla Producer/Persona picks continue to own their transition
// choice; this module only gives the otherwise-all-normal fast path an
// occasional, data-backed treatment.

import { effectAllowedFor, mixCompat, parseCamelot, type Analysis } from '../music/mix.js';

export const FUNCTIONGEMMA_ELIGIBLE_TRANSITIONS_PER_EFFECT = 5;
const PLAIN_ELIGIBLE_TRANSITIONS_REQUIRED = FUNCTIONGEMMA_ELIGIBLE_TRANSITIONS_PER_EFFECT - 1;

export type FunctionGemmaTransition = 'blend' | 'dissolve';

export interface FunctionGemmaTransitionPlan {
  transition: FunctionGemmaTransition | null;
  eligible: boolean;
  reason: string;
}

function measuredPair(cur: Analysis, next: Analysis): boolean {
  const curKey = cur.keyEnd ?? cur.key;
  const nextKey = next.keyStart ?? next.key;
  return !!(
    cur.bpm && cur.bpm > 0 && next.bpm && next.bpm > 0
    && parseCamelot(curKey) && parseCamelot(nextKey)
  );
}

export function planFunctionGemmaTransition({
  cur,
  next,
  eligibleTransitionsSinceEffect,
  recentTransitions,
}: {
  cur: Analysis;
  next: Analysis;
  eligibleTransitionsSinceEffect: number;
  recentTransitions: string[];
}): FunctionGemmaTransitionPlan {
  if (!measuredPair(cur, next)) {
    return { transition: null, eligible: false, reason: 'normal — no complete BPM/key analysis for this seam' };
  }

  const compatibility = mixCompat(cur, next);
  const transition: FunctionGemmaTransition | null = compatibility >= 0.8 && effectAllowedFor('blend', cur, next)
    ? 'blend'
    : compatibility < 0.2 && effectAllowedFor('dissolve', cur, next)
      ? 'dissolve'
      : null;
  if (!transition) {
    return { transition: null, eligible: false, reason: `normal — compatibility ${compatibility.toFixed(2)} has no conservative treatment` };
  }

  if (eligibleTransitionsSinceEffect < PLAIN_ELIGIBLE_TRANSITIONS_REQUIRED) {
    return {
      transition: null,
      eligible: true,
      reason: `normal — pacing ${eligibleTransitionsSinceEffect + 1}/${PLAIN_ELIGIBLE_TRANSITIONS_REQUIRED} eligible plain seams since the last effect`,
    };
  }
  if (recentTransitions.includes(transition)) {
    return { transition: null, eligible: true, reason: `normal — recent transition history already contains ${transition}` };
  }
  return {
    transition,
    eligible: true,
    reason: `${transition} — eligible seam ${compatibility.toFixed(2)} after ${PLAIN_ELIGIBLE_TRANSITIONS_REQUIRED} eligible plain seams`,
  };
}

export function nextFunctionGemmaEligibleTransitions({
  eligibleTransitionsSinceEffect,
  eligible,
  effectFired,
}: {
  eligibleTransitionsSinceEffect: number;
  eligible: boolean;
  effectFired: boolean;
}): number {
  if (!eligible) return eligibleTransitionsSinceEffect;
  if (effectFired) return 0;
  return Math.min(PLAIN_ELIGIBLE_TRANSITIONS_REQUIRED, eligibleTransitionsSinceEffect + 1);
}
