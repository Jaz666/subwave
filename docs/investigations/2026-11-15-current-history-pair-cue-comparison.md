# Current-history pair cue comparison

Recorded 15 November 2026. This compares old PyTorch and new shared ONNX Sub/Beats cue preparation on the exact current library files used by three recent dance-related Stem Blend transitions. The full hashes and per-track outputs are in the adjacent [JSON results](2026-11-15-current-history-pair-cue-comparison.json).

## Result

All six tracks produced identical beat and downbeat timestamp arrays between the old and new code. Their incoming/outgoing cues, selected grid, ending estimates, and decision routes also matched exactly. This repeats the implementation-parity check on recent current library entries, avoiding the ambiguous earlier Urban Cookie Collective and Gusto copies.

| Outgoing → incoming | Current genres | Old/new result |
| --- | --- | --- |
| Armin van Buuren — Communication → JX — There's Nothing I Won't Do (JX Original mix) | Electronic, Progressive Trance, Trance → Progressive Trance | Exact cue parity |
| Livin’ Joy — Dreamer (7" mix) → Basement Jaxx — We Are Not Alone | House → House | Exact cue parity |
| The Tamperer featuring Maya — Feel It (Blunt edit) → 808 State — 10 x 10 (Gorgeous mix) | House → Techno | Exact cue parity |

Each source was located from its current Navidrome media record; byte size matched the Navidrome and Sub/Wave library records. The runs used the old checkpoint (`6074be…d47b`) and new ONNX model (`5cff50…f6eaf`) in a network-disabled, CPU-limited container. Audio inputs were mounted read-only; no station database, stem cache, or settings were mounted. Results were written under `/tmp`.

This tests beat-grid and cue-generation changes only. It did not run Demucs stem separation, recreate stem files, or render an audible pair. It therefore shows the shared inference path preserves cue choices on these exact files; it does not establish that a transition is musically good.

## Performance context

Per-track runtimes were not recorded in this parity run. A separate small
inference benchmark in the [ONNX assessment](2026-11-13-subbeats-onnx-assessment.md#first-use-and-memory)
measured a median warm 40-second inference of 2.417 s on ONNX versus 2.846 s
on the PyTorch predictor, and 9.484 s versus 11.067 s on one 213.6-second
track, with the PyTorch stack imported in both processes. This is a useful
indication that ONNX can be faster after warm-up, not a requirement or
justification for the change; the reason for the shared path is reuse and
consistent cue behavior. These measurements are not full Sub/Beats preparation
times and do not establish an end-to-end speed or memory gain.
