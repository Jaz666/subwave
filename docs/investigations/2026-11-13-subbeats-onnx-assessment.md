# Beat This! ONNX assessment for Sub/Beats and regular stems

13 November 2026. Sub/Beats source: `e797a6461c3c2d07b979db858f69991760c94013`.
Upstream [PR #2244](https://github.com/perminder-klair/subwave/pull/2244) examined at
`dc4bbbc4443eeb6e1f811315d0fae3e6c5f27a8a`.

## Recommendation

Contribute to #2244 as the standalone improvement for regular Stem Blends, then
have Sub/Beats consume its shared tracker. Our current Sub/Beats feature does
not supersede that PR: regular head/tail library analysis still derives bars
from every fourth librosa beat. Reusing Sub/Beats audio in a regular blend
does not replace that blend's library timing grid.

The ONNX export is a credible candidate for Sub/Beats. It reproduced our current
beat/downbeat predictions and primary fitted-passage results exactly in this
sample and reduced warm inference time. It is the same `small0` model, so this
is a runtime change, not an improvement to Sub/Beats detection accuracy.
The owner accepted the measured additional memory as a reasonable tradeoff for
faster processing. Production adoption still needs complete preparation/reuse
and first-use latency checks. No runtime code or station configuration changed
in this assessment. The owner subsequently chose to contribute the regular-stem
foundation to #2244 first, so it can merge independently and provide learned
library grids before the larger Sub/Beats feature. Adapting full Sub/Beats
preparation to that shared engine remains the next stage.

Keep #2244 open while this route is pursued. Absorbing its work into the eventual
Sub/Beats contribution is a viable fallback, but proposing closure as superseded
would be accurate only after regular-stem grids and the PR's deployment,
fallback, evaluation and compatibility work are actually covered there.

## Contribution status

The agreed first stage is now proposed in upstream
[PR #2341](https://github.com/perminder-klair/subwave/pull/2341), targeting
#2244's feature branch. It implements the shared ONNX engine, independent tail
grid inference and persisted model/source/window provenance discussed below,
with local Librosa/interval evidence used only as diagnostics. Its real-model,
legacy-output, persistence and regression checks are recorded in that contribution.
The assessment and route comparison below retain their original findings;
full Sub/Beats ONNX adaptation and complete preparation/cache validation remain
the next stage. This contribution does not replace or close #2244.

## Local experiment

One offline container at a time, limited to two CPU cores and 3 GiB RAM, with
two threads for numerical libraries, no GPU and no network. Host CPU: AMD
Ryzen 5 2600, x86-64. The existing heavy analyzer image supplied PyTorch
2.7.1+cu128, beat-this 1.1.0, NumPy 2.4.6, librosa 0.11.0 and onnxruntime 1.27.0.
Its immutable image ID and all pins are in the
[machine-readable results](2026-11-13-subbeats-onnx-assessment.json).

Each backend ran in a fresh process. Both used the current production
`subbeats_prepare.decode` at 22,050 Hz from sample zero, with source hashes
verified before inference. PyTorch used the unchanged production
`subbeats_cues.predict`; ONNX used #2244's unchanged `DownbeatTracker`, with a
reused session. Each had one 40-second warm-up, followed by one inference per
input. We also ran the production `fitted_passages` function for complete inputs.

The ONNX asset's SHA-256 is
`5cff50fb031bc4a43b036f0af4835cf60bf8d43e6ccc8a7e676ed89db53f6eaf`,
verified after downloading it from the pinned upstream prerelease. Its source
checkpoint hash is the same one our current `small0` preparation pins.
Original recordings and source files were read-only; all generated files went
to a separate assessment directory. No live queue, settings or prepared cache
was opened or altered.

### Prediction parity

All **10 cases** produced exactly equal beat arrays and downbeat arrays:
seven complete recordings, plus 12-, 20- and 40-second crops of the first.
The complete recordings total 1,755.68 seconds, with 3,741 beats and 974 downbeats.
All seven complete inputs also produced exactly equal primary fitted-passage
results. Both outputs passed finite, ordered, in-bounds and bars-within-beats
checks.

This does not establish identical final prepared bundles: downstream recovery,
source fingerprints, coverage preparation, publication, lyric lookup and the
live transition path were not rerun. It is also not a new listening verdict or
a general genre evaluation. #2244's own broader parity and GTZAN evidence is
documented in its [pinned README](https://github.com/perminder-klair/subwave/blob/dc4bbbc4443eeb6e1f811315d0fae3e6c5f27a8a/tools/beat-this/README.md).

### Warm inference time

Times include the engine's preprocessing, model inference and postprocessing.
Decode and fitted-passage analysis are excluded. PyTorch includes the model
construction that our production predictor currently performs on each call.

| Input | Audio seconds | Current PyTorch | ONNX |
| --- | ---: | ---: | ---: |
| Rozalla — Everybody's Free | 213.60 | 11.198 s | 9.455 s |
| Gusto — Disco's Revenge | 231.69 | 11.686 s | 9.490 s |
| 808 State — Cubik | 213.53 | 11.741 s | 9.634 s |
| Leftfield — Afro-Left | 454.50 | 23.668 s | 19.095 s |
| Urban Cookie Collective — The Key, The Secret | 222.53 | 12.578 s | 9.965 s |
| DJ Jean — The Launch | 193.27 | 10.131 s | 9.002 s |
| Agnelli & Nelson — El Nino | 226.55 | 12.726 s | 9.908 s |
| **Seven complete recordings** | **1,755.68** | **93.728 s** | **76.548 s** |
| First recording, 12-second crop | 12.00 | 0.464 s | 0.352 s |
| First recording, 20-second crop | 20.00 | 0.832 s | 0.832 s |
| First recording, 40-second crop | 40.00 | 3.499 s | 2.487 s |

The complete-recording total is **18.3% less inference time**, saving about
1.1–4.6 seconds per recording in this sample. It is not an 18.3% reduction in
complete Sub/Beats scan time. Runs were sequential on shared hardware, with one
observation per input/backend; these are observations, not throughput guarantees.

### First use and memory

Fresh-process first 40-second calls took 11.46 s for PyTorch and 22.27 s for
ONNX; the ONNX session additionally took 1.21 s to load. These include cold
imports/preprocessing/JIT work. They are not station click-to-ready measurements.
Warm scan gains do not prove faster first-track readiness. A production test
must account for what the worker already warmed before a Sub/Beats job begins.

The first comparison's peak RSS, including passage analysis over all seven
recordings, was 1,279.1 MiB for PyTorch and 941.0 MiB for ONNX. That compares
fresh processes whose imported model stacks differ. Full Sub/Beats preparation
still requires PyTorch for Demucs, so those figures alone would exaggerate the
memory benefit of switching its beat tracker.

A second probe imported PyTorch, torchaudio and Demucs in **both** processes,
then warmed the tracker, repeated the 40-second call three times and inferred
the 213.6-second first recording. It did not load Demucs weights or separate audio.

| With PyTorch stack imported | Current predictor | ONNX |
| --- | ---: | ---: |
| Baseline RSS | 519.7 MiB | 523.1 MiB |
| Peak RSS | 1,033.2 MiB | 1,109.8 MiB |
| Ending RSS | 974.8 MiB | 1,056.9 MiB |
| Median warm 40-second inference | 2.846 s | 2.417 s |
| Full 213.6-second inference | 11.067 s | 9.484 s |

ONNX stayed faster but used **76.6 MiB more peak RSS** in this probe. This is
not a measured peak for the complete Demucs/CLAP/ONNX preparation stack. Test
that stack and its idle release before claiming production memory savings.

### Disk footprint

The ONNX asset is 9,588,293 bytes; the current checkpoint is 8,451,101 bytes.
Replacing one with the other adds about 1.08 MiB to model storage, before
dependency changes. A common ONNX path could retire our runtime beat-this
package/checkpoint, but PyTorch remains required by Demucs. CLAP-enabled heavy
images already install onnxruntime; Demucs-only builds need the dependency
handling proposed in #2244.

The inference backend creates no extra per-track stem audio. It does not reduce
FLAC cache size, and deploying it should not invalidate or re-separate existing
prepared audio. A deliberate regular-grid refresh can update analysis without
asking for new Demucs stems; it should have an explicit bounded scope on a
large library. #2244's global opt-in otherwise adds inference to all requested
head/tail analyses, including tracks that may never use a stem transition.

## Concrete contribution opportunity in #2244

### Preserve the hybrid findings

Our Sub/Beats implementation already combines learned beats/downbeats with
independent tempo/onset measurements, audio-energy evidence and consistent
passage fits. `supported_grid_matches` compares stable learned windows against
librosa-derived supported regions; `independent_phase_fit` checks timing against
the separate beat sequence. The opening fallback also considers onset support,
and the closing recovery can test independent closing-beat phase. The primary
`fitted_passages` route uses audio-band energy around predicted beats rather
than treating every model label as a usable cue.

The accepted [Children investigation](subbeats-research-20261103/children-grid-evaluation.md)
showed why these roles matter: a stable beat sequence can coexist with changing
downbeat labels, and a beatless opening must retain its complete original audio.
Timing, bar phase and musical passage confidence are separate questions. The
accepted [Launch references](subbeats-research-20261103/launch-grid-evaluation.md)
also distinguish measured rhythm from projected phrase endpoints and the audible
decay beyond them.

Agreement is not a universal veto. The
[algorithm-13 natural-finish work](subbeats-research-20261103/outgoing-terminal-grid-v13-evaluation.md)
records useful endings rejected by fixed phrase lengths or a second independent
tracker. Its fallback fits supported learned closing grids without requiring
that second tracker to approve every candidate. Do not introduce a new regular
stem qualification filter that demands both engines agree.

#2244 already combines librosa BPM/key with Beat This! beat/bar timestamps, but
it does not port these full Sub/Beats passage checks. Our contribution should
preserve that separation of responsibilities and assess which local consistency
or onset checks help **short regular head/tail windows**. Full-recording phrase
selection and natural-start/finish handling remain Sub/Beats work; their success
on a complete track does not prove they work with only a 20/40-second window.
The ONNX predictor change should retain the existing Sub/Beats librosa/DSP stages.
Today's ONNX test compared primary fitted passages, not every hybrid recovery
route, so the complete preparation gate remains necessary.

### Tail grid after a legacy tempo failure

The pinned PR's `facet_tail` calls librosa tempo tracking and `bar_grid` inside
one `try` block. If librosa raises, an available Beat This! tracker is never
called, so the tail gets no learned grid. Its head path already separates the
two operations. A stub through the real `facet_tail` confirmed zero tracker
calls and absent bars after a tempo exception; calling its grid helper directly
returned valid absolute bars at 180,100 and 182,100 ms.

The small fix is to make tail tempo estimation and grid selection independent,
matching the head path. Keep BPM unset on a tempo failure, allow the available
learned tracker to supply the grid, and preserve today's empty grid when the
tracker is off or unavailable and librosa supplied none. Add a regression through
the real tail entry point for both settings. This is a proposed contribution;
the assessment did not patch the upstream branch.

The PR's existing downbeat suite passed **12/12**, including the real ONNX model
case, in the isolated heavy image. The exception-path probe is supplementary;
the existing suite does not exercise that tail entry point failure.

## Integration route and acceptance gates

1. Keep #2244 focused on regular grids. Contribute the tail-path correction and
   a small shared inference module usable by both the worker's window grids and
   Sub/Beats' full-recording predictor. Preserve the existing parity, fallback,
   model pinning, heavy-image packaging and operator documentation.
2. Integrate that upstream change into the Sub/Beats branch and replace the
   predictor behind its existing `small0` choice. Keep regular analysis optional
   and permissive on engine failure. An explicit Sub/Beats `small0` request
   must obtain that model's result or report a preparation error; silently
   substituting librosa would mislabel its evidence. The regular analysis flag
   being off must not disable an explicit Sub/Beats preparation.
3. Record the inference backend/export hash and preprocessing version for new
   cue results. Continue reading existing source-bound cue manifests and stems;
   do not queue the library, invalidate prepared tracks or spend the stem budget
   just because the runtime changes. Keep pick-time work at regular-stem size.
4. Before switching production defaults, compare complete cold and warm
   `prepare_request` calls, cache hits, coverage upgrades and preview/live plans
   on isolated state. Include difficult intro/outro examples, close-to-20-minute
   recordings, idle unload/reload, missing/corrupt model handling, and both
   analyzer and AIO packaging. ARM64/CUDA deployment compatibility was not tested
   in this CPU-only assessment. No new stem qualification filter is needed.

If the maintainer prefers one combined contribution, port the complete regular
grid feature into the Sub/Beats branch with attribution and the same checks,
then point #2244 at the replacement and recommend closing it as superseded.
The current implementation has not yet reached that point. A long feature PR
would otherwise delay a useful standalone regular-stem fix and duplicate its
inference engine.

### Upstream route comparison

| Consideration | Contribute to #2244 | Include the regular-grid feature in the eventual Sub/Beats PR |
| --- | --- | --- |
| Delivering regular-stem improvements | Can merge independently of Sub/Beats readiness. | Waits for the larger feature to be ready and reviewed. |
| Review scope | Existing evaluation, model export and fallback work stays in its focused PR. | One contribution owns regular analysis, Sub/Beats preparation, live mixing and UI changes together. |
| Shared runtime | Needs a reusable tracker interface and a Sub/Beats adapter. | Needs the same interface and adapter; combining PRs does not remove that integration work. |
| Coordination | Agree the shared interface and help update/test the existing PR. | Obtain agreement to supersede #2244 and preserve its work, attribution and evidence. |
| Compatibility checks | Test the regular path separately and the Sub/Beats consumer afterward. | Test both paths together, including optional-feature-off behavior and cache reuse. |
| Long-term maintenance | Both paths can use one engine. | Both paths can use one engine; avoiding duplicate implementations is still required. |

A practical variant of the first route is to use the candidate in our development
branch for station testing while contributing the regular-grid foundation
separately upstream. We do not have to wait for that merge to evaluate our
Sub/Beats adapter. Once the foundation is upstream, the later Sub/Beats PR is
based on it and its already-merged changes drop out of that PR's diff.

The combined route is reasonable if the maintainer explicitly prefers a single
contribution or the shared interface requires changes that cannot usefully stand
alone. Otherwise, the first route offers a smaller review and an earlier regular
stem improvement. Neither route calls for extra per-track FLAC caching, broader
Sub/Beats admission, or automatic reprocessing of the whole library.

### What an earlier regular-stem release can prime

The owner identified an additional benefit of the separate contribution: users
could already have the shared inference engine deployed and learned head/tail
grids cached before Sub/Beats arrives. That supports landing the regular-grid
foundation sooner. Preserve the grid's model/version, recording identity and
window coordinates where practical so a later consumer can judge what was
measured instead of guessing from bare timestamps.

This primes the foundation, not full Sub/Beats readiness. Current Sub/Beats
predicts the complete recording and chooses longer passages. Its coverage
builder reuses matching parent Sub/Beats regions; it does not automatically
consume arbitrary regular head/tail FLAC files. The existing reverse direction
lets regular blends read verified Sub/Beats coverage, but is not evidence of
general bidirectional reuse. Independent short-window model predictions also
cannot simply be concatenated and called an equivalent full-recording grid.
Any future reuse must validate source identity, timing context, separation
settings and complete required coverage. No extra separation should be done
merely to label an ordinary track as ready for the future feature.

## Reproduction and retained evidence

The executed probes are retained under [subbeats-onnx-20261113](subbeats-onnx-20261113/).
They require an isolated heavy runtime, a writable `/assessment` directory,
read-only current scripts at `/current`, and read-only source files at paths
listed in `/assessment/container-inputs.json`. Each input is
`{"id":"example","path":"/inputs/example.audio","sha256":"<source hash>"}`.
The first source also supplies the 12/20/40-second crops and the residency probe.

Fetch the pinned PR's unchanged worker and downbeat test into
`/assessment/upstream/`; download and SHA-256-check its release asset at
`/assessment/beat_this-small0.onnx`. Invoke each command in a fresh container,
sequentially, with two CPU cores, 3 GiB RAM, no network and temporary writable
cache/state directories. Set `OMP_NUM_THREADS`, `OPENBLAS_NUM_THREADS`,
`MKL_NUM_THREADS` and `NUMBA_NUM_THREADS` to `2`, and `NUMBA_CACHE_DIR` to an
isolated writable directory. Set `BEAT_THIS_MODEL` to the verified ONNX path
when running the upstream model test. Use the image's analyzer Python.

```text
benchmark.py torch
benchmark.py onnx
upstream/analyzer_downbeat_test.py
tail_route_probe.py
resident_memory.py torch
resident_memory.py onnx
```

Full local grids/logs and private input mount paths remain outside Git at
`/tmp/subbeats-onnx-assessment-20261113`. The committed JSON retains source
hashes, per-case equality/count/timing results, startup and memory observations,
environment pins and the probe outcome. No audio or model weights are committed.

## Suggested upstream response — draft, not posted

Thanks for holding this. Our Sub/Beats currently uses Beat This! for full-track
passage preparation; regular Stem Blends still use the existing librosa grids,
so #2244 remains useful independently. We tested your ONNX tracker against our
current predictor: all ten beat/downbeat cases matched, and warm inference over
seven complete tracks took about 18% less time. I suggest keeping this PR open
and sharing its tracker with Sub/Beats. We can contribute that reuse and a small
tail-path fix so a librosa tempo failure does not bypass an available Beat This!
grid. Sub/Beats can then build on this rather than delaying the regular-grid
improvement.
