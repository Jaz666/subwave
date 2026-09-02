# FunctionGemma tool-parity handover — 2026-08-30

## Read this first

The live test station is intentionally using a split picking architecture:

```text
FunctionGemma → chooses one bounded discovery tool
Controller → validates/executes the tool and builds a grounded shortlist
Configured creative DJ LLM → makes the final editorial track choice
Controller → validates, applies artist/no-repeat safeguards, queues the track
```

This is the settled test-station path for now. Do not revive FunctionGemma
final-track selection as part of tool-parity work.

## Current live configuration

`/home/jaz666/Docker/subwave/.env` currently contains:

```dotenv
PRODUCER_ROUTER_BASE_URL=http://host.docker.internal:8098/v1
PRODUCER_ROUTER_MODEL=/models/Subwave-FunctionGemma-270M-Selector-v4-ID-Only-Q8_0.gguf
PRODUCER_PERSONA_FINAL_CALL=0
```

The active discovery container is therefore:

```text
functiongemma-v4-selector-test
model: Subwave-FunctionGemma-270M-Selector-v4-ID-Only-Q8_0.gguf
endpoint: http://host.docker.internal:8098/v1
```

`functiongemma-v10-test` is still running with the Router V10 model, but is
not connected to the controller. Keep it as an available reference/rollback;
do not mistake it for the active route.

The operator has changed the configured final creative model away from Qwen
while observing the station. Recent real picks showed roughly 4.9s for the
FunctionGemma discovery call and roughly 6s for the creative Llama 3.1 final
selection, versus roughly 23s for Qwen final selection. Treat these as
preliminary live observations, not a formal latency benchmark.

## Why final selection returned to the creative model

FunctionGemma can return one grounded candidate ID, but two hybrid candidates
did not demonstrate dependable editorial judgement: they repeatedly favoured
the first/same-artist or familiar-single-like candidate in held-out controls.
The active V4 selector showed the same same-artist behaviour. The controller's
artist guard can repair that specific case, but it cannot safely encode every
operator's musical leanings as hard rules.

The final model now receives the full grounded candidate metadata and show
brief, so it owns flow, variety, editorial taste, a private pick reason and
transition proposal. Its reason is internal/Booth Log material, not spoken
output.

The old hard-coded `show-brief-conflict` rule for “obvious single” versus
“overlooked album track” was removed. It was an inappropriate generic example
of a musical leaning and was inert in the live caller anyway.

## What was completed for tool parity

`controller/scripts/functiongemma/training-data.ts` now has contracts and
training families for the five vanilla discovery tools previously omitted:

- `tracksThatSoundLikeThis`
- `searchByLyrics`
- `searchBySound`
- `topSongsByArtist`
- `recentByArtist`

The ordinary runtime picker registry already exposes the full vanilla discovery
surface. The remaining problem is the active V4 model's learned distribution:
the prior soak was dominated by `tracksTowardJourney`, `tracksLikeThis`,
`showPlaylistTracks` and `similarSongs`.

Do not force optional tools merely for statistical fairness. A user may have no
starred tracks, sparse tags, or a very different library. The model should use
only an offered, applicable tool; tool availability and controller gates remain
authoritative.

## Unpromoted experiments

Two local hybrid router-plus-selector experiments were trained and evaluated:

```text
controller/scripts/functiongemma/training/output/router-v11-hybrid
controller/scripts/functiongemma/training/output/router-v12-hybrid-corrected
```

Neither is approved for conversion or deployment. Keep their reports as
evidence of the final-selection boundary, but do not consume time retraining
that selector design in the next task.

The associated source experiment is:

```text
controller/scripts/functiongemma/hybrid-data-cli.ts
```

It is not the next training path. The next candidate should be router-only.

## Next task: router-only parity candidate

1. Start from the known V10 router checkpoint, not a selector checkpoint.
2. Build a router-only corpus covering all 17 ordinary vanilla discovery tools,
   with useful recovery examples and the existing hierarchy/genre protections.
3. Keep optional capabilities conditional: no synthetic requirement to use
   starred, deep cuts, artist routes, lyrics or sound search when they are not
   offered by the controller.
4. Expand the frozen validation suite to cover every newly added tool and its
   required arguments, plus offered-versus-selected behaviour.
5. Run native deterministic evaluation first, then text-only GGUF preparation,
   Q8 conversion and CPU llama.cpp evaluation/soak.
6. Compare tool availability and selections with equivalent Vanilla picker
   contexts. Measure real tool relevance, not raw equal-frequency usage.
7. Only deploy a new discovery model if it preserves the existing hierarchy,
   playlist, journey, grounding and recovery guarantees while improving the
   observed four-tool concentration.

The final creative DJ/controller selection must remain in place throughout
this work.

## Related current source/deployment changes

- `controller/src/broadcast/dj-agent.ts`: FunctionGemma is discovery-only in
  the active configuration; final and corrective choices use the normal
  Producer/controller LLM path.
- `controller/src/llm/internal/producer/persona-final-call.ts`: removed the
  dead show-brief special case; only grounded-ID, artist-variety and actual
  recent-rotation veto concepts remain.
- `controller/scripts/persona-final-call.test.ts`: updated accordingly.
- `.dockerignore`: ignores FunctionGemma training data and output directories,
  preventing multi-GB Docker build contexts.

Focused tests already run successfully:

```bash
cd /home/jaz666/Docker/subwave/controller
npx tsx scripts/persona-final-call.test.ts
npx tsx scripts/final-selection-route.test.ts
npx tsx scripts/producer-router.test.ts
```

Lint had no errors; `dj-agent.ts` continues to have pre-existing `any` warnings.

## Naming follow-up (deferred)

`djProducerSelect` and the associated system wording are historical names. It
now represents the DJ's final editorial choice, not a separate Producer persona.
Rename it only as part of the later FunctionGemma/default-LLM cleanup, not this
router-parity task.


## Live canary incident: delayed Producer pick (2026-08-30)

During the six-hour live canary, one `djProducerPick` call was recorded as a
426.6-second failure. The incident window was 15:43:45–15:50:52 BST
(14:43:45–14:50:52 UTC).

Evidence from the controller and inference-server logs:

- 15:43:45 BST: the FunctionGemma Producer Router exhausted its shared
  deadline and entered the normal complete-Producer fallback.
- 15:43:46–15:43:52 BST: the fallback Llama 3.1 request completed normally;
  llama.cpp recorded approximately 3.3 seconds of inference time.
- The Producer selected `tracksLikeThis`. The next Llama request, containing
  that tool result, was not sent until 15:50:52 BST.
- At 15:50:52 BST the controller reported missed 15:45 and 15:50 cron
  executions, then recorded the 90-second `djProducerPick` deadline failure.
- The Qwen4B container had no activity in this interval and is not implicated.

The delay therefore occurred between the two Producer calls, while executing
the discovery tool. The leading suspect is synchronous SQLite/library work in
the lazy `tracksLikeThis` path (`library.load()` / the KNN query), potentially
waiting on or opening the shared `library.db`. No concurrent analyzer or
broadcast database activity was visible in the corresponding container logs.

Treat this as an isolated incident for now: the other 316 calls completed, and
the normal successful-call latency remained in the expected range. No runtime
change was made. If the same multi-minute gap, missed cron executions, or
another picker deadline failure recurs, instrument `library.load()`, the KNN
query and SQLite lock/open timing first, then move library initialisation to
controller startup or otherwise remove the blocking path from live picker
execution.


## Continuation update — 2026-08-31

This section supersedes the earlier “Current live configuration” and “Next
task” sections where they conflict. It is the concise starting point for the
next chat.

### Deployed router and model status

- Router-only parity training is complete. The candidate was trained from the
  V10 router checkpoint, not a selector checkpoint, using the v5 corpus.
- Native and Q8 evaluations: routing 19/19; recovery 2/2. Novel Q8 soak:
  126/128 (98.4%).
- The active model-server container is `functiongemma-v13-router-test`, serving
  `Subwave-FunctionGemma-270M-Router-v13-V10-Parity-Q8_0.gguf` on host port
  8098 from `/media/ssd/training/router-v13-v10-parity`.
- The controller’s effective environment had still named the old V4 model at
  the time of the canary, while its 8098 endpoint was serving V13. Therefore
  the debug dashboard can label calls “V4” even though V13 handled them: the
  dashboard records the configured model string and does not query `/v1/models`.
  Recheck the controller environment before relying on that label.
- V4 was retained as rollback material but is not the active endpoint.

### Live observations and interpretation

- Six-hour canary: 317 LLM calls, 99% success, median ~5.9s and P95 ~11.6s.
  The FunctionGemma discovery call itself is normally about 1–2 seconds; the
  creative Llama final selection remains the larger cost.
- Initial call mix was strongly journey-led (`tracksTowardJourney` 57 of 107),
  but the following morning’s 74 calls were more diverse: playlist 30, journey
  18, genre 14, energy 10. Do not conclude either bias or parity from one show:
  Dawn Chorus’s playlist, strict rules and an active journey strongly shape the
  offered context.
- Two router steps mean exactly: initial tool returned zero eligible candidates,
  then a different recovery tool also returned zero. They do **not** mean the
  model has performed two complementary successful searches.
- At 07:51:36 BST, in The Dawn Chorus, FunctionGemma chose
  `showPlaylistTracks → tracksTowardJourney`; both returned zero. The normal
  producer fallback independently called `tracksTowardJourney` and received:
  “60 matching tracks exist but were all played recently, already shown this
  pick, or outside this show’s strict filters.” It then safely fell through to
  the broad picker pool and aired Apple Boutique. This is narrow-pool exhaustion,
  not a FunctionGemma fault.
- A separate AudioMuse sonic-similarity service at `doc.home:8181` was stopped.
  Navidrome forwards its sonic-similarity endpoint to it, so
  `tracksThatSoundLikeThis` is presently empty/fails safely until the operator
  starts AudioMuse again. This did not cause the Dawn Chorus router failure.

### Library tags: relevance to FunctionGemma

- FunctionGemma does not generate or interpret library mood tags. It selects a
  discovery tool; the tool then queries the library’s existing metadata.
- The overnight Llama-only re-decide scan completed successfully. All 46,116
  non-empty LLM mood rows now have current Llama provenance, eliminating the
  previous mix of OpenAI and Qwen labels.
- However, 14,167 tracks now have an empty mood array because Llama abstained
  despite otherwise clear title/artist/genre metadata. This is a coverage and
  candidate-pool concern, not a FunctionGemma compatibility problem. It can
  indirectly increase empty mood/journey discovery results and hence recovery
  calls/fallbacks.
- Re-enabling the backup LLM alone does nothing. A normal forward “Tag moods”
  run will revisit empty rows; an admin re-scan “Re-decide moods” run will not,
  because it only re-tags non-empty stale rows. Dual-LLM tagging splits work by
  throughput, so this would reintroduce mixed provenance. Sample and evaluate
  the backup model on the empty rows before any bulk recovery run.

### Router depth experiment (not implemented)

Current FunctionGemma policy is hard-coded to one discovery call plus **one
recovery call only when the first source has no candidates**. It stops at the
first successful source. Vanilla’s 1–5/Auto discovery-round setting is not
currently represented by the FunctionGemma path.

The agreed future experiment is an opt-in depth policy, keeping today’s path
as the default:

1. Baseline: current one call + empty-result recovery.
2. Depth 2: deliberately gather a complementary second source after a
   successful first source.
3. Depth 3: only add a third source if the merged candidate pool is thin.
4. Measure tool/candidate counts per round, route latency, final-producer token
   cost, final-pick success, fallback rate and variety.

Run this on deliberately contrasting test shows (different genre/mood/energy,
playlist and journey combinations), one or two hours each. Do not generalise
from Dawn Chorus. More rounds need code and likely new training/evaluation;
V13 was trained for the current one-plus-recovery contract.

### Clean vanilla comparison later

Turning off **Producer Routing** in Settings (`settings.llm.producer.enabled`)
returns track picks to the established all-in-one `pickerAgent`, including its
normal 1–5/Auto discovery behaviour. It stops FunctionGemma from participating
in track selection.

For a completely FunctionGemma-free A/B baseline, also set this controller
environment variable and recreate the controller:

```dotenv
PRODUCER_ROUTER_SEGMENTS=0
```

It is currently `1`, which independently enables FunctionGemma routing for
scheduled skills/segments. The FunctionGemma container/model configuration may
remain present but idle. Keep Llama, library, shows and other station settings
unchanged while collecting before/after data.

### Branch/deployment state

- Live working tree: `/home/jaz666/Docker/subwave`, branch
  `live/producer-routing`.
- Day’s parity work committed as `b9ae1d36 feat: complete producer routing parity work`.
- Pair-blend observability was merged as `545b3a69 merge: add pair blend diagnostics`.
  It adds `Pair blend` to Queue’s next-transition label and debug transition
  statistics; it is not a mixing-behaviour change.
- Rebuild only the controller when ready to activate that merged diagnostic:

```bash
cd /home/jaz666/Docker/subwave
docker compose build controller
docker compose up -d controller
```

- No web rebuild is required. The only known untracked live-tree content is
  generated FunctionGemma corpus data under
  `controller/scripts/functiongemma/training/data-router-v5/`; do not commit it.

### 2026-08-31 follow-up: shortlist-depth test and next session

#### Live test state

- The live router remains V13 on port 8098:
  `Subwave-FunctionGemma-270M-Router-v13-V10-Parity-Q8_0.gguf`.
- The controller safeguards from this work are deployed. They reject a mutated
  current-artist argument, prevent the empty `searchBySound` → sibling audio
  retry, and make malformed first calls recover through a different tool.
- The active experiment is deliberately forced two-source shortlisting:

  ```dotenv
  PRODUCER_ROUTER_DISCOVERY_DEPTH=2
  PRODUCER_ROUTER_TIMEOUT_MS=30000
  ```

  The shared 15-second router deadline was too short for two serial calls: the
  route aborted at approximately 15,000 ms and fell through to `djProducerPick`.
  The 30-second setting is required for this experiment; it is not a claim that
  30 seconds is the desired normal shortlist budget.
- `PRODUCER_PERSONA_FINAL_CALL=0`. FunctionGemma only makes discovery calls;
  the established Producer selector performs the editorial final choice and
  transition choice. Transition frequency/variety is therefore already the
  normal policy and is out of scope for FunctionGemma training.

#### Measured forced-two-call run

At the point of handover:

| Kind | Calls | Success | Average | Tokens |
| --- | ---: | ---: | ---: | ---: |
| `djProducerRoute` | 51 | 51/51 | 20.1s | 288.2k |
| `djProducerSelect` | 50 | 50/50 | 51.6s | 290.2k |

- The route experiment reached 100% success after increasing the deadline.
- The combined average is about 71.7s. The final local Llama 3.1 8B selection
  latency already exceeds the normal 45-second end-to-end redline; that is a
  final-selector performance question, not a FunctionGemma shortlist failure.
- A 20.1s forced two-call shortlist is viable as an experiment on Ryzen 5-class
  hardware, but too costly to make the normal default without a clear quality
  benefit.
- Suggested shortlist service targets for average hardware: one-tool normal
  case <=12s average; conditional second source <=22s average; 30s hard cap.
  Capture p50, p95 and maximum next time rather than relying only on averages.

#### Discovery semantics: agreed direction

Vanilla discovery is conversational: after each result the model can choose
another tool or commit a pick. The current FunctionGemma router is controller
policy, not equivalent model-led stop/continue behaviour.

- For providers whose configured effective discovery budget is **one** round
  (the current local `openai-compatible` Llama 3.1 8B has
  `discoverySteps: 0`, which resolves to one): keep one normal discovery call;
  allow a different second source only for an invalid, empty or thin result.
- For providers configured for **two or more** discovery rounds: use two
  complementary normal sources; permit a third only for invalid/empty/thin
  results. Do not force four or five calls simply because vanilla permits that
  ceiling for capable cloud models.
- If true vanilla multi-round parity is wanted later, train and evaluate a
  separate router stop/continue decision after each result. It must decide
  whether the shortlist is sufficient; it must not choose the final track.

#### Candidate-pool observations

- Standard picker tools normally add up to eight fresh, de-duplicated tracks
  to the shared pool. `showPlaylistTracks` is the intentional exception and
  can add twelve.
- Vanilla has no overall candidate cap; its practical local FunctionGemma-like
  one-round pool is usually about eight. A forced two-source route can naturally
  produce 16–24 candidates. The observed 21-candidate final request is normal,
  not evidence of a broken merge.
- Do **not** add a global candidate cap merely to imitate the one-round local
  profile. Fast cloud models can use a larger pool effectively. If local final
  selection needs a smaller menu, test a shortlist ranking strategy separately:
  favour unaired tracks and longer `artist_last_played_days_ago`, retain entries
  with missing history, and preserve representation from each source. Treat
  recency as a ranking signal, not a hard exclusion.

#### Tool variety and training follow-up

The forced-two-call spread (113 recorded calls) was led by `searchLibrary` 45,
`tracksTowardJourney` 34 and `showPlaylistTracks` 12. `songsByGenre` recorded
three failures from six calls, while all 51 routes succeeded due to recovery.

Next implementation candidate: for one-round profiles, retain the last two
successful *primary* discovery tool names. On a third identical primary in a
row, temporarily hide that tool and request a different valid source. Exempt a
tool explicitly required by the current brief (for example an active journey),
and do not block the only viable source under strict playlist/filter rules.
Log every override. This adds discovery variety without another model call.

Keep `songsByGenre` malformed-argument and recovery cases in the next training
and evaluation corpus. Do not resume GPU training until the next training pass
has a clean, deliberate multi-round/stop-continue specification rather than
more mechanical additions to the existing corpus.

#### Cloud reference baseline

Lead developer's cloud setup, `openai-compatible:gpt-5.6-luna`, is the useful
multi-round reference:

- 120/120 calls successful; 9.7s average latency, p50 10.2s, p95 14.6s.
- 82 `djAgentPick` calls averaged 11.3s.
- Agent runs averaged two steps and 2.7 tool calls.
- 926.2k input versus 36.9k output tokens (about 25:1).

The input-heavy ratio is the architectural motivation for split routing:
small/cheap function model handles tool discovery, then the larger editorial
model reads one grounded menu and makes one final decision. It may make a pick
slower in wall-clock time because the stages are serial, but should materially
reduce expensive-model track-pick token use. Validate that claim with a small
cloud A/B sample before presenting a percentage saving as fact.

## Superseding continuation — 2026-09-01: V17 retest handover

This is the starting section for the next fresh chat. It supersedes earlier
deployment advice where it conflicts.

### Live station: leave this in place

- Live router remains **V13**, not V17:
  `Subwave-FunctionGemma-270M-Router-v13-V10-Parity-Q8_0.gguf`, served by
  `functiongemma-v13-router-test` on host port 8098.
- The active controller environment is:

  ```dotenv
  PRODUCER_ROUTER_BASE_URL=http://host.docker.internal:8098/v1
  PRODUCER_ROUTER_MODEL=/models/Subwave-FunctionGemma-270M-Router-v13-V10-Parity-Q8_0.gguf
  PRODUCER_ROUTER_TIMEOUT_MS=30000
  PRODUCER_ROUTER_DISCOVERY_DEPTH=2
  PRODUCER_ROUTER_SEGMENTS=1
  PRODUCER_PERSONA_FINAL_CALL=0
  ```

- Keep depth 2. Do not raise it to 3: V13/V17 do not have a validated
  third-round policy and the current two-call latency is good.
- Only recreate `controller` for a controller change. Do not restart the
  broadcast service merely to change/retest routing.

### V17 candidate: unapproved and deliberately offline

The candidate to retest is:

```text
/home/jaz666/Docker/llama_cpp/models/Subwave-FunctionGemma-270M-Router-v17-Availability-No-Final-Q8_0.gguf
/media/ssd/training/router-v13-v10-parity/Subwave-FunctionGemma-270M-Router-v17-Availability-No-Final-Q8_0.gguf
```

Do not confuse it with the older `Router-v17-SoakCorrections` artifact beside
it. V17 passed its router-only Q8 gate, 85/85 across 17 scenarios × 5 runs,
including fixtures for unavailable audio and journey routes. It was still
rejected in a live test because the live controller could tell the model to use
`tracksTowardJourney` while omitting that tool from the actual offered set.
That was a controller prompt/availability contradiction, not proof that V17
itself was bad.

### Controller fix now live (must be part of the retest)

The controller was rebuilt and deployed at approximately 16:06 UTC on 1 Sept.
`controller/src/llm/internal/producer/router.ts` now builds the actual tool set
first and appends authoritative availability instructions to the router prompt:

- call only a function offered in this request;
- when `tracksTowardJourney` is absent, preserve the journey direction through
  the offered library/mood/genre tools rather than calling it;
- when `tracksThatSoundLikeThis` is absent, do not call it.

`controller/scripts/producer-router.test.ts` includes the regression test
`overrides a live journey call instruction when the waypoint tool is unavailable`;
the focused Producer Router suite passed 13/13 before deployment.

This is the crucial retest difference. The next V17 test must exercise the
model through this corrected controller path, with a real context where the
journey is mentioned but not offered. Do not rely solely on V17's old
standalone fixture score.

### This evening's V13 evidence (post-fix)

After roughly five hours, the station reported 186 LLM calls and 91% overall
success. All downstream `djProducerSelect` (42/42) and `djProducerPick`
(17/17) calls succeeded. The loss is isolated to recoverable router fallbacks:

| Router outcome | Count | Interpretation |
| --- | ---: | --- |
| Route succeeded | 42/59 | Normal two-source shortlist completed. |
| Both sources yielded no candidates | 14 | Expected narrow-pool exhaustion; normal complete-Producer fallback selected safely. |
| Selected unavailable `similarSongs` | 2 | Small remaining availability mismatch. |
| Returned no second tool call | 1 | Isolated model-format failure. |

The failure split is directly supported by
`state/logs/discovery-routes-2026-09-01.jsonl` and timestamped controller logs.
All 17 events were after the controller rebuild, so they are valid current
behaviour, not stale pre-fix data.

The show was strict: Alternative/Indie/Rock/Electronic/Pop/Folk, six decade
bands, five moods, medium energy, plus normal rotation exclusions. Tool spread
in the same window makes the reason clear:

| Tool | Calls | Errors | Empty |
| --- | ---: | ---: | ---: |
| `tracksByEnergy` | 32 | 0 | 28 |
| `searchLibrary` | 25 | 0 | 6 |
| `similarSongs` | 13 | 0 | 8 |
| `tracksByMood` | 6 | 0 | 4 |
| `songsByGenre` | 10 | 8 | 1 |

The most common failure pattern was `tracksByEnergy` → `[similarSongs or
searchLibrary]`, both returning zero. That is a thin eligible set, not a
crash, latency regression, or final-selector failure. The full Producer
fallback protected on-air output in every instance.

### Remaining issues to capture, not train around blindly

1. **`similarSongs` availability:** V13 selected it twice when it was not in
   the actual offer. The generic “offered only” instruction was insufficient
   for those cases. Before changing training, inspect exactly why the tool is
   conditionally withheld and add a controller-side unavailable-tool statement
   comparable to the journey/audio rule if warranted. Add a regression test.
2. **`songsByGenre` argument misuse:** 8/10 calls errored. The model frequently
   supplied a tool-ish/non-genre token such as `deepCuts`, but a second source
   recovered. Preserve these as targeted train/eval examples; do not mistake
   them for library outages.
3. **Empty pools:** This is principally library/show eligibility. Retesting a
   router model on a strict show cannot be read as broad routing quality. Use
   at least one wider show and retain empty-pool telemetry as a separate
   outcome class.

### Efficient V17 retest plan

1. Confirm the live controller remains healthy on V13; take its current
   `discovery-routes` and `inference-performance` files as the baseline.
2. In a disposable/off-air or isolated V17 model-server container, verify the
   corrected controller path using these real contexts:
   - a journey mentioned in prompt but `tracksTowardJourney` withheld;
   - audio similarity mentioned/available state but
     `tracksThatSoundLikeThis` withheld;
   - `similarSongs` withheld;
   - normal wide-show offered tools;
   - a deliberately strict, likely-empty eligible pool.
3. Run the focused Producer Router test suite, then a bounded Q8 controller
   soak. Record: route success, unavailable-tool selection, no-tool-call rate,
   empty-pool rate, tools per route, candidates per route, p50/p95 route
   latency, and fallback completion.
4. Only put V17 behind the live endpoint if it has **zero** unavailable-tool
   selections in the controller-path availability cases and no regression
   against V13 on valid route completion/latency. Keep V13 ready as rollback.
5. Do not treat reduced strict-show route success as a V17 failure unless its
   tool calls produced candidates and the router still failed to continue.

The new rotating telemetry files are intentionally the evidence source for
this next pass:

```text
state/logs/discovery-routes-YYYY-MM-DD.jsonl
state/logs/inference-performance-YYYY-MM-DD.jsonl
```

They record tool names, errors/empty result counts, candidate totals, route
steps, outcome and latency without needing to scrape verbose raw LLM logs.
