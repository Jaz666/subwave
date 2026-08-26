# FunctionGemma V10 live-test handover

Read this after [`producer-routing-simplification-handoff.md`](producer-routing-simplification-handoff.md). That document remains the architectural source of truth; this records the current FunctionGemma router experiment and the pending live evidence.

## Status

A FunctionGemma V10 router is running on the live test station for an extended observation run. Before the server crash/reboot, the station display showed **100% success for both tool and LLM calls**. This is encouraging but preliminary: collect a longer-period result before treating V10 as the settled test-station router.

The user will bring the longer-run numbers to the next session. Do not restart monitoring-intensive training or tail live logs continuously: inspecting final summaries is substantially cheaper and is the agreed workflow.

## V10 model and station configuration

Deployed model artifact:

```text
/home/jaz666/Docker/llama_cpp/models/Subwave-FunctionGemma-270M-Router-v10-Hierarchy-Autonomous-Q8_0.gguf
```

Current test-station `.env` values (the file is ignored by Git):

```dotenv
PRODUCER_ROUTER_BASE_URL=http://host.docker.internal:8097/v1
PRODUCER_ROUTER_MODEL=/models/Subwave-FunctionGemma-270M-Router-v10-Hierarchy-Autonomous-Q8_0.gguf
PRODUCER_ROUTER_TIMEOUT_MS=15000
PRODUCER_ROUTER_SEGMENTS=1
```

The port is deliberately **8097**, not the originally suggested 8096. The user adjusted it after finding the station's available port.

Keep the V4 hierarchy service/model as the immediate rollback while V10 is being observed:

```text
container: subwave-functiongemma-v4-hierarchy-weekend
endpoint:  http://host.docker.internal:8095/v1
model:     /models/Subwave-FunctionGemma-270M-Router-v4-Hierarchy-Q8_0.gguf
```

Do not delete that fallback until the longer V10 run has been reviewed and the user no longer wants instant rollback.

## Contract: V10 is a bounded router, not a DJ

This boundary is non-negotiable:

```text
FunctionGemma chooses one bounded discovery/recovery capability
  -> controller validates and executes it
  -> deterministic controller policy selects from grounded candidates
  -> configured Creative/Producer model writes spoken delivery
```

Therefore:

- FunctionGemma must not write listener-facing prose.
- FunctionGemma must not make a final track choice or commit a candidate.
- The creative model must not receive or call routing tools.
- The router gets exactly one offered tool at a time; after an empty result, the controller may offer one recovery capability.
- Fixed built-in research segment routes may be enabled (`PRODUCER_ROUTER_SEGMENTS=1`); dynamic/user-provided skills remain outside FunctionGemma's tool surface.

The V7/V8 "completion" experiments incorrectly let the router score/select recovered candidates. They were explicitly reverted. Do **not** revive `done`, candidate completion, or final-choice training as a router fix. Any candidate-selection work is a separate, gated future experiment.

## What V10 was trained to fix

Earlier V6 autonomously routed the new offered tools but regressed the previously solved genre-hierarchy behaviour under Q8 inference (for example, returning `electro` where `electro house` was required). V10 is a compact continuation from the protective V4 hierarchy checkpoint, with autonomous offered-tool examples added without diluting hierarchy coverage.

Training data retained at:

```text
/home/jaz666/codex/subwave-functiongemma/controller/scripts/functiongemma/training/data/router-v10-hierarchy-autonomous
```

Dataset: 600 training / 100 development examples. Protective family counts included hierarchy 66, genre-vs-mood 44, genre-boundary 44, and autonomous-offered 27.

## Validation evidence

| Check | Result |
| --- | --- |
| Native frozen router-only evaluation | 110/125 overall; routing 110/110, recovery 10/10, grounding 15/15 |
| Q8 CPU frozen router-only evaluation | same: 110/125; all router-scope dimensions passed |
| Q8 CPU development soak | 384/384 decisions passed; 0 failed |
| Q8 soak latency | average 836 ms; p50 882 ms; p95 1342 ms; max 1520 ms |

The 15 non-passing frozen-eval points are intentional out-of-scope commit/editorial control cases: they expect final selection arguments such as `reason` and `transition`, plus editorial preferences. They are not failures of the V10 bounded-router contract.

Canonical reports retained locally:

```text
/home/jaz666/codex/subwave-functiongemma/controller/scripts/functiongemma/training/output/router-v10-hierarchy-autonomous/native-report.json
/home/jaz666/codex/subwave-functiongemma/controller/scripts/functiongemma/training/output/router-v10-hierarchy-autonomous/q8-cpu-report.json
/home/jaz666/codex/subwave-functiongemma/controller/scripts/functiongemma/training/output/router-v10-hierarchy-autonomous/q8-cpu-soak.json
```

## Source and experiment history

The station/controller source is on `live/producer-routing`. Its router already validates a single closed-schema tool call, bounds recovery, and falls back safely on routing failures.

The experimental FunctionGemma harness changes are on the temporary training worktree branch `codex/functiongemma-training` (historically `/tmp/subwave-functiongemma-training`), not automatically merged into the main station branch. Key commits for retraining/harness work are:

```text
6e39a3a7  autonomous offered-tool routing coverage
 a0124835 autonomous protocol/intent separation
f34b504c  router recovery capability gating
8348a30b  generic autonomous soak scoring by contract
```

Only revisit that branch if the extended live evidence identifies a real routing regression. V10 needs no additional training merely because the compact training worktree is separate.

## Disk-space cleanup already completed

The Ubuntu boot volume had reached 100%. Obsolete V1–V9 training output folders, duplicated V5–V9 datasets, and V10 intermediate checkpoints/GGUF conversion source were removed with user approval. Space improved from effectively zero to about **58 GB free**.

Kept:

- deployed V10 Q8 model above;
- V4 hierarchy Q8 rollback model;
- V10 `best` checkpoint and its reports/logs/compact dataset;
- small remaining V4 reference data.

Do not expect prior V1–V9 output directories to exist. Additional older root-owned Q8 models can be removed later only if more space is needed; preserve V4 hierarchy and V10 until the test outcome is decided.

Safe container cleanup guidance already given:

```text
safe now: functiongemma-v2
          functiongemma-v4-cpu
keep for now: subwave-functiongemma-v4-hierarchy-weekend
```

## Next-session procedure

1. Ask the user for the extended station-run numbers: tool/LLM success counts, router failures/fallbacks, and any observed latency or playback impact.
2. Compare those observations against the V10 scope and the offline 384/384 Q8 soak; do not infer permanent promotion from the preliminary pre-crash display.
3. If the run is clean, agree with the user whether to keep V10 as the test-station default and when to retire the V4 rollback container/model.
4. If there is a regression, restore the V4 hierarchy endpoint/model and inspect concise final telemetry/log summaries before considering any narrowly targeted retraining.
5. Keep Verified Facts V1 and the producer-routing architecture out of scope unless the user opens a separate task; they were deliberately treated as complete/current-form work.
