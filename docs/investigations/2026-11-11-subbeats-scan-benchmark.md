# Sub/Beats scan timing and selection budget — 11 November 2026

## Result

Explicit user selection should authorize extra Sub/Beats processing and storage.
Genre/tempo qualification alone should never enqueue an entire eligible library.
On the measured recording, fresh Sub/Beats preparation costs substantially more
than ordinary stem caching, primarily in CPU cue analysis, while a verified
prepared-result hit is inexpensive.

Track: Agnelli & Nelson, **El Nino**, MP3, 226.586 seconds, 9,153,392 bytes.
Hardware: NVIDIA RTX 3060 (12 GiB), isolated container limited to two CPU cores.
Demucs ran on CUDA; Beat This! ran on CPU as the production implementation does.
The source and model weights were read-only; all new artifacts went to a separate
benchmark directory. No station configuration, queue or prepared audio was changed.

| Work | Measured elapsed | Added cache bytes |
| --- | ---: | ---: |
| small0, first fresh preparation, run 1 | 46.991 s | 52,451,973 |
| small0, first fresh preparation, repeat process | 51.953 s | 52,451,973 |
| small0, fresh coverage with runtimes already warm | 28.031 s | 52,451,973 |
| final0, fresh preparation, three observations | 29.712–43.728 s | 52,461,621 |
| Prepared-result hit, either model | 0.052–0.056 s | 0 |
| Ordinary head/tail stems, warm runtime, two observations | 13.550–13.911 s | 18,421,077 |

The repeated process took 3.505 s to import its dependencies and copy the source
before the first preparation; first-track worker startup plus small0 preparation
was therefore about **55.46 s**. Ordinary edge measurement took a further
1.47–1.53 s before its stem-only baseline. This baseline excludes source opening.

The preparation measurements cover the complete `prepare_request` call: source
fingerprinting, decoding, cue inference, coverage separation, vocal measurements,
validation and artifact publication. They exclude station queue/quiet-time waits,
Navidrome fetching, legacy-cache migration and the controller's lyric lookup.
The ordinary baseline also excludes dependency/model initialization. These are
isolated DSP timings, not a measured click-to-ready latency on the station.

The managed preparation runner now logs `[subbeats-timing]` per track, recording
download, preparation, lyric lookup and total processing milliseconds. These make
actual operational start-to-finish latency measurable when this code is run.

## Where time goes

Repeated warm small0 preparation:

- Source preparation: 0.618 s.
- Cue detection: 15.805 s, including 12.264 s in Beat This! inference.
- Coverage preparation: 11.607 s, including 3.122 s in GPU separation and 0.734 s
  in the Silero stage.
- Full preparation: 28.031 s.

Repeated warm final0 preparation:

- Source preparation: 0.725 s.
- Cue detection: 23.113 s, including 21.846 s in Beat This! inference.
- Coverage preparation: 6.833 s, including 3.008 s in GPU separation and 0.773 s
  in the Silero stage.
- Full preparation: 30.672 s.

Phase measurements are nested, **not additive**. Decode timing overlaps the
source/cue/coverage totals. Coverage also includes FLAC encoding, integrity reads
and publication. The first Silero-stage call cost 17–18 s, including its resampling
and runtime initialization, versus less than a second for both regions once warm.
Host contention and initialization affect comparisons; these observations are not
an estimate of average library throughput or evidence that final0 is faster.

## What this means for 12,000 candidates

Each measured preparation used about **50.02 MiB**. Blindly extending this one
track to 12,000 would require **586.20 GiB** of new Sub/Beats artifacts, before
accounting for shared ordinary coverage or different recording lengths and formats.
At the warm example rates, processing alone would take roughly 93–102 hours in
sequence. Neither figure is a library-average forecast.

A read-only station check found an **800 GiB** configured budget. Its stored usage
snapshot, measured at 14:48:51 UTC, held **479.38 GiB**, leaving **320.62 GiB** by
that snapshot. At this recording's size that would accommodate approximately
**6,563 additional tracks**, not all 12,000. Existing regular stems, compression,
coverage lengths, stale bundles, reclaimable files and exact sharing change this
number. No new full cache walk was triggered to produce these figures.

The implemented admission workflow therefore separates metadata from audio:

- Up to 1,000 explicit admissions per request; up to 20,000 saved list entries.
- Explore admissions prepare immediately when pick-time caching is enabled,
  subject to pause, quiet time and the existing maintenance lock.
- Otherwise, a successful Library Demucs/stems scan releases selected pending
  work in its scope. Regular runs include selected pending work even when their
  ordinary audio measurements are already current; explicit facet plans keep
  their own track scope. Scheduled runs using the same managed library path use
  the same completion handoff.
- Preparation runs in a subsequent managed phase. This change coordinates
  scheduling; it does not fuse CPU cue analysis into an ordinary GPU separation.
- A budget refusal leaves the selection queued with a waiting-for-space message,
  without immediately restarting the same separation. Another scan or an explicit
  queue/resume action can retry after space is available.
- The list capacity is permission to remember selections, not an audio reservation
  or permission to evict useful cached tracks to process every candidate.

## Reproduction

Use `controller/scripts/subbeats_scan_benchmark.py --source <complete-file>
--output <empty-directory>` inside an environment with the heavy analyzer's pinned
dependencies and Beat This!/Silero/Demucs weights. It performs two fresh
preparations and one verified hit for small0, followed by ordinary stems.
CUDA selection follows the worker's normal device policy. Use read-only source
and model mounts and a separate writable output directory.

Raw phase results and the source/budget assumptions are in
[2026-11-11-subbeats-scan-benchmark.json](2026-11-11-subbeats-scan-benchmark.json).

The final0 measurements above are historical. That model has been retired from preparation and the benchmark script now runs small0 only.
