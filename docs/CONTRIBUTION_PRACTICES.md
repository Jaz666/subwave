# SUB/WAVE contribution practices

Prepared for Jaz666 on 20 October 2026, drawing on Perminder's reviews of [PR #1965](https://github.com/perminder-klair/subwave/pull/1965#issuecomment-6278329417) and [PR #1687](https://github.com/perminder-klair/subwave/pull/1687), plus the repository's contribution instructions. This is Jaz666's working guide for preparing contributions, not new upstream policy. Read the current repository instructions before each contribution; commands and architecture can change. The additional lessons from #1687 appear below.

## Using this guide

Start with [STARTHERE.md](../STARTHERE.md) and follow the session procedure in
[HANDOFF.md](../HANDOFF.md). Use this guide alongside the current
[upstream contribution instructions](../CONTRIBUTING.md),
[engineering instructions](../CLAUDE.md) and the relevant scoped internals.
Select checks by the behaviour and risk of the change; a documentation-only
edit needs link and diff checks, not the application test suites. The commands
below describe the repository when this guide was written; check current
package scripts and workflows before using them.

## 1. Define the behaviour before changing code

Write a short contract: the concrete failing input, the expected result, the existing behaviour that must survive, and any intentional behaviour changes. Identify what would count as a refusal, an alternative, a partial success and a genuine success.

Read the root `CLAUDE.md`, the affected package's instructions and the relevant `docs/internals/` pages. Trace the production entry point through its helpers to its side effects. Search for every caller before changing a shared helper. A request fix that changes a shared genre resolver can also change shows and ordinary track selection.

Start from current `develop` and check nearby upstream changes and open PRs. Record the base commit. Keep one coherent behaviour change per PR. Provider transport, sampling, polling duration, default settings and native release work deserve explicit scope decisions rather than being incidental additions to a matching fix.

## 2. Use a before-and-after test matrix

| Case | Current `develop` | Proposed branch |
| --- | --- | --- |
| Reported defect | Reproduces the defect | Correct result |
| Previously supported behaviour | Correct result | Same correct result |
| Intentional policy change | Recorded existing result | Explicitly documented new result |
| Invalid or unavailable input | Recorded refusal or recovery | Safe, honest result |

Run identical fixtures against both revisions where practical, using isolated checkouts and temporary state. A failing assertion on `develop` should represent the reported bug, not incompatible test setup. Preserve existing regression assertions. If one must change, explain why the old behaviour is deliberately being changed.

For an important regression, verify that the new test fails against the faulty revision or when the safeguard is temporarily reverted in an isolated checkout. This establishes that the test detects the intended defect; it does not require a new mutation-testing framework.

Test counts measure coverage executed, not compatibility. In this review, a large passing suite coexisted with 17 real-route examples that worked on `develop` and failed on the proposed branch.

## 3. Test the route people actually use

Use small unit tests for parsing and policy, plus a few integration tests through the production route or public entry point. Keep the real resolver and queue path in those integration tests; replace external catalogue HTTP, model responses and speech services at their boundaries. Testing only a helper with hand-built inputs can miss mistakes introduced by the interpreter or wiring.

Make competing outcomes possible. An empty alternative pool cannot prove that the requested artist wins over unrelated favourites. Populate exact matches, close matches and unrelated alternatives together. Control randomness so choosing the wrong pool reliably fails the test. Assert the selected identity and the listener's outcome, not merely that some track was returned.

Useful test names describe the promise: “an inferred mood does not turn an exact recording into a substitute” or “a late result cannot update the new station session.” Source-text assertions can check wiring conventions, but cannot establish runtime behaviour alone.

## 4. Choose additional tests by the surface changed

### Music interpretation and selection

- Names containing apparent instructions: “A Horse with No Name”, “But Not for Me”, “Anything But Love”, and The 1975. Include chat containing era words.
- Explicit requests versus model guesses: missing genre, language or mood metadata must not automatically disqualify an exact requested recording because the model invented a condition.
- Name forms: title by artist, comma and dash forms, bare artist, aliases, accents, Unicode and punctuation. Include near matches that must stay distinct.
- Recording identity: remaster, featured artist and catalogue decorations; separately test live, remix and acoustic versions and explicitly requested versions.
- Negative preferences: a dislike must not become a positive selection signal. Test mixed likes/dislikes, conflicting host preferences and missing tags.
- Recovery: valid empty plans, malformed responses, omitted fields, interpreter outage, token cap and optional intro failure. Check whether an honest alternative is allowed or a refusal is required.
- Hard constraints versus preferences: prohibited tracks stay prohibited in every fallback pool. A preference miss must not be reported as a different recording if the exact recording still plays.

### Shared helpers, settings and public contracts

- Exercise the other callers of a shared helper, with positive and near-match negative examples. Fixing Rap/Trap must not accidentally break Electronic/Electronica where that relationship was supported.
- Test an old saved configuration with the new field absent, plus meaningful `false`, `0`, empty and malformed values. Check cold load and save/reload, not only a normalizer in isolation. Verify defaults, patch handling and load composition agree.
- For controller API changes, test web and native consumers, including an older controller that omits new fields. Check public allowlists so diagnostics and private reasoning cannot leak into listener feeds or spoken copy.
- Preserve authoritative queue and request guards. Test current, recent, queued and blocked tracks, duplicate insertion and relevant concurrent changes at the final queue boundary.

### Timing, provider and broadcast changes

- Use controlled clocks and promises for stale responses, retries, timeouts and late completion. A timeout message must not claim a definite refusal when the result remains unknown.
- Capture actual SDK HTTP payloads when changing provider strategy: primary and fallback, first attempt and recovery, tools, tool choice and response format. Verify the parsed result and its meaning as well as the payload.
- Keep model, prompt, sampling and catalogue fixed when comparing transport strategies. Payload fixtures do not prove live-model reliability or latency. Report live evaluation timeouts as inconclusive; station GPU contention can invalidate comparisons.
- For audio or deployment changes, use the applicable image/runtime smoke tests. A host-machine pass does not prove the shipped ffmpeg or Liquidsoap build behaves the same.
- State when a change needs a native app release, image rebuild or restart. Editing source does not establish that a running station has received it.

## 5. Keep automated verification isolated

Run controller tests through its `npm test` runner, which supplies a fresh temporary `STATE_DIR`. Tests doing their own setup must set state before importing modules that capture configuration. Close databases, restore mocks and clean up temporary files. Stub off-box services for automated tests; never point them at the live library, queue or station settings.

Live model evaluations and physical playback are separate activities. Use synthetic data and an isolated environment, account for shared hardware, and agree any use of the broadcasting station beforehand. Describe fixture tests, live-model evaluations and device playback separately in the evidence.

## 6. Run checks in a useful order

1. Reproduce the defect with a focused failing test.
2. Implement the fix and run focused tests.
3. Compare unchanged compatibility cases with `develop`; investigate differences.
4. Run the full affected package suites before pushing. Repository instructions require controller and web tests locally for changes there; ordinary lint CI does not run those suites.
5. Run the four lint/type gates and applicable generated-mirror, build or runtime checks. Re-run affected checks after subsequent code changes.

Commands below run from the repository root, after dependencies are installed:

```bash
# Focused controller or web tests: substring selects test files.
npm --prefix controller test -- request
npm --prefix web test -- request

# Full suites: choose packages affected by the change and its consumers.
npm --prefix controller test
npm --prefix web test
npm --prefix app test

# CI lint/type gates.
npm --prefix controller run lint
npm --prefix web run lint
npm --prefix app run lint
npm --prefix mcp-subwave run lint

git diff --check
```

The native app's current test command does not provide the same substring filter; use its full suite. MCP currently has no test script. If schemas or themes change, follow the current generator and drift-check instructions in `.github/workflows/lint.yml`, including dependent schema versions. Review generated diffs before committing.

Avoid repeating the full suite without a reason. If a final edit follows a full run, record exactly which revision received the full run and which focused checks cover the final edit. Broaden verification again when the edit's reach warrants it.

## 7. Make the review evidence easy to assess

Every commit should have an explanatory body, as already requested by Jaz666:

```text
fix(area): describe the resulting behaviour

Problem: concrete trigger and observed failure.

Change: what now happens and why.

Compatibility: existing behaviour preserved, intentional changes,
affected callers and relevant defaults or deployment requirements.

Validation: commands, results and revision tested. Distinguish local
fixtures from live model or device checks; state material gaps.
```

Write the PR description around the final implementation. Include the concrete before/after example, scope, supported limits and validation. Remove claims belonging to an abandoned approach or an older revision. A simplicity audit and a correctness review answer different questions; neither replaces the compatibility comparison.

Before submitting or marking ready:

- [ ] The reported defect is reproduced and corrected.
- [ ] Unchanged supported cases still pass against the baseline.
- [ ] Shared callers, defaults and relevant clients have been checked.
- [ ] Tests exercise meaningful competing outcomes and failure paths.
- [ ] The final diff, documentation and validation claims agree.
- [ ] Independent changes are separated or explicitly justified.
- [ ] The PR targets `develop`; publishing remains subject to the user's instruction.

## Reusable task brief

> Read the current SUB/WAVE contribution instructions and relevant internals. Define the failing behaviour and the supported behaviour to preserve. Check upstream overlap and shared callers before editing. For replacement features, inventory what the old route provides. Add a failing reproduction and unchanged compatibility cases; exercise the production entry point with external services isolated. Check model validation, migration symmetry, bounded failure costs and cancellation where relevant. Audit merge resolutions for lost upstream fixes and assertions. Compare relevant fixtures against develop, run the affected suites and required gates, and document exact validation and limitations. Keep independent provider, timing, default and release changes separate. Use explanatory commit bodies. Do not submit a PR until I ask.

## Additional lessons from PR #1687

These are recommendations inferred from the review, rather than a claim that Perminder requires every test on every contribution. Select the rows that match the change.

### Preserve upstream work during merges

A clean merge or passing lint does not establish that upstream fixes survived. The initial review restored predecessor wording, episode context, comments and settings help; a later merge again reverted DJ Doc's operator labels. After integrating `develop`, list the upstream changes touching conflicted files and inspect each resolved hunk against its purpose. Preserve the upstream regression tests, adjusting them only where the intended contract changed. Include documentation and labels in this audit.

Perminder also pushed review fixes directly to the PR branch. Fetch and integrate those commits before the next push. Inspect the remote branch's changes rather than assuming the last local commit remains its head. [Sources: initial review](https://github.com/perminder-klair/subwave/pull/1687#pullrequestreview-5446411378), [later merge audit](https://github.com/perminder-klair/subwave/pull/1687#issuecomment-6123698342).

### Inventory a replacement feature's full behaviour

Before replacing a route, make a parity table covering candidate sources, context/history, transition ranking, hard restrictions, fallback behaviour, model-call cost, repair paths, diagnostics and migration. Mark each item preserved, deliberately changed or deferred. More candidates do not imply equal source variety; keeping an old route as fallback does not preserve its behaviour as the primary route. Test shared rules on both routes, including the auto-playlist/coast path where applicable. [Source: Candidate Pool comparison](https://github.com/perminder-klair/subwave/pull/1687#issuecomment-6049590864).

### Add the tests appropriate to the risk

| Risk | Useful regression test |
| --- | --- |
| Settings migration works in only one direction | Exercise legacy false → true and true → false through save and cold load; check all dependent routes, malformed stored values and explicit-setting precedence. Test any deliberate upgrade exception and its operator notice. |
| A setting exists but has no effect | Trace the saved value to a controller reader. Test saved versus unsaved presentation, relevant route combinations, visibility and DJ Doc labels. Preserve old links and validate settings-search anchors when moving controls. |
| Schema validation prevents recovery | Drive a slightly corrupted ID through the actual provider response parser and repair path. Verify exact, uniquely repairable and unrelated IDs; final selection must belong to the permitted candidates. Do not weaken final membership checks to enable repair. |
| Model explanations satisfy shape but violate policy | Supply true but irrelevant facts, shared evidence, unsupported genre claims and guest preferences conflicting with host priority. Confirm controller validation rejects them while valid descriptive comparisons still pass. |
| A model's label is mistaken for evidence | Put the same biography or unsupported text behind different intent labels, including apparently legitimate ones. Validate the content independently of the label. Include paraphrases and other languages instead of fitting English phrase lists to one fixture. |
| Failure multiplies model calls | Count calls and breaker effects for success, malformed response, timeout, empty candidates and an already-open breaker. Check that recovery does not repeat an exhausted strategy and that no-candidate behaviour follows existing policy. |
| Sequential stages starve each other | Let preparation finish near its deadline, then verify the next stage gets the budget intended for it. Bound the overall operation, prevent late publication and check whether a retry is actually allowed. |
| Shared fetch cancellation crosses callers | Start two consumers with different deadlines; cancel one and verify the other can finish. Check completed-result reuse, stale-generation rejection, key correctness, TTL and cache bounds. |
| Caching hides fresh eligibility changes | Reuse a source pool within a pick while changing the seen/excluded set; verify every pass reapplies current filtering and can contribute fresh candidates. |
| A small-library pass hides controller stalls | Use representative catalogue scale, measure synchronous query count and event-loop responsiveness as well as total duration, and compare with the baseline. Avoid brittle wall-clock limits in ordinary unit tests. |
| A benchmark no longer measures production | Assert that it uses current schemas, discovery, context, gates and validation. Report valid IDs separately from musically suitable picks, first attempts separately from repaired results, and excluded stages explicitly. |
| A test stops testing its intended target | Assert source-slice markers exist and are ordered before making wiring assertions. Prefer behaviour tests for semantics. Ensure assertions inside mocked I/O cannot be swallowed as simulated provider failures; capture observations and assert outside the mock where practical. |
| A placeholder or unknown value becomes a false claim | Check absent, invalid and placeholder reasons in operator copy. Preserve measured zero separately from unknown for intro duration, similarity and other numeric facts. |

Sources: [initial review](https://github.com/perminder-klair/subwave/pull/1687#pullrequestreview-5446411378), [settings UI review](https://github.com/perminder-klair/subwave/pull/1687#issuecomment-6049471132), [provider repair and fallback review](https://github.com/perminder-klair/subwave/pull/1687#issuecomment-6049590864), [benchmark coverage and limitations](https://github.com/perminder-klair/subwave/pull/1687#issuecomment-6059503407), [upgrade and runtime review](https://github.com/perminder-klair/subwave/pull/1687#issuecomment-6123698342), [evidence and cancellation review](https://github.com/perminder-klair/subwave/pull/1687#issuecomment-6148385397), [final deadline fixes](https://github.com/perminder-klair/subwave/pull/1687#issuecomment-6153980213).

### Keep policy shared and evidence modest

When the same rule governs several paths, use the existing policy module. The review found repeated playlist and wildcard rules and two Leanings implementations that had already drifted. Consolidate the rule that is drifting; avoid unrelated restructuring simply because adjacent code could also be combined. Remove unused telemetry and controls rather than leaving features with no consumer.

Quote checking proves that facts were supplied; it does not prove their relevance to a musical preference. Prompt instructions alone do not enforce host priority. A valid ID does not prove a good musical choice. A review decision does not establish that its replacement survived the guards and reached the queue. Each public claim should be supported at the stage where it becomes true.

Use anonymised or synthetic fixtures. Keep research scratch work and unrelated feature switches out of the contribution. When an optional feature adds model calls, make its default, opt-in control, latency and token cost explicit. [Sources: runtime review](https://github.com/perminder-klair/subwave/pull/1687#issuecomment-6123698342), [Leanings evidence restrictions](https://github.com/perminder-klair/subwave/pull/1687#issuecomment-6148385397).
