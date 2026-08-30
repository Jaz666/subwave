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
