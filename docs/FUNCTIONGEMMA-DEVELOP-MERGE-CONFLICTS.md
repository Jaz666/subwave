# FunctionGemma / upstream develop merge conflicts

This branch was merged with the 12 commits currently on
`perminder-klair/subwave:develop` on 2026-08-23. The merge kept the
FunctionGemma branch version for the overlapping files below. These files
need a semantic follow-up review so useful upstream changes are not lost.

## Files requiring review

- `controller/CLAUDE.md` — documentation/invariants.
- `controller/scripts/show-candidates.test.ts` — overlapping candidate tests.
- `controller/src/broadcast/dj-agent.ts` — DJ agent and broadcast behavior.
- `controller/src/context.ts` — request/context construction.
- `controller/src/music/library-db/queries.ts` — library query behavior.
- `controller/src/music/show-candidates.ts` — candidate selection and diagnostics.
- `controller/src/skills/_agent.ts` — skill-agent execution and timeout behavior.
- `web/components/admin/shows/ShowEditor.tsx` — show candidate UI.

## Upstream commits to check while resolving

The merge brought in these upstream `develop` commits; inspect their diffs
against the FunctionGemma versions of the files above:

- `7d4c0b95` — carry every genre tag
- `2e04fff7` — accelerate CUDA sounds-like backfills
- `b4d931bd` — align daypart context
- `11f6abcb` — apply station house rules to banter and guest exchanges
- `deea2a43` — listener buffer control
- `4bc817e1` — generator metadata logging
- `9e78d52a` — matching-track availability diagnostics
- `ad07bc55` — five-minute agent deadlines
- `e7838ddb` — skip unavailable pool segments
- `eb73cb3b` — newer GPT-5 reasoning floors
- `dcff53b1` — artist spacing and name variants
- `e4f9e7a9` — actual track feel for script generators

The original local `docs/ROADMAP.md` edit was preserved separately and should
remain intact after the merge.
