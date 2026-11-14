# Head and tail confidence changes — 9 November 2026

This is the next Sub/Beats audition experiment. It estimates activity and uncertainty in the selected incoming opening and outgoing ending, allowing short or uncertain vocal overlaps. Library musical cues, standard vocal ranges and the listener lyric cache remain separate.

## Head

Report the first possible vocal, total detected activity in the selected opening, and whether activity is likely in its first four beats at the selected tempo. A reviewed first-lyric onset can remove earlier non-lyrical/false activity from this assessment. An automatic lyric timestamp does not silently erase earlier contradictory stem activity; that disagreement lowers confidence instead.

## Tail

Report the last possible vocal, total detected activity in the selected ending, and whether activity continues into the final four beats. The last timed lyric line anchors a possible phrase. Only measured stem activity estimates its release/end; the lyric line's start never becomes its end. Later unexplained stem activity stays in the estimate and lowers confidence. Unseparated original-mix lead-in remains uncertain rather than being treated as confirmed singing.

The four-beat windows are estimates from the selected tempo, not independently confirmed musical bar boundaries. Activity is the union of the existing padded stem-energy passages; it does not prove words. Silero is not promoted to a lyric detector.

## Version selection

Preparation and the explicit batch scan share one lookup: Navidrome timed lyrics first. Otherwise it compares LRCLIB search candidates within two seconds of the recording length, favouring full title/edit and album agreement, then nearest duration. It retains selected record metadata, the candidate count and separate first/last-line timing spreads. Plausible versions differing by over two seconds lower confidence for the corresponding head or tail. Duplicate lyric records do not earn extra confidence merely by agreeing.

If candidates cannot be obtained, cached LRCLIB timing can still be used with low confidence and an explanation that its version metadata could not be verified. Metadata alone never earns high confidence. This experiment does not replace LRCLIB's cached selection in the listener UI.

The refreshed 109-track scan returned 56 timed lyric results, 21 untimed, 25 without lyrics and seven instrumental-marker results. Six tracks have competing opening timings more than two seconds apart; six have competing final-line starts more than two seconds apart. Show Me Love now selects LRCLIB record 33069994 at 9.13s, close to the owner's 9.0s correction.

## Confidence and pair policy

| Confidence | Meaning |
|---|---|
| High | The relevant boundary was reviewed against this prepared recording, and the selected passage has supporting coverage/activity. Activity duration remains estimated. |
| Medium | Lyric/version timing and stem activity support each other, or the library instrumental flag and quiet measured stem agree. |
| Low | Energy alone, a version disagreement, contradictory evidence, or incomplete/unseparated coverage. |
| Unknown | No usable stem coverage. |

Each role gets its own confidence and reason. Overall pair confidence is the lower of the two role levels. No numerical probability or measured accuracy is implied.

Overlap is calculated on the actual transition clock after tempo conversion, merging intersecting intervals so they are not counted twice. Both total overlap and the longest continuous overlap are returned.

- Up to two seconds of total detected overlap is allowed, including reviewed boundaries. This is the initial audition allowance, not a validated universal limit.
- Longer overlap with high confidence makes automatic planning prefer another cue combination or a supported drum loop.
- Longer medium/low/unknown overlap remains available, with a ranking penalty rather than a mandatory operator review.
- A manually selected mix can still be auditioned with a reported high-confidence conflict. No vocal ducking, muting or trimming is added to resolve it.

These are activity intersections, not a perceptual measure of competing lyrics: detection mistakes, quiet vocals, wordless grooves and the mixer envelopes can make the number differ from the audible clash. Listen to the rendered mix to judge that relationship.

## Evidence now available

| Role | High | Medium | Low | Unknown |
|---|---:|---:|---:|---:|
| Head | 16 | 22 | 70 | 1 |
| Tail | 0 | 22 | 86 | 1 |

The 16 reviewed heads preserve the owner's supplied choices/corrections. They are bound to the current prepared recording key and survive subsequent evidence refreshes for that key. No exact tail-end review has yet been supplied, so there are no high-confidence overall pairings to label honestly. Exact tail reviews can be added later when a specific transition needs investigation; they are not required to use the permissive policy.

The saved-data pairing audit evaluated 7,873 feasible suggestions using each outgoing track's first saved cue and the best incoming cue per track. Of these, 499 were medium confidence and 7,374 low. These counts describe evidence availability, not listening accuracy or all possible cue combinations.

## Pairing auditions — all six accepted, 9 November 2026

The owner reported: “All 6 audition pairs sound fine.” Record all six transitions below as acceptable for that vocal-overlap exercise. The owner later clarified that this feedback did not establish harmonic suitability. A subsequent, separate [harmonic A/B review](2026-11-09-harmonic-auditions.md) records five preferences for the shorter handover and one tie. The displayed overlap numbers remain the original saved-evidence estimates; no measured audible crossover durations or exact tail endpoints were supplied with this feedback.

Choose the markers below and use **Play selected mix** to reproduce the accepted examples; **Find Suitable Transition** can select different markers to reduce overlap. Outgoing markers are seconds before the recording end; incoming markers are the arrival time from the recording start.

| Case | Outgoing → incoming | Tail / head confidence | Estimated overlap | Outgoing marker | Incoming arrival |
|---|---|---|---:|---:|---:|
| medium confidence, short overlap | Sash! — Encore une fois (Future Breeze edit) → Steve Angello & Laidback Luke feat. Robin S — Show Me Love | medium / high | 1.43s | -33.86s | 15.17s |
| medium confidence, longer overlap | Solardo x Eli Brown — XTC (radio edit) → Chris Malinchak — So Good to Me (radio edit) | medium / high | 5.01s | -36.59s | 15.89s |
| reviewed head with automatic tail | Urban Hype — A Trip to Trumpton → Lonyo — Summer of Love (radio edit) | medium / high | 1.43s | -32.06s | 16.43s |
| low confidence, short overlap | Urban Cookie Collective — The Key, the Secret → Faithless — Insomnia (radio edit) | low / low | 1.50s | -37.54s | 30.56s |
| low confidence, longer overlap | Rozalla — Everybody’s Free (To Feel Good) → De’Lacy — Hideaway (Deep Dish radio edit) | medium / low | 5.00s | -43.17s | 16.98s |
| original Agnelli & Nelson comparison | Agnelli & Nelson — El Nino → Agnelli & Nelson — Everyday | low / low | 16.52s | -34.34s | 14.31s |

The El Nino → Everyday case deliberately retains the known questionable Everyday activity estimate. Its 16.52s detection intersection is **not** a claim of 16.52s of audible lyric crossover; the low confidence and permission to audition are the intended behaviour.

The machine-readable shortlist is in `2026-11-09-head-tail-confidence-pairings.json`; the reviewed head inputs are in `2026-11-09-reviewed-head-onsets.json`.

This listening result supports retaining the permissive overlap policy: short and uncertain overlaps can produce acceptable transitions, including the longer low-confidence activity estimate in El Nino → Everyday. Keep confidence available for ranking and explanation without requiring routine operator reviews. No further vocal-overlap review was requested. The subsequent harmonic judgements are recorded separately in the linked A/B report.

Acceptance within the vocal-overlap exercise does not supply a new exact head/tail timing measurement, so this feedback does not promote any tail boundary or overall timing confidence to high, validate the numerical overlap estimates, or establish a universal tolerance for longer actual lyric crossover. No threshold or audio handling change follows from these six passes.

## Station preparation

The confidence change is maintained on `feat/subbeats-draft` in `/home/jaz666/codex/subbeats-draft-pr`, with the station candidate source in `/home/jaz666/Docker/subwave`. The research checkout retains its separate cue/Silero experiments. The isolated batch scan saved `state/subbeats/lyric-evidence.json`, including the 16 reviewed heads. It did not rerun Demucs or change main-library cues. Codex did not rebuild or restart services as part of implementation; the owner runs station rebuilds. The owner subsequently reported the six successful auditions above.

Rebuild the controller, analyzer and web together, preserving the station's GPU and Discord overlays:

```sh
cd /home/jaz666/Docker/subwave
docker compose --parallel 1 \
  -f docker-compose.yml \
  -f docker-compose.analyzer-gpu.yml \
  -f docker-compose.discord.yml \
  up -d --no-deps --build controller analyzer web
```

The preview shows head confidence, tail confidence, reasons, activity duration and estimated overlap after it renders. Existing saved stems/cues are reused. The preview cache fingerprint includes lyric evidence and uses version 15, so changed evidence regenerates the audition without requiring track preparation.

New successful preparations (including source replacements and coverage upgrades) now refresh their lyric evidence automatically before reporting completion. The shared lookup honours the existing LRCLIB setting. Lookup or evidence-save failure leaves the prepared stems usable, with source-bound evidence attached only when it matches the current recording. Matching and playback still perform no network lookup. Existing prepared tracks need no rerun for this addition.

Evidence saves read the existing file strictly before merging. An unreadable/malformed file is never replaced, and reviewed head/tail corrections survive a refresh for the same recording key. A short exclusive `.lyric-evidence.lock` directory prevents concurrent preparation/scan saves from losing each other's updates. A failed save releases its lock; a killed process may leave it for inspection. After confirming no writer is running, remove that empty lock directory and retry the explicit scan. Preview reads remain permissive if evidence is unavailable.

For a later explicit lyric-evidence refresh:

```sh
docker compose exec -T controller npm run --silent lyrics:boundaries -- --prepared --save
```

The batch scan now waits for each candidate lookup and prints progress to stderr, so it no longer publishes a pending snapshot as its final report. Failed/unavailable lookups remain uncertain rather than stopping the scan or pairing. Updating a prepared recording's key invalidates the old attached evidence; its next successful preparation now attempts the refresh automatically.

## Checks completed

- 59 controller Sub/Beats tests passed in the station checkout, including source-bound review persistence, version ranking, confidence policy and rejection of client-forged review evidence.
- Analyzer Python suites passed in both checkouts; the station's cue suite covers 38 cases, including earlier drum-loop selection and preview remeasurement. Six focused confidence cases also cover short overlap, longer uncertain overlap, missing coverage, tempo conversion and interval merging.
- Controller and web lint/type checks passed; schema mirrors were generated from each checkout's own schema version.
- The admin query audit and its nine self-tests passed. The audit registry was updated to recognise the already-existing original-audio dialog as a one-shot audition, matching the existing cue audition allowance.
- UI mechanical checks and Git whitespace checks passed.

The owner subsequently confirmed all six audition pairs as acceptable. Codex has not independently performed a listening comparison or browser walkthrough.

## Completion follow-up — 9 November 2026

The six accepted listening results and the confidence implementation are consolidated into the existing draft PR development checkout, excluding the research checkout's pending cue/Silero work and the station's unrelated prompt/skill edits. Automatic preparation refresh and strict evidence-write protection are included. The runtime controller/analyzer matched the earlier confidence source when checked; these final preparation/storage changes require an owner-run controller rebuild. No service was restarted by Codex.

Verification for this follow-up: source review, schema regeneration, controller TypeScript check and focused lint of the preparation/refresh files; no additional tests or listening auditions were run for this follow-up. The earlier test results above apply to the earlier confidence candidate.
