# Sub/Beats project review — 3 November 2026

Scope: inspected README material, the relevant analysis implementations and test coverage in three shallow checkouts. No third-party project was installed or executed. One bounded check confirmed that our installed Librosa 0.11.0 exposes neither `feature.key_mode` nor `segment.detect_segments`, both called by DynaMix. No Subwave application files, settings or cached analyses changed.

| Project | Inspected revision | Assessment |
| --- | --- | --- |
| CueKey | `e08f7a0fb629585b02550d84325b5a758b63fe82` | Useful tempo/cue ideas; no true downbeat or phrase detector |
| Arkcadian | `0e7c5e1a809f97e2c885f41bbbb1a6568b7fa610` | Closest architectural reference: Beat This! plus timing checks and Demucs descriptors |
| DynaMix | `46e6bffcc33414337d3b49c6ea12006498a5baeb` | Interface/feature ideas; analysis code requires repair and does not establish phrase safety |

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

## Recommended order

1. Independently compare official Beat This! small0 and final0 on the exact five recordings; preserve human anchors and inspect continuous beat/bar alignment.
2. Derive local tempo from accepted beats and apply explicit quality/ambiguity checks to each candidate mixing window. Keep predicted bar starts separate from musical phrase starts.
3. Combine bar-aligned arrangement changes and repetition with local vocal/bass presence to investigate 4/8/16-bar phrase boundaries and completed-cycle releases.
4. Later expose the resulting evidence and editable windows through Sub/Beats' existing preview UI. None of these projects supplies a ready replacement for that work.

Cübik remains the owner's regular-transition preference. Our earlier differently paced fixed-click auditions are not proof of actual tempo drift, so do not use that observation alone as a negative ground-truth label for model accuracy.
