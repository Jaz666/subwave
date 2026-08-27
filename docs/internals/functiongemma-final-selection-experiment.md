# FunctionGemma final-selection experiment

## Scope

This is an offline candidate-commitment experiment. It does not alter the live
FunctionGemma router, the live final selector, or the station queue.

The input is a controller-surfaced candidate set. The only output is one
`done` call containing an exact candidate ID, a private reason and an allowed
transition. FunctionGemma receives no discovery tools or listener-facing work.

## Initial baseline — 2026-08-27

Eight held-out commitment fixtures were run once against the live-test V10
router and Qwen 4B baseline. Reports are retained outside Git under
`/home/jaz666/codex/subwave-functiongemma/controller/scripts/functiongemma/training/output/final-selection-v1/`.

| Model | Valid commits | Mean latency |
| --- | ---: | ---: |
| FunctionGemma V10 | 0/8 | 0.40 s |
| Qwen 4B | 8/8 | 4.34 s |

V10 returned a grounded candidate ID in five cases but did not emit the full
commit contract and failed several editorial traps. It remains a router only.

## Next data pass

Create a separate deterministic selector dataset; do not add it to the V10
router corpus. It must cover exact ID copying, same-artist avoidance, recent
rotation, strict playlist eligibility, show filters, host-over-guest influence,
continuity and deliberate contrast. Keep training and development IDs, artists,
titles and prompts distinct from the held-out fixtures.
