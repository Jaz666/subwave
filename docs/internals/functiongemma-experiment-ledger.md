# FunctionGemma experiment ledger

This is the single concise record of the FunctionGemma routing experiments.
It records decisions and durable lessons, not transient terminal commands,
container state or checkpoint paths. The terminal workflow is documented in
[`functiongemma-training-workflow.md`](functiongemma-training-workflow.md).

## Current position — 2026-09-02

FunctionGemma is a **bounded discovery router**. It chooses one offered
library/discovery function and, after an empty result, one valid recovery
function. It does not make the final editorial track choice or create
listener-facing text.

V21 is rejected for station routing. Its focused gates passed, but the real
controller transcript exposed a repeatable failure: it used `searchByLyrics`
for a memorised sound-description query, then selected that now-unavailable
tool again when asked for a successful complementary discovery source. V13
remains the control and rollback baseline.

## Test-station observation — 2026-09-02

The initial recovered call at 11:10:57Z (12:10:57 BST) was not isolated. The
station recorded 53 `djProducerRoute` attempts: 22 passed and 31 failed. Of
the failures, 28 repeated unavailable `searchByLyrics` after its first call,
and three supplied invalid `searchLibrary` arguments. The controller rejected
each invalid or unavailable call before execution and the complete Producer
picker recovered; no dead air or unsafe tool execution resulted.

V22 is a narrow, balanced correction: it teaches sound-versus-lyric intent and
the real successful-first-call complementary transcript with the used tool
removed. Its native and Q8 gate include those three controller-shaped cases.
Do not promote a new candidate without those gates and a fresh station soak.


## Experiment record

| Series | Decision | Durable result |
| --- | --- | --- |
| V1–V4, 16–24 Aug | Router work accepted as an experiment | A small model can perform bounded tool routing, but every protocol and recovery boundary needs a frozen fixture. Native multi-call output must be rejected before any tool executes. |
| V5–V14, 25–31 Aug | Iterative corrections; V13 retained as control | Broad routing, genre/mood boundaries, recovery and availability were made explicit in the corpus. A narrowly weighted correction can regress a neighbouring argument boundary, so corrective data must stay balanced and each affected fixture remains a hard gate. |
| Final-selection experiment | Rejected for routing scope | V10 produced zero valid commits in 8 held-out final-selection fixtures; the Qwen baseline produced 8/8. Final selection remains with the creative Producer and is not part of router training. |
| V17 | Rejected | All five journey-withheld controller-path cases called unavailable `tracksTowardJourney`. This was a training gap, not a reason to weaken the controller's offered-tool policy. |
| V18 | Rejected | The first small availability correction passed mood, energy and playlist alternatives but failed library-search and similarity alternatives: 15/25, with ten unavailable calls. |
| V19 | Rejected at Q8 | Availability was repaired (25/25), but the controller-faithful Q8 soak exposed empty audio/artist recovery failures: 108/129. The controller transcript, not a simplified evaluator, is the acceptance target. |
| V20 | Rejected at Q8 | It retained journey-withheld behaviour but malformed `recentByArtist` recovery arguments in 4/5 attempts. |
| V21 | Rejected at station test | Although its isolated gates passed, 31/53 live-shaped routes failed: it confused sound descriptions with lyric search and then replayed a removed tool. |
| V22 | Prepared | A minimal balanced sound/lyric/journey correction plus an evaluator that reproduces the successful complementary call. Training not yet run. |

## Non-negotiable acceptance rules

1. The model may call **only an offered function**, exactly once per decision.
2. The controller owns availability, depth and recovery policy. Training must
   follow the controller's exact prompt, offered-tool subset and post-result
   follow-up message.
3. Empty results require an offered, argument-valid recovery call. A tool name
   must never be used as a genre, mood or other argument value.
4. Final selection, listener-facing prose and ungrounded facts remain outside
   the router's contract.
5. A native success alone never promotes a candidate. It must pass the frozen
   controller-path regression, Q8 equivalent, focused recovery checks and a
   bounded Q8 soak.

## Permanent regression set

The five journey-withheld cases are the availability regression. They retain
the real operational prompt wording, the controller instruction to call only
offered functions, and offered-tool subsets that omit `tracksTowardJourney`.
They must pass at five repetitions (25/25) with zero unavailable calls.

The V21 workflow also keeps the controller-shaped checks for audio/similarity,
wide routing, strict-empty recovery, and artist-top-to-recent recovery. The
evaluation harness must remove a used tool after an empty result and append
the real controller follow-up before judging the next decision.

## Data and evaluation policy

- Add the smallest balanced correction that fixes the measured failure; do not
  broadly retrain or alter discovery depth to conceal it.
- Use `decisionTools` whenever an assistant decision sees a reduced offered
  subset. This is particularly important after an empty result.
- Keep generators, fixtures, contracts and concise reports in Git. Keep model
  checkpoints, generated reports, virtual environments and large transient
  artifacts outside Git.
- Run the staged terminal workflow locally. Its run specification records the
  parameters; `workflow-state.json` and `workflow-command.log` record the
  outcome without consuming an agent conversation.

## Documentation policy

This ledger and the terminal workflow are the maintained starting points.
The older V4/V10 handovers, producer-routing handovers, V18/V19 gate notes and
the V20/V21 findings remain useful evidence in their historical branches, but
are **superseded as current guidance** by this ledger. Do not delete them yet:
they explain a particular run and provide audit provenance. Future variation
notes should update this ledger with the candidate, gate results, decision and
one durable lesson instead of creating another standalone handover.

## Related source

- The workflow: [`functiongemma-training-workflow.md`](functiongemma-training-workflow.md)
- V20/V21 detailed acceptance evidence: [`functiongemma-v20-v21-findings.md`](functiongemma-v20-v21-findings.md)
- Test-station snapshot and earlier V18/V19 provenance:
  `test-station/producer-routing-v21` in the `Jaz666/subwave` repository.
