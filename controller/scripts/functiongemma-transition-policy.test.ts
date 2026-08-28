import assert from 'node:assert/strict';
import {
  FUNCTIONGEMMA_ELIGIBLE_TRANSITIONS_PER_EFFECT,
  nextFunctionGemmaEligibleTransitions,
  planFunctionGemmaTransition,
} from '../src/broadcast/functiongemma-transition-policy.js';

const locked = { bpm: 124, key: '8A' };
const clash = { bpm: 92, key: '3B' };

assert.equal(FUNCTIONGEMMA_ELIGIBLE_TRANSITIONS_PER_EFFECT, 5);
assert.deepEqual(
  planFunctionGemmaTransition({ cur: locked, next: locked, eligibleTransitionsSinceEffect: 0, recentTransitions: [] }),
  { transition: null, eligible: true, reason: 'normal — pacing 1/4 eligible plain seams since the last effect' },
);
assert.equal(
  planFunctionGemmaTransition({ cur: locked, next: locked, eligibleTransitionsSinceEffect: 4, recentTransitions: [] }).transition,
  'blend',
);
assert.equal(planFunctionGemmaTransition({ cur: clash, next: locked, eligibleTransitionsSinceEffect: 4, recentTransitions: [] }).transition, 'chop');
assert.equal(planFunctionGemmaTransition({ cur: clash, next: locked, eligibleTransitionsSinceEffect: 4, recentTransitions: ['chop'] }).transition, 'loop');
assert.equal(planFunctionGemmaTransition({ cur: clash, next: locked, eligibleTransitionsSinceEffect: 4, recentTransitions: ['chop', 'loop'] }).transition, 'washout');
assert.equal(planFunctionGemmaTransition({ cur: clash, next: locked, eligibleTransitionsSinceEffect: 4, recentTransitions: ['chop', 'loop', 'washout'] }).transition, 'dissolve');
assert.equal(planFunctionGemmaTransition({ cur: clash, next: locked, eligibleTransitionsSinceEffect: 4, recentTransitions: ['chop', 'loop', 'washout', 'dissolve'] }).transition, 'sweep');
assert.equal(
  planFunctionGemmaTransition({ cur: { ...clash, ending: 'fade' }, next: locked, eligibleTransitionsSinceEffect: 4, recentTransitions: [] }).transition,
  'loop',
);
assert.equal(
  planFunctionGemmaTransition({ cur: { bpm: null, key: null }, next: locked, eligibleTransitionsSinceEffect: 4, recentTransitions: [] }).eligible,
  false,
);
assert.equal(
  planFunctionGemmaTransition({ cur: locked, next: locked, eligibleTransitionsSinceEffect: 4, recentTransitions: ['normal', 'blend'] }).transition,
  null,
);
assert.equal(
  nextFunctionGemmaEligibleTransitions({ eligibleTransitionsSinceEffect: 3, eligible: true, effectFired: true }),
  0,
);
assert.equal(
  nextFunctionGemmaEligibleTransitions({ eligibleTransitionsSinceEffect: 3, eligible: true, effectFired: false }),
  4,
);

console.log('FunctionGemma transition policy tests passed');
