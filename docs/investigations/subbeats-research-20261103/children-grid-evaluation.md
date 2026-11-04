# Children: complete beatless opening and provisional grid — 4 November 2026

Status: owner references plus offline investigation. No detector, renderer,
station cue, preparation or cache policy changes. No listening approval of new
Children previews has been given. This follows the accepted
[Launch auditions and implementation plan](launch-grid-evaluation.md).

## Recording and owner references

Robert Miles — Children, prepared station ID `7bfhXAe5NRn4ZGopPSY0WZ`, album
*30 Years: Three Decades of Dance*, decoded duration 246.706667 seconds. Local
source: `/media/satadrive/Compilations/30 Years - Three Decades of Dance (2021)/CD 01/04 - Children.mp3`.
Source SHA-256: `3904b492af33b2ef18f4e50cb5a677599acfdff4d7fc43acea6f889edb7f9cba`.
Other editions exist in the library; these findings concern this prepared copy,
whose saved markers agree closely with the owner's approximate references.

The owner says the driving beat starts around 42 seconds and its famous long
beatless opening must not be skipped. MixMeister labels that entry bar 16 and
projects bar zero backwards to around 14 seconds. The owner gives bar 112 as
the 16-bar outro start. These are reference labels, not an instruction to begin
playback at bar zero or hardcode a track-specific algorithm.

## Saved analysis and offline check

The current saved incoming choices are 56.60s (8-bar phrase starting 42.60s),
14.64s, 42.60s and 39.14s, in relevance order. Its original stem suitability
assessment reports no supported head kick grid. This does not establish that
the opening should be skipped or that its music has no timing. Saved outgoing
choices range from 128.40s to 187.94s: none covers the owner's proposed outro.

An offline repeat with the official pinned Beat This! small0 weights, CPU/two
threads, produced the full beat/downbeat sequence in about 13 seconds. It used
the original mix only: no stem separation, live scan or play reporting. A
constant grid anchored at the model downbeat 42.60s, labelled bar 16 by the
owner, was fitted to beat predictions from 42.60s through 210s. All 383 of those
predictions fell within the fit's 60ms admission tolerance; median/p95 absolute
residuals are 12.35/37.00ms. Fitted tempo is 137.082961 BPM.

| Reference | Bar | Source seconds | Evidence |
| --- | --- | --- | --- |
| Audio playback start | — | 0.00 | Preserve original opening |
| Musical grid origin | 0 | 14.587766 | Back-projected from bar 16 |
| Driving beat enters | 16 | 42.600000 | Owner reference and model downbeat |
| 16-bar outro start | 112 | 210.673405 | Owner bar label projected on fitted grid |
| Possible 8-bar alternative | 120 | 224.679522 | Provisional continuation |
| Possible phrase endpoint | 128 | 238.685639 | Provisional continuation |
| Original audio end | — | 246.706667 | Decoded duration |

The late timings are **not audition-confirmed**. Bar 128 is a proposed phrase
endpoint, not a detected natural ending. Retain the original ending while that
is evaluated. Early beat predictions exist even before the kick enters; their
presence alone does not prove reliable downbeats in the beatless opening.

The model's downbeat phase also changes later: 189.66s agrees with projected
bar 100, but 206.30s/209.76s/211.52s lie near bars 109.5/111.5/112.5. The beat
prediction at 210.64s is close to projected bar 112, despite not being labelled
a downbeat. Model labels return near the original phase at 238.72s. Therefore
beat timing and bar-phase confidence must be considered separately. This is
model disagreement; a real musical phase change has not been established.

[Exact evidence and saved cue snapshot](children-grid-result.json) includes the
fit and phase examples. Full grid and repeat probe remain outside Git in
`/home/jaz666/codex/subbeats-beat-this-20261103/children/`.

## Owner clarification: intro decay beyond the phrase boundary

The owner reports approximately one second of fading echo from the final intro
beat extending beyond the 16-bar opening. This is listening evidence supplied
by the owner, not a newly measured tail endpoint. The bar-16 arrival remains the
musical timing reference; it must not become a hard cut of the intro audio.

Preserve that decay into the driving-beat section. The retained stem coverage
and rendered gain envelopes must both allow the tail to finish naturally;
retaining samples alone is insufficient if the mix mutes them at the marker.
Required continuation is track-dependent: do not hardcode a universal one-second
extension, move the beat-grid marker to the end of the echo, or apply one cutoff
to every stem. Account for the audible retained tails in pair/vocal-overlap
assessment. Audition the boundary and decay when validating this example.

## Implications for the proposed implementation

- Keep audio origin, projected grid origin and established driving-beat entry
  distinct. Preserve all audio from 0:00, including the approximately 14.6 seconds
  before grid zero and the beatless 16-bar passage before 42.6s. Beatless does
  not mean silent or dispensable.
- Derive a musical grid from a reliable passage and retain provenance when
  projecting backwards or maintaining phase across model disagreements. Do
  not blindly reset bar counts on every new downbeat prediction, or claim
  inferred early beats were independently observed.
- The opening cache target is source zero through the selected arrival plus
  required incoming follow-through/seam coverage. Here it must retain the full
  42.6-second lead if that arrival is chosen; a strict 16-bar-duration cache
  would lose part of the introduction. Existing conservative coverage stays
  unchanged until the renderer and selection share the replacement contract.
- Matching must use the complete source-zero lead, not just the duration from
  grid zero. Aligning this 42.6-second opening against a roughly 28-second
  outgoing run requires an earlier incoming start or a different arrangement.
  Do not solve that mismatch by skipping music or suppressing either passage.
- Bar 112 supplies a closing reference to audition against the natural ending;
  it is not automatic approval of projected bars 120/128 or pair suitability.
  Vocal-overlap protection remains required; beatless does not mean vocal-free.

Next: audition the complete head and proposed tail markers against the owner's
references, then discuss general detection and coverage choices before changing
runtime behavior. No Children audition was generated as part of this check.
