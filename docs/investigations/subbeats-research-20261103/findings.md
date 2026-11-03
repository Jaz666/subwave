# Musical phrase confidence: first reference evaluation

2 November 2026. Investigation only; no changes to analysis, matching, preview envelopes or cached bundles.

## Reference recordings

The exact prepared versions requested by the owner are used. These measurements cover only the cached 68-second head and up-to-90-second exit regions, not a new full-recording structural analysis. Listening clips are reconstructed from the four cached stems at a constant 0.8 gain and encoded to MP3 for audition. No stretching, looping or transition is applied.

| Recording | Region | Original source coverage (seconds) | Structural landmarks | Strongest suggested changes (original seconds) |
|---|---|---|---:|---|
| Gusto — Disco’s Revenge (Mole Hole radio edit) | incoming | 0.00–68.00 | 2 | 26.75, 53.89 |
| Gusto — Disco’s Revenge (Mole Hole radio edit) | outgoing | 140.66–230.66 | 16 | 199.15, 190.58, 153.48 |
| Rozalla — Everybody’s Free (To Feel Good) | incoming | 0.00–68.00 | 12 | 66.62, 52.31, 48.16 |
| Rozalla — Everybody’s Free (To Feel Good) | outgoing | 30.31–120.31 | 31 | 116.94, 118.77, 72.63 |
| Urban Cookie Collective — The Key, the Secret | incoming | 0.00–68.00 | 16 | 22.40, 42.71, 44.57 |
| Urban Cookie Collective — The Key, the Secret | outgoing | 59.59–149.59 | 22 | 148.05, 66.75, 116.62 |

## What the evidence means

- Standard library bars are every fourth tracked beat, anchored to the first detected beat. This does not determine which beat is the musical downbeat.
- All 103 prepared tracks have saved suitability assessments; none has verified bar alignment.
- Existing structural landmarks use level, bass, spectral and harmonic changes over 4-, 16- and 32-beat contexts. They are changes to inspect, not complete musical phrases. The existing low/medium labels are heuristic evidence labels, not measured accuracy.
- In this reference set, Gusto favours different possible four-beat alignments in its two cached regions. Rozalla and Urban Cookie Collective favour the same possible alignment, but votes are distributed across alternatives. Agreement is useful evidence; it is not proof.
- In the preliminary contrasting set, My Love has no detected structural landmarks in its outgoing region. A uniform passage must be allowed to remain unknown rather than being assigned a phrase start.
- Energy-based vocal activity does not establish complete sung phrases. The vocal measurements and musical phrase labels need separate listening checks.

## Next implementation, after the listening anchors

1. Record one clear downbeat and musical phrase-start anchor in each reference recording. Keep exact edit/version and source time, not a presumed phrase origin at time zero.
2. Assess beat timing, four-beat bar alignment and 4/8/16-bar phrase position independently. Keep competing origins and an explicit unknown/ambiguous outcome.
3. Use arrangement changes and repetition to support phrase boundaries; evaluate full-recording context before relying on a region that contains only one or two repetitions. Do not force a segment count or regular phrase length.
4. Check the selected boundaries against complete vocal activity, including pickups and tails. Only then evaluate the outgoing-vocal/incoming-rhythm arrangement and instrumental loops adding multiples of four bars.
5. Compare our existing Librosa evidence with a purpose-built downbeat detector only if the listening examples show the current evidence is insufficient. No new package or model was installed in this investigation.

## Research references

- [Librosa recurrence matrix](https://librosa.org/doc/main/api/generated/librosa.segment.recurrence_matrix.html): structural repetition evidence.
- [Librosa segmentation source](https://github.com/librosa/librosa/blob/main/librosa/segment.py): segmentation and recurrence implementations; segmentation is not downbeat verification.
- [madmom downbeat processing](https://madmom.readthedocs.io/en/v0.16/modules/features/downbeats.html): a dedicated learned downbeat/beat-tracking approach for a possible comparison, not yet evaluated here.

## Files

- `reference-tracks.json`: bounded-region measurements, candidate positions and vocal observations.
- `baseline.json`: preliminary Xpander, My Love and Flat Beat comparison.
- `audit_cached_regions.py`: repeatable diagnostic using the installed existing detector; reads live cache without writing it.
- `listening-anchors.csv`: blank reference anchors to fill after listening.
- `audio/`: clean head/exit audition clips. Source coverage is in the table above. A clip clock starts at zero, so add the source-start offset for an outgoing clip.

## Owner listening anchors — 2 November 2026

All times below are approximate observations, not sample-accurate downbeat labels. Rozalla’s `0.22s` is interpreted as `0:22`.

| Track | Heard vocal start | Heard phrase change | Natural four-bar point | Nearest structural candidate to 22s |
|---|---|---|---|---|
| Gusto | Background vocal groove fades in ~7s | No clear section change | Release at end of fourth groove bar ~22s | 26.749s |
| Rozalla | ~6s | ~22s | — | 25.565s |
| Urban Cookie Collective | ~7s | ~22s | — | 22.396s |

The nearest-candidate comparison checks the full landmark list, not only the eight strongest shown in the original report. A nearest point far from 22s is a miss, not a suggested replacement for the owner’s anchor. Gusto is a repeating-vocal release example: ~22s ends the fourth bar of the background vocal groove, which fades in from ~7s. This is a release endpoint, not an arrangement-change onset. Do not require novelty at every valid phrase/counting boundary.

The vocal energy gate begins at 6.9s for Rozalla and 7.8s for Urban Cookie Collective, approximately 0.8–0.9s after the rounded listening observations. Do not treat those offsets as calibrated errors until exact pickup positions are checked. Gusto has detected activity only from 41.95s onward in the cached head, despite the owner hearing a background vocal groove fading in from ~7s. This reveals a missed soft/repeating vocal entrance in the existing energy gate; exact onset and acceptable release still require listening anchors.

Next diagnostic priority: distinguish arrangement-change evidence from the position within repeating bars/phrases. Use the two positive ~22s examples and the Gusto no-change counting anchor; keep vocal onset/tail accuracy as a separate check.

## Gusto clarification

The owner hears a repeating background vocal groove fading in from approximately 7s; approximately 22s marks the end of its fourth bar and a natural release point. The fade-in timestamp is not necessarily the first downbeat: at the measured ~126 BPM, four 4/4 bars span about 7.62 seconds. Do not derive a 15-second four-bar grid from the 7–22s observations. Obtain the actual groove-bar anchor before assigning bar numbers.

This adds a required distinction between phrase/section entrances, completed-cycle release endpoints and continued repeating background vocals. A sustained or repeating vocal detection need not prohibit release at an owner-confirmed completed musical cycle. Conversely, no detected vocal activity cannot establish that the region is instrumental: this reference contains a soft vocal layer the current gate misses. No thresholds or renderer behaviour have been changed.

## Back-projected intro timing prototype

A small source increment adds `grid_entries` separately from arrangement-change landmarks, plus an explicitly unverified backwards intro-grid projection in structural results (structure cache version 3). Sliding overlapping support fits merge into one entry; no artificial section starts are made at every sliding window. This exposes Rozalla's first supported grid around 22.8s even though the novelty detector has no earlier beat context. It does not claim this is the first audible percussion.

The projection uses the later fitted BPM and anchor to list earlier beat positions and possible four-beat bars, retaining any partial opening bar. Musical downbeat and tempo continuity remain unverified. A 2–10 kHz spectral-flux probe on the drums/other stems finds pre-drop activity but does not distinguish the compared quarter-beat phase shifts strongly enough to approve the grid. No thresholds were tuned to these three songs.

Rozalla's owner-preferred transition starts the incoming recording at source zero over outgoing drums and bass, then hands over rhythm near the incoming beat drop. This requires an incoming-vocal-led option; a late kick-grid cue must not skip the opening vocals. Gusto's owner confirms four instrumental bars before four bars of the repeating vocal groove; the exact source/downbeat anchors still need reconciliation with the detector's BPM rather than hard-coding a bar interpretation from rounded seconds.

`audio/rozalla-projected-grid.mp3` is a 32-second counting audition, with a tick at every projected beat and a louder tick every four. The later anchor is provisionally treated as beat one. No source audio is shifted, stretched or looped. The companion JSON gives candidate beat/bar times. This is a listening test, not an approved automated mix.

## Rozalla projected-grid listening confirmation

The owner confirmed the 32-second projected-grid audition as “spot on”: beat clicks follow the intro tambourine and bar accents land on beat one. For this exact recording, the later ~130 BPM grid and its backwards bar alignment are now human-validated. The marked four-bar boundaries are approximately 0.654, 8.039, 15.423 and 22.808 seconds. This validates timing through the quiet intro, not a general confidence threshold, every phrase boundary, vocal cut safety, or a completed mixed pair. Runtime fields remain conservative/unverified until an explicit reference-validation path exists; no production flags were changed.

## Urban Cookie Collective and Gusto listening confirmations

The owner confirmed both 32-second counting auditions as “spot on”, including the proposed Gusto release near 22.96s. All three reference openings now have human-validated beat/bar timing. Urban Cookie Collective is approximately 129.885 BPM, with four-bar boundaries at 0.238, 7.630, 15.021 and 22.412 seconds. Gusto is approximately 126.072 BPM, with four-bar boundaries at 0.120, 7.735, 15.349 and 22.964 seconds. Gusto's natural release at the last boundary is also owner-confirmed. Preserve the earlier groove-count description separately; do not rescale the confirmed quarter-note grid to fit approximate wording.

These are three positive examples, not a calibrated automatic acceptance rule. Next evaluate negative/ambiguous examples, tempo drift and competing grid phases before assigning machine confidence. Beat/bar validation does not by itself establish a safe vocal cut, every phrase boundary or a suitable mixed pair. Runtime flags remain conservative and live preview behaviour is unchanged.

## Afro-Left challenge recording

Owner nominated Leftfield — Afro-Left, Leftism, track ID `05ul3rSoyemxeaWWNIMdyo`, duration 454s. The current library BPM is 172.3. Independent bounded full-mix diagnostics compared 0–40s with 59–110s using the existing percussive Librosa timing-fit checks. None of the opening tempo hypotheses produced a supported 64-beat run. The post-entry region yielded two supported fits at approximately 130.008 and 129.995 BPM, RMS timing residuals approximately 7.10 and 7.38ms. This is evidence about those sampled regions, not a whole-track tempo or automatic pairing verdict.

The first audition exposed a phase error at the entry: its projected tick was at 59.091s, while the owner identified the first strong beat at 59.3s, a 208.6ms difference. Re-anchoring the same 130.008 BPM fit at 59.3s shifts the projected first bar to 0.227s and retains 32 complete intro bars. Four-bar boundaries are approximately 0.227, 7.611, 14.995, 22.379, 29.763, 37.148, 44.532, 51.916, 59.300s. The owner confirmed the corrected 75-second audition as “perfect”, validating this recording's projected beats and bar accents through the sparse intro. The audition is saved as `audio/afro-left-grid-anchored-59.3.mp3`.

This is a useful challenge to relying on a short opening's BPM estimate: a sparse introduction can produce a misleading tempo while a later sustained section yields a stable alternative. The owner confirms the track stays at a steady 130 BPM through its ending. Independent 51-second, 50-second and 64-second samples at 59–110s, 220–270s and 390–454s support local fits of 130.001, 130.029 and 130.000 BPM, with median fit errors of 7.24, 4.86 and 4.48ms. This supports tempo continuity at the sampled points. Librosa's independent beat tracker selects a different within-beat phase in each section (near half a beat early in the first two, about 62ms late in the ending), so its phase is ambiguous; this does not supersede the owner's listening-confirmed 59.3s anchored audition. Results and a repeatable probe are saved as `afro-left-local-consistency.json` and `probe_afro_left_local_consistency.py`. The owner-verified anchor and grid apply only to this recording; they do not calibrate automatic confidence. No stems, Sub/Beats entry, cached analysis or library changes were made.

## 808 State — Cübik beat-detection challenge

The library contains two 3:33 entries: `Cübik` on *808:88:98* (`0sejsWk6gftg89Oci3gbG3`) and `Cubik` on *Back to the Old Skool* (`7sNKyCpWgeIWZ4T28fxPb7`). Both currently report 161.5 BPM and confidence around 0.64, with 106 saved beats spanning only the first 40 seconds. Their opening beat offsets differ by about 93ms, so retain the exact version when comparing listening evidence.

A bounded full-mix check of the *808:88:98* entry found no supported 64-beat fit in 0–40s at the library's 161.5 BPM (or tested 130 / 80.75 BPM). In 40–80s and later the tempo seed moved to about 123 BPM. The 80–120s passage supports 124.48 BPM (27.23ms RMS timing error); 120–160s supports 123.12 BPM (33.62ms). In that second passage a separate 165.69 BPM fit also meets the timing threshold (10.86ms). No tested candidate formed a supported 64-beat window in the final 160–213s excerpt. This is a useful example of locally competing pulses and uneven evidence; none of the fits proves a downbeat or establishes a whole-track tempo.

External BPM listings vary from 121 to 124 and may refer to other edits/recordings: [SongBPM's Cübik listing](https://songbpm.com/@808-state/cubik-LFXgUTKk6w) gives 121, while [a Ninety album listing](https://musiciwant.com/artist/808-state/ninety/cubik-808-state) gives 124. Treat those as contextual only; the durations and versions do not fully match the two local entries.

Three short click auditions isolate the supported later candidates: 124.48 BPM at 80–114s, 123.12 BPM at 120–154s, and 165.69 BPM at 128–158s. Each accent assumes the local fit start is beat one; that bar phase is unverified. The owner reports MixMeister reads 124.3 BPM. Listening to the balanced auditions, the near-124 BPM clicks start close but drift; the owner would not attempt a beatmatched mix. Record this exact tested version as a negative reference for beatmatch suitability: regular transitions only. This supports a distinction between a plausible local BPM and a stable track-wide beat grid. The 166 BPM audition was presented, but the owner’s verdict applies to the recording’s beatmatch suitability rather than validating that alternate pulse. This is an evaluation label only; no library analysis, suitability flag, stems, cache or Sub/Beats entry changed.


## Independent Beat This! assessment — 3 November 2026

Primary sources reviewed: [official repository](https://github.com/CPJKU/beat_this), [paper](https://arxiv.org/html/2407.21658v1), and upstream inference/postprocessing code. Beat This predicts beat and downbeat timestamps from a full audio mix; the Python interface also exposes framewise logits. Long files are processed in approximately 30-second chunks, so a full-file invocation does not give the neural network whole-track context. It does not produce 4/8/16-bar phrase boundaries, vocal phrase completion, or pair suitability.

Proposed Sub/Beats role: independently compare upstream small0 and final0 on the exact reference recordings, retaining current Librosa feature extraction and local timing-fit validation. Use the learned downbeats as bar-origin evidence, derive local tempo from accepted beat timestamps, and evaluate arrangement changes/repeating cycles on those bars. Keep tempo, beat timing, bar alignment, phrase origin, and vocal-cut safety as separate verdicts. Validate complete candidate mixing windows; the paper reports lower continuity metrics despite high beat/downbeat F1. The paper also explicitly describes intentionally overconfident network outputs, so raw activation strength must not be presented as calibrated mix safety. Start with full mixes rather than existing isolated stems, to match the intended input. Project through quiet sections only as a labelled hypothesis checked against audible evidence; chunked inference cannot automatically transfer a 59-second drop's bar anchor all the way back through Afro-Left's opening.

Evaluation correction: the earlier Cübik auditions used 124.478 and 123.122 BPM, rather than the owner's MixMeister reading of 124.3. Some drift against those grids is expected even if the recording is steady. Preserve the owner's preference for regular transitions only, but do not treat those auditions as proof of intrinsic tempo drift or as a machine-certified negative reference. Reassess its timing with correctly anchored reference beats and any model output before drawing that conclusion. No Beat This model has been installed or run as part of this research.
