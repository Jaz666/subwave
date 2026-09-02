# V19 native gate: availability correction retained, evaluator aligned

## Decision

V19 remains an isolated candidate.  Do not convert it to GGUF, run a Q8 soak,
or change the live V13 route from this result alone.

## Why V18 was rejected

V18 retained the five withheld-journey cases but selected the unavailable
`tracksTowardJourney` function whenever the offered alternatives were
`searchLibrary` or `tracksLikeThis`.  V19 starts from that checkpoint and adds
a balanced, minimal correction set for those two subsets while retaining all
five fallback families.

## Permanent availability regression

The five original controller-path prompts and tool subsets live in
`controller/scripts/functiongemma/v18-availability.ts`.  Against the V19
native checkpoint they pass for five deterministic repetitions:

* 25/25 correct one-call decisions;
* zero calls to unavailable `tracksTowardJourney`;
* expected alternatives: two `tracksByEnergy`, `searchLibrary`,
  `showPlaylistTracks`, and `tracksLikeThis`.

## Native recovery correction

The offline Python evaluator previously replayed a tool result but omitted the
fixture's declared `followups` controller message.  This made complementary
recovery fail even though the endpoint runner gives the model that instruction.
`controller/scripts/functiongemma/training/evaluate.py` now appends that
message after the matching tool result, aligning native evaluation with the
controller path without changing router policy or model behaviour.

With that correction, V19 passes all controller-relevant recovery paths for
five repetitions: complementary depth two, complementary depth three, and
empty-journey structured fallback (15/15).  The remaining historical
`recover.empty-semantic-index` row prompts the model to ``commit`` and offers
the retired final-selection protocol.  Its five failures are reported but do
not belong to the discovery router's acceptance gate; they must not motivate
training a final-selection tool into this candidate.

## Checks run

* TypeScript typecheck passed.
* Producer Router test suite passed (13/13).
* FunctionGemma evaluation suite passed (15/15).
* V18 permanent-fixture suite passed (2/2).
* V19 correction-corpus suite passed (1/1).

## Next promotion gate

Before promotion, convert V19 separately, run the permanent five-case
controller-path regression through the Q8 endpoint, exercise audio/similar and
strict-empty recovery with the live controller, then complete the bounded Q8
soak.  V13 remains the control and rollback until every gate passes.
