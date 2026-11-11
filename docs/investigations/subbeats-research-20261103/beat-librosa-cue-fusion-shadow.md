# Beat This! + Librosa incoming-cue shadow experiment

Run on 5 November 2026 in the development repository at `4b7295c0`. This was a
read-only shadow comparison over the 28 tracks with missing incoming cues and
five known-good controls. It did not alter prepared cues, station state, stems,
or application code.

## Method

The experiment read each track's cached Beat This! `small0` beat/downbeat grid
and ran the existing full-recording Librosa analysis on its original audio
(Librosa 0.11.0, NumPy 2.4.6). It used 32-beat Beat This! windows stepped every
four beats. A window needed a 95th-percentile timing error at or below 45 ms,
regular beat spacing, and at least 75% agreement on its local downbeat phase.
Librosa had to support a matching direct, half-time, or double-time tempo within
2%; the Beat This! grid also had to continue through at least 70% of the
supported region without a large gap or phase change.

Where those checks passed, the script projected hypothetical 8- and 16-bar
arrival markers from the first supported downbeat. These are deliberately
unverified hypotheses (`phrase_verified: false`), not saved cue points or
mixing approvals. A phase conflict in an earlier stable window suppressed the
proposal. The test ran CPU-only in an isolated, network-disabled container;
source audio and cached stems were read-only.

## Results

- **21 of 28 gap tracks** received projected markers; **7 remained unresolved**.
- **All five controls** had matching Beat This! and Librosa tempo evidence:
  Gusto — “Disco’s Revenge”, Robert Miles — “Children”, DJ Jean — “The
  Launch”, Rozalla — “Everybody’s Free”, and Urban Cookie Collective — “The
  Key, the Secret”. In this first pass their saved cue arrays were carried
  through unchanged by the control path; that alone did not test regeneration.
- Some projections land near the owner's notes: Altern 8 — “Activ 8” gives an
  8-bar arrival at 15.1s (noted beat onset 15s); Justice — “D.A.N.C.E.” gives a
  16-bar arrival at 34.7s (noted 35s); Sash! — “Ecuador” gives 33.5s (noted
  35s); Urban Hype — “Living in a Fantasy” gives 16.1s (noted 16s); and Blue
  Boy — “Remember Me” gives 21.2s, close to the stronger beat at about 22s
  described in the notes.
- The unresolved set was Chime, Praise You, White Noise, Ruffneck, E Vapor 8,
  R U Sleeping, and Beauty of Silence. Four had conflicting earlier Beat This!
  bar phases; the other three lacked a continuous tempo-supported grid.

The full per-track evidence and proposed positions are in
[`beat-librosa-cue-fusion-shadow-results.json`](beat-librosa-cue-fusion-shadow-results.json).
The runnable development-only script is
[`beat_librosa_cue_fusion_shadow.py`](beat_librosa_cue_fusion_shadow.py).

## Second pass: current phrase fitter on the same grids

I passed the cached Beat This! beat/downbeat arrays into the existing
`fitted_passages` function and required its fitted tempo to match the first
pass's Librosa support. This offline shadow run made **zero incoming proposals
on the 28 targets**, while the fitter reproduced the saved incoming markers
for **all five controls** within 50 ms. It gives a stronger control check than
the first pass, but its sustained low-frequency entry rule is too strict to
solve these gaps: it rejects even Activ 8 and Disciples, whose light or
high-passed rhythms are described in the notes.

The complete record is
[`beat-this-fitted-passages-shadow-results.json`](beat-this-fitted-passages-shadow-results.json);
the script is
[`beat_this_fitted_passages_shadow.py`](beat_this_fitted_passages_shadow.py).

## Small onset-anchor probe

A nine-track probe (four gap targets and all five controls) replaced the
low-frequency entry test with Librosa's percussive onset envelope while
retaining the cached Beat This! bar grid and the first pass's tempo/phase
checks. It proposed markers for two of four target tracks: Activ 8 gets an
8-bar marker at 15.15s, and Disciples gets one at 19.99s, close to the notes
about the main/hi-hat rhythms. It left Sugar Is Sweeter and I Feel Love
unresolved.

That probe is not ready either. It reproduces only **one of five control cue
lists** (Gusto). It misses Robert Miles — “Children”'s known 42.6s 16-bar marker
and instead chooses a later 103.44s driving-beat anchor; it also misses the
saved cues for Rozalla, Urban Cookie Collective, and DJ Jean. The
percussion-onset prototype therefore recovers useful quiet-entry cases but
fails the regression set. Its full nine-track result is saved in
[`beat-this-librosa-onset-shadow-results.json`](beat-this-librosa-onset-shadow-results.json),
and the research script is
[`beat_this_librosa_onset_shadow.py`](beat_this_librosa_onset_shadow.py).

## Opening-grid routing audit

I applied one routing rule to the saved evidence: when the first stable,
phase-consistent Beat This! window starts within 16 beats (four bars) of the
file start, use its projected 8/16-bar markers; otherwise use the combined
fitter/onset fallback. This post-hoc audit selects **14 candidate tracks and
leaves 14 unresolved**, with the current fitter still reproducing **all five
control cue lists**. It restores earlier plausible markers for D.A.N.C.E., A
Trip to Trumpton, and Teardrops, avoiding their late fallback anchors. It is
only a selection among existing shadow outputs, not a separate audio pass or
listening validation.

The per-track routing result is
[`beat-this-opening-grid-routing-audit.json`](beat-this-opening-grid-routing-audit.json).
The full audio-run result for the combined fitter/onset fallback is
[`beat-this-combined-fallback-shadow-results.json`](beat-this-combined-fallback-shadow-results.json),
produced by
[`beat_this_librosa_combined_fallback_shadow.py`](beat_this_librosa_combined_fallback_shadow.py).

## Owner listening and root-cause follow-up — 5 November 2026

The owner described the audition set as “Overall very good” and flagged four
tracks: Justice — “D.A.N.C.E.” was well off the eventual beat; Lonyo — “Summer
of Love” was one bar early for the natural release; Lovestation — “Teardrops”
and Sash! — “Encore une fois” had slightly fast clicks. The exact feedback is
preserved in
[`beat-this-opening-grid-owner-feedback-2026-11-05.json`](beat-this-opening-grid-owner-feedback-2026-11-05.json).

The error is not one common offset. The post-hoc router takes the earliest
stable 32-beat window, extrapolates its tempo and downbeat phase across 8/16
bars, and regards any local tempo within 2% as compatible. That can pass local
windows whose tempos gradually diverge enough to put the end of a 16-bar
projection out of phase. A read-only fit check against the cached Beat This!
beat timestamps found the second-half grid offset growing to +124ms for
Justice, +69ms for Lovestation and +108ms for Sash!; their whole-passage
95th-percentile errors were 188, 84 and 200ms. Independent percussive-onset
grid searches also preferred slower fixed-phase tempos for those three, but
these scores are exploratory, not calibrated tempo truth. Justice's selected
114.03 BPM opening window is followed by overlapping stable windows around
112.9 BPM, and its projected 16-bar cue at 34.715s falls before the noted
strong-beat area near 35s. After the selected first 32-beat window, the median
tempo of later windows is 112.96 BPM, 0.94% below the selected 114.03 BPM.
Lovestation's first window is near the 45ms local-fit limit; later windows have
a 128.59 BPM median, 0.22% below the selected 128.87 BPM. Sash!'s later windows
have a 131.70 BPM median, 1.45% below the selected 133.64 BPM. All three pass
the old 2% local compatibility allowance, but independent percussive-onset
searches also favor slower fixed-phase rates.

Lonyo is different: its projected beat grid stays within 20ms p95 of cached
Beat This! beats through bar 16, and adjacent tempo windows remain near
130.6–130.8 BPM. The owner’s natural-release cue is one bar later anyway. The
router inferred arrangement phrase boundaries from a beat-grid origin;
`phrase_verified` was explicitly false, and no pattern/release evidence was
checked. A tempo change cannot fix that cue.

The [full projection-fit audit](beat-this-opening-grid-fit-audit-2026-11-05.json)
compares all 14 candidates and five controls. I ran a separate shadow rule
evaluation using a 50ms limit on the 95th-percentile distance from every
projected beat to the nearest cached Beat This! beat. It marks **9/14 candidate
grids stable** and sends five to review: the three owner-reported tempo cases,
plus Disciples — “They Don’t Know” and The Future Sound of London — “Papua New
Guinea.” Those two have no specific owner correction, so the result is a review
signal, not a rejection. All four forward-projection controls pass. “Children”
has a 393ms whole-origin mismatch because the known 16-bar cue is counted
backwards through its beatless intro; it remains on its distinct back-projection
path and its accepted 42.6s cue is preserved.

Lonyo stays inside the stable bucket: its first-window 130.68 BPM and later
window median 130.66 BPM agree. That supports the diagnosis that its one-bar
error is arrangement phrase placement, not beat timing. The [threshold audit
script](audit_opening_grid_stability_rule.py) and
[results](beat-this-opening-grid-stability-rule-audit-2026-11-05.json) record
the comparison and threshold sweep. The [percussive-onset diagnostic](beat-this-opening-grid-feedback-diagnostic-2026-11-05.json)
records the source analysis and limitations.

This gate is only a shadow review criterion: it reuses Beat This! timestamps,
so it tests consistency of a projected constant grid with that model's own
later beats; it cannot establish audible truth or phrase placement. Do not use
it as an automatic cue rejection or correction yet. No cue was changed or
saved, and the station remains untouched.

### Cue-local follow-up — 5 November 2026

The two additional full-passage flags are concentrated in unstable early grid
evidence, rather than drift at their longer cue points. Disciples has a cluster
of roughly half-beat residuals from about 5.8–9.5s, then its cached grid aligns
with the projection; Papua New Guinea's early grid is irregular through about
11.3s, then becomes stable around 11.8s. At their 16-bar markers the signed
marker errors are only −37ms and −6ms, and the preceding eight-bar fit p95s are
about 47ms and 23ms. The whole-origin p95 rule therefore overstates their
long-cue risk.

A per-marker audit across all 14 candidates and five controls checks the final
half of each cue's counted span. For 16-bar markers, **11/14 candidates pass**
the same 50ms p95 threshold; the only three that fail are exactly Justice,
Lovestation and Sash!, whose 16-bar markers show 207ms, 86ms and 218ms p95.
All four forward 16-bar controls pass. “Children” remains separate because its
cue counts backward through the beatless intro. This local comparison narrows
the useful review signal to the actual cue choice instead of treating any
early mismatch as a track-wide failure.

The 8-bar options need separate interpretation. Disciples passes its final
four-bar fit. Papua's 8-bar option has an unstable approach (about 229ms p95 in
the preceding four bars) even though the marker itself is within 21ms of a
cached beat. Treat that as uncertainty around that option, not proof the cue
is misplaced. A focused owner listen of the 8-bar options for Papua and
Lovestation found both usable. This confirms that the local fit warning is a
review signal, not an automatic rejection; it does not resolve Lovestation's
separate 16-bar tempo concern. The Lonyo markers also pass their local beat
checks, so its natural-release error still needs phrase evidence.

The [per-marker audit](beat-this-opening-grid-cue-local-audit-2026-11-05.json)
records all 19 tracks and each cue's marker error plus trailing 4/8-bar fit.
Current evidence favors running this cheap per-cue check across every proposed
marker, then reserving deeper diagnosis for markers whose own approach drifts
or lacks reliable beat evidence. The whole-origin score can remain a separate
early-grid quality note; it should not decide a later cue by itself. This is
still shadow research, not a production gate.

## What this does not establish

The 21 proposals are not 21 validated cues. The shadow can agree on tempo and
bar phase in a later stable section, then project from an unsuitable opening
anchor. Donna Summer — “I Feel Love” is one warning: its first selected stable
window begins at 43.6s and it proposes 59.8s/75.0s despite the notes marking a
beat from the beginning. “I Love U” selects a window from 28s and proposes
39.6s/50.6s against the noted 20s beat start. “Bells of n Y” similarly selects
a window from 16.3s and proposes 31.7s/46.7s despite a beat from the start.
“Sugar Is Sweeter” proposes 58.8s/79.5s even though the noted unusual entry is
around 44s. These need an opening-anchor check before any proposal could be
saved.

The owner's `Beat Starts` values are listening annotations about audible
rhythm, not exact labels for an 8- or 16-bar arrival. They are useful review
evidence, but not a pass/fail score by themselves. The useful finding is
narrower: Beat This! supplies bar-grid and local-phase evidence, while Librosa
can independently corroborate tempo and expose percussive onset evidence. A
bass-only entry gate is too strict for some quiet introductions; a global
onset threshold can select a later beat in “Children”. Neither signal pair
alone verifies phrase meaning, vocal safety, or a suitable transition.

## Next research step

The owner has auditioned the 14 opening-grid proposals, and both whole-passage
and per-marker shadow checks have run against the five controls. Focused
listening confirms the 8-bar options for Lovestation and Papua are usable,
including Papua's option whose approach has irregular grid evidence. Before
considering integration, test the per-marker result on a broader set with
different intro patterns, especially 8-bar arrivals, and make the beatless-intro
route general rather than special-casing “Children.” Keep natural-release
phrase detection separate: Lonyo demonstrates that a reliable beat grid can
still place a cue one bar early. Do not change station preparation until those
cases have an evidence-based result.
