# Official Beat This! comparison — 3 November 2026

Both official checkpoints were run once on each of the five exact full-mix
references. **Neither is a drop-in replacement for the listening-confirmed
opening grids.** `final0` is the stronger candidate for Urban Cookie Collective;
`small0` preserves Gusto's opening bars better. Both fail to recover Afro-Left's
complete sparse intro and start early against Rozalla's confirmed clicks.
Phrase detection and production integration remain unimplemented.

## Reproduction and source identity

- [Official implementation](https://github.com/CPJKU/beat_this), cloned at
  `b95c8ab0c58c2d9fcfd40508ae8dffbc05ac4f5c`; package 1.1.0. Official
  `small0` and `final0` checkpoints, default minimal postprocessing, no DBN.
- Separate environment and outputs:
  `/home/jaz666/codex/subbeats-beat-this-20261103/`. CPU float32, two Torch
  threads, one interop thread; no GPU use. Torch `2.15.0+cpu`, Torchaudio
  `2.11.1+cpu`, NumPy `2.5.4`, soxr `1.1.0`, einops `0.8.2`,
  rotary-embedding-torch `0.9.1`. Imports and all ten inference calls succeeded
  with these installed versions. This is a recorded environment, not a station
  dependency recommendation.
- Rozalla, Urban and Gusto use original files under
  `/media/satadrive/Compilations`, resolved against the reference library IDs,
  titles/albums and matching saved file sizes (8,634,574 / 8,992,299 / 9,369,940
  bytes). Afro-Left and Cübik reuse the saved `.audio` sources from the previous
  investigation. Cübik is the `808:88:98` recording, ID
  `0sejsWk6gftg89Oci3gbG3`, not the other album entry.
- [Complete evidence](beat-this-comparison.json) records source/checkpoint
  SHA-256 hashes, decoded durations, versions, all beat/downbeat timestamps,
  intro comparisons, whole-track interval checks and consecutive 30-second
  window diagnostics. Raw 50 Hz logits and timestamps remain in local `.npz`
  files; models, environment and audio are outside Git.
- FFmpeg decodes complete sources to mono 22,050 Hz float32 for inference,
  without trimming, time stretching, looping or stem separation. Decoded lengths:
  213.60s, 222.53s, 231.69s, 454.50s, 213.53s respectively. Afro-Left's MP3
  header/probe reports 463.53s, whereas full decoding yields 454.50s; diagnostics
  use the decoded sample timeline, consistent with the earlier 454-second
  reference. No timestamps were scaled to the header duration.
- Full-file inference still uses the official overlapping 1,500-frame chunks;
  it does not give the model whole-track context. No exclusion from the models'
  training data has been established, so this is a reference-case diagnostic,
  not an independent dataset benchmark.

```bash
cd /home/jaz666/codex/subwave-sub-beats
TORCH_HOME=/home/jaz666/codex/subbeats-beat-this-20261103/torch \
  OMP_NUM_THREADS=2 MKL_NUM_THREADS=2 \
  /home/jaz666/codex/subbeats-beat-this-20261103/venv/bin/python \
  docs/investigations/subbeats-research-20261103/compare_beat_this.py \
  /home/jaz666/codex/subbeats-beat-this-20261103
/home/jaz666/codex/subbeats-beat-this-20261103/venv/bin/python \
  docs/investigations/subbeats-research-20261103/render_beat_this.py \
  /home/jaz666/codex/subbeats-beat-this-20261103
```

The comparison script reuses existing per-case JSON on resumption. Use a fresh
output directory (with the pinned upstream checkout) if changing sources,
models or settings; saved results are not an automatically invalidated cache.
Inference took about 12–24 seconds per recording for `small0`, 18–38 seconds
for `final0`, excluding downloads and decoding. These are single-run timings
on a shared host, not performance benchmarks.

## Opening alignment against owner references

Count below means expected reference beats with a model beat within 50ms.
This exploratory tolerance is not calibrated mix-safety confidence. Reference
tempo/phase comes from the earlier listening-confirmed opening auditions;
there is no whole-recording ground truth. The comparison uses source time
0–32s for the first three and 0–75s for Afro-Left.

| Recording | `small0` matched / expected | `final0` matched / expected | Bar evidence and limitation |
| --- | ---: | ---: | --- |
| Rozalla | 54 / 69 | 54 / 69 | Both begin about 154ms early and converge later. Neither preserves the accepted quiet opening. |
| Urban Cookie Collective | 68 / 69 | 69 / 69 | Both preserve opening bar positions, with roughly 12–42ms early downbeats. `final0` is the cleanest complete-track output here. |
| Gusto | 64 / 67 | 59 / 67 | `small0` keeps the opening bar phase, initially about 60ms early. `final0` emits a downbeat at 31.52s, about 941ms from the reference bar phase: a half-bar discrepancy. |
| Afro-Left | 92 / 163 | 90 / 163 | Only 133 / 113 total beats predicted in that interval. Sparse intro bars change or disappear. Both place a beat and downbeat at 59.32s, near the accepted 59.3s entry. |
| Cübik | Unknown | Unknown | No calibrated beat/bar anchor; owner-reported 124.3 BPM alone cannot define reference beat positions. |

Beat timing alone would hide Gusto's `final0` bar failure. Its downbeats go from
28.66s to 31.52s across six predicted beats. `small0` instead keeps four-beat
bar spacing throughout this opening. Neither result verifies phrase starts or
vocal completion, including the faint background vocal around 7s.

## Continuity beyond the opening

These are output-consistency checks, not evidence that every detected beat or
bar is musically correct. A gap is flagged when it differs by more than 20%
from the full output's median inter-beat interval. Non-four intervals count
consecutive model downbeats separated by a number of detected beats other than
four; missing beats/downbeats can cause them as well as wrong bar positions.
Whole-track checks include gaps crossing the 30-second diagnostic boundaries.

| Recording | Irregular beat gaps, small / final | Non-four downbeat intervals, small / final |
| --- | ---: | ---: |
| Rozalla | 35 / 0 | 9 / 1 |
| Urban Cookie Collective | 0 / 0 | 2 / 0 |
| Gusto | 0 / 0 | 8 / 30 |
| Afro-Left | 41 / 29 | 22 / 17 |
| Cübik | 47 / 19 | 18 / 8 |

- Rozalla: `small0` inserts extra beat events around 120–180s; `final0` avoids
  those interval anomalies. Its early-phase problem remains.
- Urban: `final0` has 478 beats, 120 downbeats and four detected beats between
  every consecutive downbeat throughout the decoded recording. Thirty-second
  fits are approximately 129.83–129.92 BPM. This is promising continuous grid
  evidence, not a phrase or transition verdict.
- Gusto: continuous beat timing does not prevent bar errors. Even `small0`
  has a two-beat downbeat interval beginning at 38.18s, beyond the accepted
  opening audition. Do not promote the whole recording from its opening result.
- Afro-Left: both recover approximately 130 BPM after the main entry. Both
  also have interval anomalies in the 270–300s window, and sparse-intro/end
  coverage is incomplete. The owner's steady-tempo report remains intact;
  model errors do not establish tempo changes. Neither replaces the accepted
  59.3s anchored backwards projection.
- Cübik: both favor a pulse near the owner's reported 124.3 BPM in much of
  the recording. Gap-free 60–90s fits are 124.089 / 124.099 BPM; 90–120s fits
  are 124.585 / 124.573 BPM. Other windows contain missed/extra events and
  the ending changes behavior. These are competing model estimates, not a
  demonstration of intrinsic tempo drift. Keep the owner's regular-transition
  preference; no library verdict changed.

## Auditions, validation and next gate

Ten MP3 auditions are in the research directory's `audio/`, named
`<recording>-<model>.mp3`. Each overlays the **raw** predicted beats, with a
louder/high click for the model downbeat. No missing beats were filled and no
phase was corrected. Music gain is .35, beat click .72, downbeat click .92,
followed by common peak limiting to .95. The first three excerpts are 32s,
Afro-Left 75s, Cübik 128s. These are generated diagnostics; owner feedback is
recorded below. No auditory judgement by the assistant is claimed.

Owner follow-up on 3 November: the two presented 32-second auditions,
`urban-cookie-collective-final0.mp3` and `gusto-small0.mp3`, "sound fine".
Their tested opening beat/bar alignment is accepted; this does not approve
later regions, phrase boundaries, vocal cuts or track pairs. Next: attempt
arrangement and repetition-based phrase candidates **within those accepted opening windows**,
using the owner's 22.412s change and 22.964s release as references. Counted bars
alone cannot establish phrases; preserve vocal pickups/tails. Rozalla/Afro-Left
still need a separately justified projection mechanism rather than raw model
output. Do not expand to an automatic picker or renderer.

Validation performed: all ten inference calls completed; source-size checks
passed for the three library files; predicted timestamps were strictly ordered,
in decoded bounds, with every downbeat on a detected beat; ten audition files
were generated and their decoded durations checked; JSON/whitespace checks
passed. No production tests were needed for these isolated research scripts
and documentation. No station builds/restarts, preparation jobs, metadata
updates, library reanalysis, new stems or cache cleanup were performed.

## Upstream coordination: normal Stem Blend pipeline

The owner identified [upstream issue #2248](https://github.com/perminder-klair/subwave/issues/2248)
as the coordination point for sharing findings with Perminder. On inspection
on 3 November, the issue was open with no comments, and
[#2244](https://github.com/perminder-klair/subwave/pull/2244) remained an open
draft, head `dc4bbbc4443eeb6e1f811315d0fae3e6c5f27a8a`, unchanged from the
earlier review. It proposes opt-in heavy-image ONNX `small0` beat/downbeat grids
for normal head/tail analysis and Stem Blend cue bars, retaining Librosa BPM.
The issue explicitly requests real-library checks, including long intros.
Its GTZAN accuracy, ONNX parity and cost figures are upstream reports, not
measurements reproduced by this investigation.

Our useful contribution is exact-recording evidence: quiet/sparse intro
failures, good bar continuity on some recordings, the difference between beat
continuity and bar-position continuity, and model-size tradeoffs. Keep these
distinct from phrase completion and vocal-safe cue selection, which are the
additional Sub/Beats research goal. Deriving tempo from accepted beat timestamps
also aligns with an explicit upstream follow-up, without requiring us to change
the current pipeline.

Important comparison limit: our tests used official PyTorch models on complete
mixes with upstream chunking; #2244 uses an ONNX export on normal analysis
windows. Our results are not an end-to-end validation or failure reproduction
of that PR. Window context and edges can alter predictions. Any targeted PR
comparison should reuse exact sources and match its head/tail window/decode
settings before attributing differences to the export or integration. There
is no need to repeat the broad benchmark or reanalyse the station library.

Shareable evidence is committed on the fork, including timestamps, model/source
hashes, reproduction scripts and bounded owner listening confirmations. No
comment or message was posted to Perminder as part of this review; the owner's
statement records the intent to share findings, rather than an instruction to
send a specific message now.
