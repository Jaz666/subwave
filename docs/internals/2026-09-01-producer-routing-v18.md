# Producer Routing V18 preparation — 2026-09-01

## Scope

V13 remains the live discovery router. V17 is rejected and remains offline:
when the operational prompt explicitly requested `tracksTowardJourney` while
the controller withheld that function, V17 selected the unavailable tool in
five of five controller-path checks. V13 passed the same control checks.

This work prepares a narrow V18 correction only. It does not change live
routing, discovery depth, controller availability policy, or final editorial
selection.

## Permanent regression and corpus

- `controller/scripts/functiongemma/v18-availability.ts` keeps five explicit
  journey-withheld controller-path fixtures. Each includes the conflict wording,
  the controller authority instruction, and an offered tool subset that omits
  `tracksTowardJourney`.
- `controller/scripts/functiongemma-v18-availability.test.ts` pins those
  fixtures and checks that the correction examples select an offered function.
- `controller/scripts/functiongemma/v18-data-cli.ts` writes the deliberately
  small correction corpus: ten training examples and five development examples.
  It includes mood, energy, library search, playlist and semantic-similarity
  alternatives, plus strict-empty recovery calls with valid arguments.
- `controller/scripts/functiongemma/v18-controller-path-eval-cli.ts` runs the
  five fixtures for a requested number of iterations and rejects unavailable
  tool selections. V13 passed 25/25 at five iterations with none.

Run after producing a V18 Q8 candidate:

```bash
cd /home/jaz666/Docker/subwave/controller
npx tsx scripts/functiongemma/v18-controller-path-eval-cli.ts \
  --base-url http://127.0.0.1:PORT/v1 --model /models/CANDIDATE.gguf --iterations 5
```

Do not promote a candidate unless this reports 25/25 with zero unavailable
tool selections, the existing router and FunctionGemma suites pass, strict
empty pools fall back safely, and the bounded Q8 soak passes.

## Type-check repair

`controller/src/broadcast/queue.ts` imported `recordTrackTransition` twice.
The duplicate import prevented `tsc --noEmit` from completing with TS2300 even
though the runtime uses the same `recordTrackTransition` binding and
`STATS_WINDOW` from the remaining consolidated import. Removing only the
redundant import is behaviour-neutral and restores the full controller
type-check gate for this project.
