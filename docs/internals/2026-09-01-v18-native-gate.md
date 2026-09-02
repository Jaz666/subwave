# V18 native availability gate — 2026-09-01

The first V18 availability-correction fine-tune was trained offline from
`router-v17-availability-no-final/best`. It retained the V17 availability
corpus (2,400/400 rows) and added the narrow V18 correction set (10/5 rows),
using one epoch at a 5e-6 learning rate. Artifacts are isolated at:

```text
/media/ssd/training/router-v18-v17-availability-explicit
```

The native five-fixture gate ran each controller-path case five times. It
passed the mood, energy and playlist offered subsets, but selected the withheld
`tracksTowardJourney` tool for every library-search and semantic-similarity
subset run: 15/25 passed, with 10 unavailable-tool selections.

This candidate is rejected. Do not prepare GGUF, run the Q8 soak, or change
the live V13 endpoint. The result shows that the correction signal is still
too weak for alternatives whose offered set lacks a simple structured mood or
energy route. Any next corpus revision must add varied explicit-conflict
examples for those two subsets while retaining the existing five-way balance;
do not change controller policy or discovery depth to mask this training gap.
