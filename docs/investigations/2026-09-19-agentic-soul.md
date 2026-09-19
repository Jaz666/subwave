# Agentic Picker: natural DJ Soul investigation

Status: in progress. The production picker, live station settings, queue, and Docker stack are unchanged.

## Question

Does the Agentic Picker operationalise musical taste written naturally in a DJ Soul, without a separate `musicLean` field or Musical Leanings prompt?

The representative operator input is Bob: a warm, knowledgeable presenter who naturally states preferences for classic/alternative/indie/post-punk, melodic guitars, basslines, distinctive production, musicianship, deep cuts and overlooked discoveries, while avoiding manufactured pop and novelty records.

## Guardrails

- Every evaluator sets a fresh temporary `STATE_DIR` before importing controller modules.
- It never imports the broadcast queue, writes a station session, queues music, creates speech, scrobbles, changes settings, or runs Docker.
- LLM fallback is disabled in memory, so the named model is the sole model measured.
- In Soul experiments, `usedMusicalLeanings` and `leaningsTieBreak` are reported as `false`/`null`; self-reported reasons are not proof. Paired selections are the evidence.

## Experiment A: frozen candidates

Implemented in `controller/scripts/leanings-eval.ts --experiment soul`.

Control: Bob's presentation/personality without musical taste. Treatment: the full representative Bob Soul. The show brief is absent in both arms so its music direction cannot duplicate the Soul.

Three fixtures are paired under the same model, candidate order, and discovery budget. Candidate order rotates between iterations but is identical within a control/treatment pair.

1. Melodic guitar close call.
2. Warm melodic post-punk deep-cut close call.
3. Flow-only no-tie control.

### First run

```bash
cd /home/jaz666/codex/musical-leanings/controller
npm run leanings-eval -- --models openai:gpt-5.4-mini --experiment soul \
  --env-file /home/jaz666/Docker/subwave/state/secrets.env --iterations 8 \
  --out /home/jaz666/leanings-eval-reports/bob-soul-gpt-5.4-mini.json
```

48/48 calls completed, with no failures or harness violations.

| Fixture | Control | Treatment | Reading |
| --- | --- | --- | --- |
| Melodic guitar | `After the Static` 8/8 | `After the Static` 8/8 | Saturated: ordinary flow already selects the preference-aligned option. Replace this fixture. |
| Post-punk deep cut | `Grey Corridor` 8/8 | `Maps of the Rain` 5/8; `Grey Corridor` 3/8 | Five paired changes in Bob's intended direction. |
| No-tie flow control | `Open Window` 8/8 | `Open Window` 8/8 | No flow override. |

Aggregate: 5/24 paired changes, all toward the treatment preference; 0 away from it; 0 no-tie regressions. This is encouraging but not conclusive because only one close-call fixture discriminated.

## Experiment B: real library

Implemented in `controller/scripts/soul-library-eval.ts`. It reads the station's Navidrome connection from the supplied `setup-config.json`, resolves the following seeds by exact title/artist lookup, and uses the production Agentic discovery-tool registry against the real library:

- Echo & the Bunnymen — **The Killing Moon**: realistic post-punk/guitar close-call seed.
- Coldplay — **Yellow**: deliberately broad, safe radio flow-control seed.

The evaluator's only external operation is read-only Subsonic/Navidrome discovery. Its telemetry and temporary local-library data remain under the disposable state directory.

```bash
cd /home/jaz666/codex/musical-leanings/controller
npm run soul-library-eval -- --models openai:gpt-5.4-mini \
  --station-state /home/jaz666/Docker/subwave/state \
  --env-file /home/jaz666/Docker/subwave/state/secrets.env \
  --iterations 6 \
  --out /home/jaz666/leanings-eval-reports/bob-soul-library-gpt-5.4-mini.json
```

Interpret title changes only alongside the candidate trail and paired distribution. Success means a repeatable Soul-direction shift after *The Killing Moon* without arbitrary or flow-poor drift after *Yellow*.

### First run: exploratory only

Executed with six control/treatment pairs per seed. Report: `/home/jaz666/leanings-eval-reports/bob-soul-library-gpt-5.4-mini.json`.

- 24/24 calls completed; 0 failures.
- The exact currently tagged library IDs resolved at run time were `0zXzCFvvoTBmnK10WN6f5I` for *The Killing Moon* and `7k8LRvBFeht0wDzVcUVBxj` for *Yellow*.
- 11/12 paired selections differed. The Soul arm often selected clearly Bob-aligned material: Echo & the Bunnymen, Editors, Killing Joke, the Stranglers, the Verve, Blur, and the Charlatans.

This run is **exploratory, not causal evidence**. The genuine Agentic discovery tools are stochastic and each arm can receive a different candidate set; a difference can therefore result from discovery as well as the Soul. It demonstrates that the real library path, both supplied seeds, the model, and the isolated evaluator all work together. It does not establish that the Soul alone caused 11/12 changes.

The confirmation harness must obtain a real-library candidate snapshot once for each seed/iteration, then hand the identical snapshot and ordering to both persona arms. It may still use the normal production retrieval methods to create that snapshot; only the final comparison is frozen. It should record the complete candidate snapshot beside every pair.

### Confirmation run: same real candidates in both arms

The evaluator now captures one read-only Navidrome `getSimilarSongs` snapshot per seed/iteration, rotates its order between iterations, and exposes that identical snapshot to both arms. Report: `/home/jaz666/leanings-eval-reports/bob-soul-library-confirmation-gpt-5.4-mini.json`.

- 24/24 calls completed; 0 failures.
- Candidate snapshots, including title/artist/id and their order, are recorded in every run record.
- 4/12 paired choices changed under identical candidates.
- *The Killing Moon* saturated on `Down` by the Stranglers in both arms (6/6), so its current real-library similar-song set is not a useful close-call fixture.
- *Yellow* produced 4/6 causal changes. The Soul arm chose Embrace, Blur, and Echo & the Bunnymen alternatives while the control chose Snow Patrol, Echo & the Bunnymen, and Embrace. These are valid evidence that the Soul can change final choices under fixed real candidates, but the preference direction is mixed/underspecified: the fixture does not label one candidate as more Bob-aligned than another.

Conclusion so far: ordinary Soul prose can influence a final Agentic choice with real library material, but neither supplied seed is yet a complete decision fixture. Replace the saturated *The Killing Moon* snapshot with a deliberately balanced real candidate set, and score the *Yellow* snapshot's candidates in advance for Bob alignment before treating its changes as favourable or adverse.

## Local 8B model run

The station's configured local provider is `openai-compatible` at `http://qwen-llama-cpp:8080`, serving `/models/Meta-Llama-3.1-8B-Instruct-Q5_K_M.gguf` with a 12,288-token context window.

### Pre-existing operational context

This GPU/model combination has historically struggled with the Agentic Tools picker: tool-loop reliability, context capacity, and the cost/latency of model-led discovery have all been practical concerns. That pre-existing experience is why the Track Shortlist Picker project was started: it lets the Controller perform library exploration and gives the local model a bounded final editorial choice instead of asking it to drive the entire discovery loop. The present investigation does not treat a local Agentic result as a verdict on the Shortlist route; it tests the narrower question of whether natural Soul prose can influence an Agentic final choice when the model completes one.

The first six-iteration confirmation attempt used 20 real candidates per snapshot. It completed 17/24 calls. Six full-Bob treatment calls from the *Yellow* arm failed before inference because the request was 12,367 tokens, 79 over the available context. One further treatment call was a validation violation. The old `choiceChanges: 12/12` count was an evaluator accounting bug: a missing treatment had been counted as a changed choice. The corrected interpretation is five complete pairs, all of which changed selection; that is too small and unbalanced to interpret.

The evaluator now defaults to an eight-candidate real-library snapshot (minimum three, maximum 20) and counts changes only among complete pairs. This preserves paired real-library comparison while fitting the full Soul inside the local model's context. The rerun should be recorded separately from the failed 20-candidate attempt.

### Valid 8-candidate confirmation run

Report: `/home/jaz666/leanings-eval-reports/bob-soul-library-confirmation-llama-3.1-8b-cap8.json`.

- 24/24 calls completed; 12/12 complete pairs; 0 failures.
- 5/12 paired selections changed with the same real candidate snapshot and order in each arm.
- *The Killing Moon*: 2/6 changes. Bob shifted Neil Young → Manic Street Preachers and Coldplay → the Stranglers; both are plausibly aligned with Bob's alternative/post-punk/guitar preference.
- *Yellow*: 3/6 changes. Bob selected Blur instead of Radiohead and Kaiser Chiefs on two pairs, a direct fit with the stated Britpop preference. One remaining change, Embrace → Snow Patrol, is not clearly favourable or adverse from the Soul alone.

The result supports the narrower conclusion across both tested model classes: a natural, user-style Soul can influence a completed Agentic final choice. It does **not** establish that Agentic Tools is the preferred local-model picker architecture; the historical reliability and context constraints documented above remain reasons to retain Track Shortlist as its own supported route.

## Why Musical Leanings became a separate field

The original shared-field commit (`ec0c7f16`, 14 September) documents the design intent explicitly: Soul was treated as the DJ's voice/personality input, while `musicLean` was a private, music-specific soft tie-breaker. The field was meant to apply consistently across picker implementations and never affect listener-facing speech, override show rules, rotation, safety, or flow.

This arrived alongside the Shortlist work, whose original compatibility contract was a behavioural substitution: move discovery into controller code, retain the DJ's bounded final editorial choice, and add no new musical weighting or policy. That contract does not require a separate `musicLean` field. It explains why a portable selection-specific field was attractive while Agentic, Candidate Pool, and Shortlist routes coexisted; it does not demonstrate that Soul prose is insufficient for Shortlist.

The archived Producer Routing findings add a more specific origin: the retained useful feature was “Musical Leanings as a weaker guest influence.” A separate structured field gives the controller a way to make a guest's taste explicitly secondary to host intent and every hard selection guard. That is a stronger historical justification than “the host Soul cannot guide selection.”

The early Track Shortlist implementation supports the distinction. Its final `djPick` call already uses the normal persona-aware picker system prompt, so the on-air host Soul is present in the bounded final-choice call. The additional Shortlist prompt says only **if** Musical Leanings are present, use them as a close tie-breaker. In other words, the architecture was designed to operate without the field; the field was optional selection context, especially useful for guest/host weighting and a portable explicit operator control.

Archived evidence explains the Shortlist project's original motivation separately. With the local 8B model, historic Agentic tool-loop benches averaged 20.6 seconds at one discovery step, 27.0 seconds at three, and 92.3 seconds at five; five-step p95 reached 196.1 seconds. Discovery-tool transcripts and repeated LLM turns were identified as the bottleneck. Those measurements support controller-native discovery plus one bounded DJ choice; they are not evidence that host musical taste must live outside Soul.

The historical design notes contain two conceptual statements rather than a measured conclusion: one says a durable Soul includes “tastes” and “stable relationships to music”; another separates Soul as delivery/personality from a softer lead-presenter Musical Leaning. The present controlled experiments are the first evidence needed to resolve that ambiguity for a host's final selection.

## Next question: Shortlist with Soul alone

The next controlled experiment should mirror the Agentic confirmation exactly, but invoke the Shortlist final-selection call rather than the Agentic tool loop.

- Same Bob control and treatment Souls.
- `musicLean` absent in both arms; no Leanings reminder, badge, or field-specific prompt wording.
- Same real-library candidate snapshot and ordering within every pair.
- Same *The Killing Moon* and *Yellow* seeds initially, with an additional balanced fixture if either remains saturated or directionally ambiguous.
- Measure completed pairs, changed choices, preference-direction changes, no-tie regressions, and failures/context usage.

If Shortlist produces comparable Soul-direction changes, strip Musical Leanings out of the Shortlist experiment branch and retain the field only if operators value the explicit separate control. If it does not, the field has a demonstrated Shortlist-specific role rather than an assumed one.

### Implemented test harness (awaiting local run)

The matching harness is implemented on the Shortlist PR branch as `controller/scripts/shortlist-soul-eval.ts` (package command: `shortlist-soul-eval`). It calls the production `djPick` final-selection function, rather than reproducing its prompt. It uses the same read-only Navidrome similar-song snapshots and paired, rotating candidate order as the Agentic library confirmation.

The isolation is deliberately asserted at the invocation boundary: Bob's persona has no `musicLean`, `editorialLeanings` is passed as `null`, and report fields record `usedMusicalLeanings: false` and `leaningsTieBreak: null`. A result which nevertheless returns a Leanings flag is marked a violation. This makes a measured effect attributable to ordinary persona Soul rather than to the new `djPick` Leanings code.

The harness has not yet been run against the local model. The Shortlist worktree does not currently contain its JavaScript dependencies, so its TypeScript validation and model execution should be performed locally after installing that worktree's dependencies.

### Result: local Track Shortlist confirmation (19 September)

The local Meta Llama 3.1 8B Q5 model completed all 24 calls: 12/12 complete control/Soul pairs, 6/12 changed final selections, and zero failures. The report is `leanings-eval-reports/bob-shortlist-soul-confirmation-llama-3.1-8b-cap8.json`. It used the host-reachable llama.cpp endpoint, an eight-track candidate cap, six rotations for each of *The Killing Moon* and *Yellow*, and no Leanings input at all.

| Seed | Changed pairs | Directional reading |
| --- | ---: | --- |
| *The Killing Moon* — Echo & the Bunnymen | 2/6 | Soul chose Manic Street Preachers instead of Jim Bob once (a direct alternative/guitar fit), and Harry Nilsson instead of Jim Bob once (a weaker but plausible classic-record/atmosphere choice). |
| *Yellow* — Coldplay | 4/6 | Soul chose Blur over the Auteurs twice (the clearest Britpop preference signal), and Kaiser Chiefs rather than the Verve/U2 twice (a plausible indie/guitar direction, though less conclusive). |

Selection reasons must not be used as the causal evidence: the local model often described both arms in generic flow language, and the Leanings guard correctly removed profile-referencing reasons. The causal evidence is the frozen, identical shortlisted candidates in each pair plus the only changed input, Bob's natural Soul.

This is strong preliminary evidence that the Track Shortlist Picker can infer and act on a host's musical taste from a vanilla Soul. Its 6/12 completed-pair response is comparable to the local Agentic confirmation's 5/12, despite the Shortlist path avoiding the Agentic tool loop. It does not prove that every Soul is equally strong or that every change is directionally favourable.

### Reliability correction: A/A null calibration required

The model is sampled at its production temperature (`0.5`). Therefore a control-versus-Soul changed choice is not, by itself, a definite causal attribution: some portion may be ordinary sampling variation. A trustworthy operator-facing indicator cannot be a model self-report or a reason-text keyword; both merely assert influence and are especially unreliable on the tested local model.

Both evaluators now make four counterbalanced calls per candidate snapshot: `control-a`, `control-b`, `soul-a`, and `soul-b`. They report two same-input A/A null pairs and two control-versus-Soul A/B effect pairs. The Soul effect is detected only if its completed-pair change rate materially exceeds the null rate. This is the same criterion for Agentic and Shortlist, and is the first valid basis for claiming an observable Soul-preference effect.

The revised test is still read-only, but increases the local run from 24 to 48 model calls per picker. It is an offline calibration/preview mechanism, not a per-song live badge: per-pick causal attribution would require an expensive shadow rerun and cannot be made reliable from the original model response alone.

### Shortlist null-calibration result (19 September)

The revised local Shortlist run completed 48/48 calls with zero failures. Its A/A null comparison changed 9/24 times, and its neutral-Soul-versus-full-Soul comparison also changed 9/24 times. The fixture split was identical too: *The Killing Moon* was 2/12 null and 2/12 Soul; *Yellow* was 7/12 null and 7/12 Soul. Report: `leanings-eval-reports/bob-shortlist-soul-null-calibration-llama-3.1-8b-cap8.json`.

This removes the apparent Shortlist effect in the earlier 6/12 test: on this local model and these real-library fixtures, it is indistinguishable from ordinary sampling variation. Consequently there is **no reliable per-pick detector of vanilla Soul preference use for Track Shortlist**. A model-provided boolean or selection-reason wording would be weaker evidence still, because it would be unverified self-report.

For an operator-facing, truthful indicator, the current viable alternatives are: (1) retain an explicit Musical Leanings input and show its verified `usedMusicalLeanings` flag, or (2) present an offline, repeated A/A-versus-A/B calibration/preview after a Soul edit, labelled as an aggregate test rather than an individual-pick attribution. The same null-calibrated Agentic experiment remains necessary before deciding whether route parity means restoring the explicit field to both pickers or exposing it only where it can be verified.

### Agentic null-calibration result (19 September)

The matching local Agentic run completed 48/48 calls with zero failures. Its same-Soul A/A null comparison changed 14/24 times. Its neutral-Soul-versus-full-Soul A/B comparison changed 12/24 times: two fewer than the null baseline, not more. Report: `leanings-eval-reports/bob-agentic-soul-null-calibration-llama-3.1-8b-cap8.json`.

This establishes route parity for the local Meta Llama 3.1 8B Q5 configuration: neither the Agentic Picker nor the Track Shortlist Picker produces a detectable vanilla-Soul musical-preference signal above normal sampling variation. The preliminary 5/12 Agentic and 6/12 Shortlist comparisons must therefore be treated as uncalibrated observations, not evidence of causal influence.

**Product conclusion:** a station should not display a per-pick indicator that claims Soul preferences influenced selection. It would be unverifiable and, on the tested local configuration, misleading. If operators need a visible, editable, and auditable musical-control surface, Musical Leanings supplies it: the field can remain a private soft tie-breaker and the existing verified `usedMusicalLeanings` flag can power the indicator consistently in both picker routes. Guest weighting remains an optional later policy layer, rather than the primary justification for the field.

### Existing Agentic Leanings diagnostic: what it can and cannot mean

The Agentic PR already contains the diagnostic that had been under development. Its required structured response has `usedMusicalLeanings` plus `leaningsTieBreak`; the controller accepts the flag only when Leanings were actually supplied, the model explicitly says `true`, and it gives a non-empty specific trait. It then keeps the proof private in the queue/telemetry record and removes unsupported Leanings wording from the normal selection reason. This is a materially safer contract than a free-text keyword badge.

The original cloud fixture run (`gpt-5.4-mini.json`) illustrates its limit. In the warm-melody close-call, the Leanings arm made the accepted claim 7/8 times, while the same choice was returned in both arms. The control arm made the same raw claim 8/8 times, but the controller correctly rejected it because no Leanings context existed. Thus the diagnostic reliably records a **model-supported Leanings tie-break claim with a concrete trait**; it is not an independently proven counterfactual that the selected id would have been different.

This resolves the earlier difficulty in “getting Agentic to flag whether Leanings were working.” The plumbing and guarded declaration now work; no runtime mechanism can turn that declaration into a causal proof for a sampled model. Operator copy must therefore say “Musical Leanings applied” or “Leanings tie-break: [trait]”, never “Leanings changed this pick.”

### Harness-first diagnostic work (next)

Because the live local Agentic Picker can struggle with multi-pass library discovery, diagnostic development continues in the frozen-candidate `leanings-eval` harness rather than on air. It invokes the production Agentic schema, system prompt, reminder, and bounded two-step tool loop, but supplies identical in-memory discovery results and an isolated `STATE_DIR`.

The harness now accepts `--base-url` so it can target the host-reachable local llama.cpp server without reading or changing live station settings. For the Leanings experiment it reports: accepted Leanings declarations, declarations in close-call fixtures, false positives in the explicit no-tie fixture, raw declarations made without Leanings context (which the controller rejects), unsupported evidence, and failures. Type checking, the focused `musical-leanings` test, and a local-provider dry run passed before any model evaluation.

The first local development run (four repetitions, 24 calls) completed without failures or controller violations. It accepted Leanings claims in 7/8 intended close calls, had 0/4 false positives in the no-tie flow control, and rejected 2/12 raw `usedMusicalLeanings: true` claims from the no-Leanings control arm. The one missed close-call declaration chose the ordinary flow candidate and correctly returned false, which is a safe false negative rather than a misleading badge. The next harness iteration should strengthen fixture-specific evidence matching before deciding an acceptance threshold or exercising the live station.

That stricter evidence check is now in place. Its expected candidate traits are held outside the data returned to the model, so they cannot coach its answer. A claim must match at least two meaningful words from a specific expected trait (or all words of a two-word trait); generic single words are insufficient. Type checking, the focused Leanings test, and the local-provider dry run pass with this stricter criterion. The next local run should use eight repetitions (48 calls) and treat `fixtureSpecificEvidence` alongside declaration and no-tie rates as the diagnostic acceptance evidence.

The first strict run accepted 10/16 close-call declarations and 0/8 no-tie false positives, but only 7/10 accepted claims carried fixture-specific evidence. All three unsupported claims selected the ordinary electronic-flow candidate and offered `raw club energy` / `club feel`—facts about the track's flow, not traits matching the supplied Leanings. The production Agentic schema and event reminder were therefore tightened: a `leaningsTieBreak` must directly match the supplied Leanings and generic energy, pace, key, or club-feel descriptions are expressly invalid. Type checking and the focused test passed after this prompt-contract refinement. The next run tests whether the local model follows the clarified boundary.

After that clarification, the local model still made 9/16 close-call declarations and 0/8 no-tie false positives, but the initial strict scorer accepted only 4/9. Inspection separated two scorer false negatives from three genuine unsupported claims: concise `warm vocal` evidence correctly referred to the warm-vocal fixture but had been rejected because the matcher accidentally required all three words; meanwhile one ordinary-flow `raw club energy` claim and two copied cross-fixture warmth/melody claims did not match the supplied electronic Leanings. The matcher now accepts two of three words for a concise trait while retaining a three-word requirement for longer traits. The prior run would consequently score 6/9 fixture-specific claims; a fresh repeated run is still required before accepting the diagnostic for any product surface.

The confirmation run produced 8/16 close-call declarations, 0/8 no-tie false positives, and 6/8 fixture-specific claims. It remains below the provisional 80% grounding threshold. Its two unsupported declarations both chose the ordinary electronic-flow candidate: one copied the preferred candidate's `electronic textures and distinctive production` onto that different track, while the other again cited only `raw club energy`. This is a clear local-model limitation, not a further prompt-wording problem.

**Harness conclusion:** the tested local Agentic model does not support a causal per-pick claim such as “Leanings changed this pick.” It can, however, surface the existing compact `LEANINGS` marker as a model diagnostic, matching the established Shortlist debug UI. The marker means the picker returned the structured Leanings signal; it is not a counterfactual proof. Operators should also see whether Musical Leanings are enabled as an explicit station control.

### Cloud-model comparison: Agentic diagnostic (19 September)

The identical 48-call harness on `openai:gpt-5.4-mini` completed with zero failures and zero violations. It made accepted Leanings declarations in 7/16 close calls, 0/8 no-tie controls, and all 7/7 declarations contained fixture-specific evidence. Six of the seven claims also coincided with a changed control-versus-Leanings selection; one did not. Every accepted declaration came from the warm-melody fixture and named the expected warm-vocal/melodic-hook traits. Report: `leanings-eval-reports/agentic-leanings-diagnostic-gpt-5.4-mini-v1.json`.

This is a capability distinction, not a field-design reversal. The cloud model is conservative (absence of a badge does not mean Leanings were ignored), but its positive claims meet the present grounding check. The local model's positive claims are less dependable. The compact `LEANINGS` marker is still useful as a transparent picker diagnostic when described as model-reported rather than causal proof; cloud-capable models can support stronger operator confidence. The existing Shortlist debug UI already renders this marker, so the combined release should provide the same presentation for Agentic and Shortlist. Users whose local Agentic model cannot produce or sustain the diagnostic can choose the bounded Shortlist path, subject to its own capability testing.

The shared debug component now recognises controller-verified Leanings diagnostics from all three relevant calls: `djAgentPick`, `djShortlistPick`, and `djShortlistRepick`. The existing compact `LEANINGS` marker therefore remains one familiar operator surface regardless of picker implementation. Web type checking passed after the integration change.

The harness was typechecked and its `shortlist-runner` tests passed after a minor pre-existing debug-only type mismatch was removed (`journeyActive` was supplied by the debug route but was not a `ShortlistSelectionContext` property or consumed by the prompt). That repair does not change a production selection input.

## Decision rule

If the real-library result corroborates the frozen experiment, Agentic Picker should keep natural Soul prose as its musical identity surface and separate Musical Leanings should be Shortlist Picker-only. If not, refine fixtures/instrumentation before considering any explicit Agentic comparison mechanism.
