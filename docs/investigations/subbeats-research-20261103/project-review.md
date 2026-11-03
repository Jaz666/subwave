# Sub/Beats project review — 3 November 2026

Scope: inspected README material, relevant analysis implementations and available test coverage in five shallow checkouts. None of these five projects was installed or executed. One bounded check confirmed that our installed Librosa 0.11.0 exposes neither `feature.key_mode` nor `segment.detect_segments`, both called by DynaMix. The separate official Beat This! experiment is recorded in [its evaluation](beat-this-evaluation.md). No Subwave application files, settings or cached analyses changed.

| Project | Inspected revision | Assessment |
| --- | --- | --- |
| CueKey | `e08f7a0fb629585b02550d84325b5a758b63fe82` | Useful tempo/cue ideas; no true downbeat or phrase detector |
| Arkcadian | `0e7c5e1a809f97e2c885f41bbbb1a6568b7fa610` | Closest architectural reference: Beat This! plus timing checks and Demucs descriptors |
| DynaMix | `46e6bffcc33414337d3b49c6ea12006498a5baeb` | Interface/feature ideas; analysis code requires repair and does not establish phrase safety |
| djcues | `bca23a1049aa44b563acd42b6afaa1fd6a8ae94d` | Cue strategy and review workflow over existing Rekordbox analysis; not its own audio phrase detector |
| automatic-cuepoints | `52cd53115305cef683c1fd7f7c3046949b5c42c9` | Most relevant new structural baseline: barwise similarity and CBM segmentation; later heuristics can move boundaries |

## Arkcadian: strongest reference

[Tempo](https://github.com/risshe92/Arkcadian/blob/0e7c5e1a809f97e2c885f41bbbb1a6568b7fa610/modules/tempo.py) uses the official Beat This! `final0` model without DBN. It derives BPM from the resulting beat times rather than retaining an unrelated Librosa tempo. [Run fitting](https://github.com/risshe92/Arkcadian/blob/0e7c5e1a809f97e2c885f41bbbb1a6568b7fa610/common.py) estimates tempo over stretches of beat intervals, helping average out the model's 20ms timestamp resolution. This supports our proposed independent Beat This! comparison, and addresses the BPM/grid disagreement identified in upstream PR #2244.

[Beat-grid checks](https://github.com/risshe92/Arkcadian/blob/0e7c5e1a809f97e2c885f41bbbb1a6568b7fa610/modules/beatgrid.py) inspect local tempo, likely half/double/triplet tracking mistakes, bar spacing and a late first downbeat. Adapt the concepts to complete candidate mixing windows. Do not import its thresholds/verdicts directly: it permits partial inlier support, uses short steady runs, and explicitly treats a case with no steady local windows as steady tempo. Sub/Beats must retain unknown/ambiguous outcomes and validate continuous alignment over its intended 16-bar windows. Its steady-interval share is a descriptive measurement, not calibrated probability that a mix is safe.

[Bass measurements](https://github.com/risshe92/Arkcadian/blob/0e7c5e1a809f97e2c885f41bbbb1a6568b7fa610/modules/bass.py) distinguish low-end energy, transient density and bass-stem occupancy. These are useful candidate descriptors for bass handover and comparing arrangement changes. For Sub/Beats, measure locally per bar using already cached stems rather than adding another separation pass. Occupancy or stable energy does not establish a seamless or vocal-safe loop.

Its [vocal detector](https://github.com/risshe92/Arkcadian/blob/0e7c5e1a809f97e2c885f41bbbb1a6568b7fa610/modules/vocals.py) is another Demucs RMS gate, not sung-phrase recognition. Its [structure module](https://github.com/risshe92/Arkcadian/blob/0e7c5e1a809f97e2c885f41bbbb1a6568b7fa610/modules/structure.py) defines intro/outro by first/last vocal activity and falls back to first/last downbeat. That would not solve Rozalla's incoming vocal-led opening or Gusto's completed repeating groove. S-KEY is a separate possible later key-detection comparison, not necessary for the present phrase investigation.

No licence file or explicit code licence was found in the inspected checkout. Treat it as a reference; clarify licensing before copying its implementation.

## CueKey: tempo hypotheses and a structural baseline

[Tempo analysis](https://github.com/Supercarlillos/cuekey/blob/e08f7a0fb629585b02550d84325b5a758b63fe82/src/cuekey/analysis/tempo.py) compares half/double and 3:2 / 4:3 alternatives using onset autocorrelation across multiple beat-period lags. Sub/Beats already compares multiple tempo hypotheses; explicit metrical alternatives may be a useful additional diagnostic on syncopated tracks. Test them as competing hypotheses, not automatic corrections. CueKey's club-tempo prior and integer/half-integer rounding should not decide an exact beatmatching tempo for our library.

[Cue detection](https://github.com/Supercarlillos/cuekey/blob/e08f7a0fb629585b02550d84325b5a758b63fe82/src/cuekey/analysis/cues.py) clusters timbral and harmonic features (MFCC + chroma), then snaps boundaries to a grid. It is a useful alternative baseline for arrangement-change candidates. However, it requests a fixed segment count, keeps at most eight cues, and labels approximate downbeats as every fourth tracked beat from the first. It cannot establish actual bar origin, phrase completion, or safe vocal cuts. Our existing structure code already measures energy, spectrum and harmony changes; importing CueKey wholesale would duplicate much of that work.

[Licence](https://github.com/Supercarlillos/cuekey/blob/e08f7a0fb629585b02550d84325b5a758b63fe82/LICENSE): PolyForm Noncommercial 1.0.0. This restriction matters for any distributed Subwave integration; do not treat it as a permissive code dependency.

## DynaMix: ideas rather than a dependency

[Analysis code](https://github.com/makalin/dynamix/blob/46e6bffcc33414337d3b49c6ea12006498a5baeb/audio_utils.py) combines familiar Librosa features and energy heuristics. Pair compatibility is a weighted global BPM/key/energy score, which does not assess the actual overlap or vocal boundaries. Section labels are assigned sequentially from a hard-coded intro/verse/chorus/bridge/outro list, rather than inferred musical functions. The key and section routines call APIs absent from our installed Librosa, so those advertised capabilities need implementation repair before evaluation.

[Loop suggestions](https://github.com/makalin/dynamix/blob/46e6bffcc33414337d3b49c6ea12006498a5baeb/dj_tools.py) count 4/8/16/32 beats and rank energy stability. There is no verified bar origin, phrase origin, vocal pickup/tail test or loop-edge continuity check. Its mixing-duration recommendation also caps a duration at 16 while the comment calls it bars, without converting by tempo. Reuse the broad idea of explaining cue/loop recommendations, not its safety decisions.

[Licence](https://github.com/makalin/dynamix/blob/46e6bffcc33414337d3b49c6ea12006498a5baeb/LICENSE): MIT.

## djcues: cue roles over existing Rekordbox analysis

The [reader](https://github.com/mcroydon/djcues/blob/bca23a1049aa44b563acd42b6afaa1fd6a8ae94d/src/djcues/db.py)
extracts Rekordbox's PSSI phrase labels and PVDI vocal-confidence data from
existing analysis files. It does not generate either from audio. Its timing
model retains database BPM and the first beat timestamp, then reconstructs a
constant grid; it does not preserve all measured beat timestamps or validate
bar origin. Thus it cannot directly supply Sub/Beats' missing phrase detector.

The [strategy](https://github.com/mcroydon/djcues/blob/bca23a1049aa44b563acd42b6afaa1fd6a8ae94d/src/djcues/strategy.py)
assigns distinct roles: first beat, vocal/buildup, drop, breakdown, special,
outro and loop positions, with earlier memory cues as approach markers.
These role distinctions and the review UI's per-bar adjustment are useful
design references. They do not justify the same fixed eight-slot system for
automatic transitions. Defaults include a 16-bar approach and four-bar loops;
neither is a musically validated overlap duration.

Important limitations in the active path:

- Drop selection prefers the first supplied Chorus after 20% of track duration.
  That prior can skip an important early arrival like our ~22-second examples.
- Vocal placement begins at a strong PVDI frame, requires a roughly two-second
  nonzero run and snaps to a nearby phrase boundary (within four bars) or bar.
  This can move a cue past an actual vocal pickup; it does not recognise a
  complete sung phrase or establish safe outgoing vocal cuts.
- Loop In is the first beat; Loop Out is the outro cue. Endpoints are computed
  by adding the configured number of bars. `_find_stable_loop` exists but is
  not called by `propose`; the active path does not establish instrumental
  content or a seamless loop edge. Its RGB/height half-window similarity helper
  would not by itself establish either property.
- Confidence values such as 1.0 for first beat and .85 for a chosen phrase are
  assigned constants, not calibrated correctness or mix-safety probabilities.
- Strategy tests use supplied phrase/grid fixtures; they do not validate an
  independent audio phrase model. No published accuracy claim was reproduced.

[Licence](https://github.com/mcroydon/djcues/blob/bca23a1049aa44b563acd42b6afaa1fd6a8ae94d/LICENSE): BSD-3-Clause.
Useful reference for cue roles and eventual review controls, rather than a new
analysis dependency. Local checkout: `/home/jaz666/codex/subbeats-project-review-20261103/djcues`.

## automatic-cuepoints: a more relevant structural experiment

The [CBM engine](https://github.com/shiva-menta/automatic-cuepoints/blob/52cd53115305cef683c1fd7f7c3046949b5c42c9/track_interface/cuepoint_engines/cbm_engine.py)
loads the audio, averages 80-band log-mel features within supplied bars, forms a
bar-to-bar similarity matrix and uses dynamic programming to choose coherent
sections. Defaults allow 4–32-bar sections and favor eight bars. A later
novelty filter merges boundaries where adjacent sections are too similar.
The implementation cites Correlation Block Matching music-structure research;
its per-bar means should not be assumed equivalent to a complete reproduction
of the cited paper. We reviewed this implementation, not the paper's method
or published results independently.

This is a useful complement to our local arrangement-change detector: compare
whole bar patterns, rather than requiring one large local energy/spectral
change. **Our inference:** a barwise similarity baseline is worth testing on
the accepted Urban/Gusto openings. However, its default novelty filter could
remove a meaningful completed-cycle release such as Gusto's if the sound remains
similar across it. Bar averaging also discards within-bar ordering. Retain raw
similarity/segmentation evidence and compare repetition explicitly; do not
equate a homogeneous section with a complete vocal or rhythmic phrase.

Its [Rekordbox adapter](https://github.com/shiva-menta/automatic-cuepoints/blob/52cd53115305cef683c1fd7f7c3046949b5c42c9/track_interface/track_interface.py)
supplies existing beat numbers and timestamps; the CBM engine itself does not
infer or verify downbeats. Accepted Beat This! bars could supply that input in
an isolated experiment, with local timing gaps kept explicit.

The active [postprocessing](https://github.com/shiva-menta/automatic-cuepoints/blob/52cd53115305cef683c1fd7f7c3046949b5c42c9/track_interface/cuepoint_engines/heuristics.py)
snaps to supplied bars, votes for a start among the first four bars and uses
`DPMeasureAlignment` to move boundaries by up to two bars, preferring power-of-two
or four-bar-multiple spacing. These are arrangement priors, not observations of
phrase origin. Preserve detected and adjusted positions separately; initially
disable these adjustments when testing against owner anchors. The 4–32-bar
constraint is on segments, not transition overlap, and novelty merging can
produce longer final segments.

Two other paths need to be distinguished:

- The [All-in-One wrapper](https://github.com/shiva-menta/automatic-cuepoints/blob/52cd53115305cef683c1fd7f7c3046949b5c42c9/track_interface/cuepoint_engines/all_in_one_engine.py)
  sends the recording to a Modal GPU deployment of the external `allin1` model,
  receives labelled segments and applies similar bar/length heuristics. It is
  a separate possible learned-structure comparison, not a feature of the local
  CBM algorithm. No upload, deployment, account setup or model run was performed.
- The older recurrence engine has unfinished integration: a hard-coded local
  debug-output path, unused inter-section results, and a heuristic loop that
  repeatedly uses the original intra-section candidates. Do not treat its
  historical scores in `algorithm.md` as validated CBM or All-in-One accuracy.

The [evaluation CLI](https://github.com/shiva-menta/automatic-cuepoints/blob/52cd53115305cef683c1fd7f7c3046949b5c42c9/demo.py)
compares exact millisecond positions against existing hot cues, excluding the
first supplied downbeat. Such scores describe agreement with one annotation
set; they do not assess acceptable alternative cues, vocal tails, loops or
pair compatibility. No scores were reproduced and no standalone test suite
was found in the checkout.

No repository licence file or explicit project licence was found at this
revision. The CBM file also says it is adapted from MSAF. Review the original
method and licensing before any implementation reuse. Do not install the
whole application just for CBM: its dependency set also includes Demucs,
All-in-One, Modal, a pinned Torch range and Rekordbox integration.
Local checkout: `/home/jaz666/codex/subbeats-project-review-20261103/automatic-cuepoints`.

## Recommended order (updated after model listening)

1. Complete: official small0/final0 comparison on the five exact recordings. The owner subsequently said the Urban `final0` and Gusto `small0` 32-second auditions sound fine. This accepts their tested opening beat/bar alignment, not later regions or phrase/cut safety.
2. Next: compare existing arrangement features with a small barwise similarity/repetition baseline on those accepted opening grids. Start with raw boundaries, without forced phrase-length shifts; inspect the 22.412s Urban change and 22.964s Gusto release separately. Review the original CBM method before adopting its algorithm.
3. Derive local tempo from accepted beats and preserve explicit quality/ambiguity checks over each eventual transition window. Combine bar-aligned changes/repetition with vocal/bass evidence; allow unknown when a completed cycle or safe vocal edge is not established.
4. Later expose the resulting evidence and editable windows through Sub/Beats' existing preview UI. None of these projects supplies a ready replacement for that work.

Cübik remains the owner's regular-transition preference. Our earlier differently paced fixed-click auditions are not proof of actual tempo drift, so do not use that observation alone as a negative ground-truth label for model accuracy.
