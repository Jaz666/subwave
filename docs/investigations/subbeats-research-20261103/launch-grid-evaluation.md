# The Launch: accepted grid auditions and implementation direction — 4 November 2026

Status: listening reference and agreed implementation requirements. No detector,
renderer, saved station cues or stem coverage was changed for this experiment.
The owner asked to record the findings, then examine a long beatless intro before
implementation. Current station source remains `a383ea66` (preview version 10).

## Recording and listening evidence

DJ Jean — The Launch, station ID `6oHEwHqDSmVvVLQitbD1Ag`, duration
193.266667 seconds. Original source SHA-256:
`2074950c1936f5a44ac6819c7d800c55e6507af52c6a379a88bbb68363fc528b`.
The owner's annotated MixMeister waveform identifies a short vocal pickup before
the beat, a 16-bar opening, an outro section around 2:28, a 16-bar outgoing start
around 2:42, and an 8-bar alternative around 2:56. The owner corrected a later
bar-number reference: the 16-bar start is bar **92**, not 96, after changes in
Fusion since the screenshot. Use zero-based numbering as in this reference.

The offline experiment used the original complete mix, official pinned Beat
This! small0 weights and CPU inference with two threads. It reproduced the saved
outgoing choices. No new separation, station preparation or play reporting was
performed. A constant beat grid was then fitted to consistent beat observations,
anchored at source 0.680s. Its tempo is 136.507619 BPM. This is a proposed global
grid with owner-labelled reference boundaries, not an improved detector output.

| Reference | Bar | Original source seconds |
| --- | --- | --- |
| First established downbeat, after pickup | 0 | 0.680000 |
| Natural end of 16-bar intro | 16 | 28.810298 |
| Start of outro section | 84 | 148.364065 |
| 16-bar outgoing start | 92 | 162.429214 |
| 8-bar outgoing start | 100 | 176.494363 |
| Proposed musical phrase end | 108 | 190.559512 |
| File/audio endpoint | — | 193.266667 |

The head audition retains source zero and ends at 35.842880s. The tail audition
starts at source 141.331497s and retains the natural ending. Light clicks mark
beats, stronger clicks mark bars, and bells mark the reference boundaries.
The owner heard both and responded **“spot on”**. Treat them as the accepted
listening reference for this recording's grid, opening and closing markers.
The bar-108 marker is a continuation of the fitted grid, beyond the final
Beat This! prediction at 188.380s; it is not independently detected endpoint
confidence. No universal phrase-origin or automatic pair approval follows.

[Exact audition metadata](launch-metronome-result.json) records clip offsets,
markers, source hash, level and fitted grid. WAVs, original annotation backup,
full predicted grid, feature arrays and scripts remain outside Git at:
`/home/jaz666/codex/subbeats-beat-this-20261103/launch/`.
The annotation backup is `owner-annotated-waveform.png`; audition files are
`the-launch-head-metronome.wav` and `the-launch-tail-metronome.wav`.

## Why the current detector missed the useful closing runs

- The learned bar near the outro-section entry is 148.400s. The local fit's
  maximum error is 35.59ms against the 35ms gate, so that position is rejected
  before structural scoring. This is one rejection reason, not proof that
  loosening that gate alone would identify the outro correctly.
- A structural candidate exists at 162.420s, but stronger, spaced earlier
  changes displace it from the eight outgoing menu choices.
- 176.480s is already retained as Pattern Change. The model's late predictions
  end at 188.380s, with an incomplete final bar, preventing the current strict
  observed-8/16-bar confirmation.
- The current rule seeks two local structural changes with a sustained energy
  decline. Useful phrase starts within an outro need not each be strong changes;
  the waveform also shows why full-mix volume alone cannot identify that section.

## Agreed direction for implementation

1. Keep audio source zero separate from the musical grid origin. Preserve the
   vocal pickup. Establish the first musical downbeat and consistent global bar
   numbering; retain confidence/provenance where detections are missing or a
   continuation is inferred. An established grid must not silently become a
   claim that every intervening beat was observed.
2. Investigate the natural musical ending as the main closing reference. Use
   audio/phrase evidence and the established grid to locate preceding 16- and
   8-bar starts. The musical endpoint, final beat prediction and file end are
   separate. Do not subtract a nominal duration from EOF or force an arbitrary
   fade endpoint to be a phrase boundary.
3. Use phrase alignment, not a universal rule that bar numbers are divisible by
   eight. The accepted closing sequence is 84 → 92 → 100 → 108; it has a
   four-bar offset from zero modulo eight. Outro-section detection is optional
   supporting evidence, not a required admission gate. Generalisation across
   tracks, breaks and phase shifts remains to be evaluated.
4. Target cached **mixing stems and selectable mixing cues** to the opening
   16-bar passage and closing 16-bar passage. The 8-bar alternatives should reuse
   those regions. Strong unrelated earlier changes need not fill the outgoing
   cue menu. Retaining lightweight beat-grid/structural evidence for analysis
   does not require exposing all of it as mixing cues.
5. Retain the complete pickup before the head grid and the natural vocal/reverb
   decay after the closing passage. For this reference, the minimal core head
   runs from source zero to 28.810298s; the tail runs from 162.429214s to EOF
   (about 30.84 seconds). These are targets before any necessary seam handles,
   not permission to cut audio at an exact 16-bar duration.
6. Use surrounding context for separation, then discard context not needed for
   mixing. Determine the small retained seam handles and incoming post-arrival
   coverage the renderer genuinely needs: the current preview continues at
   least two incoming bars beyond handover while the outgoing finishes.
   Preserve vocal-overlap checks and enough audio to complete both passages.
7. Replace the conservative 130-second head / 120-second tail preparation only
   after cue selection and rendering share this narrower coverage contract.
   Existing artifacts must remain usable during an explicit upgrade; do not
   automatically delete them or mark uncertain boundaries as ready. No cache
   reduction or detector implementation is included in this documentation update.

## Next investigation

Examine the owner's next track with a **long beatless intro** before implementing
these changes. Establish where its musical timing can be trusted and how its
complete opening is retained. Do not assume file start equals first beat, infer
that a beatless section contains confidently observed beats, or trim it to fit a
16-bar cache. The next example must inform the incoming coverage/entry policy;
the subsequent [Children investigation](children-grid-evaluation.md) now records
the owner's next reference and the implications for complete opening coverage.
