# Outgoing closing-passage comparison — 3 November 2026

Scope: outgoing selection only. Owner relaxed the approximate final-quarter
restriction and approved using 8/16-bar guidance with track tests. Incoming
matching, stem rendering and broadcast behaviour are outside this change.

## Method

The offline probe verifies each original source SHA-256 against the saved
Beat This! comparison, decodes its full audio, and extracts existing energy,
spectrum and chroma features over the second half plus 64 seconds of preceding
context. It runs algorithm 3 against saved official small0/final0 beat/downbeat
predictions. No new inference, separation or station preparation is performed.
It asserts at most eight cues within the search bounds and exactly 8/16 complete
observed bars for each labelled passage. No owner timestamp enters the selector.

[Complete results](outgoing-phrase-results.json) include source hashes, duration,
model and every selected candidate. Reproduction inputs, feature arrays and
`probe-closing-phrases.py` remain outside Git in
`/home/jaz666/codex/subbeats-beat-this-20261103/`; run the probe with that
workspace's `phrase-venv/bin/python`. It imports the development analyser.

## Results

| Track | First closing candidate | Observed bars | Later closing change | Outcome across models |
| --- | --- | --- | --- | --- |
| Rozalla | 163.040s (2:43.04) | 16 | 192.560s | Both agree; 177.820s supplies an 8-bar alternative; 188.900s fade separate |
| Urban Cookie Collective | 192.400s | 8 | 207.180s | Both agree; a 16-bar alternative begins 179.460s |
| Afro-Left | 362.100s / 362.080s | 16 | 391.640s / 391.620s | Both also retain an 8-bar alternative at 376.860s |
| Gusto | — | — | — | Ordinary structural alternatives; no forced phrase label |
| Cubik | — | — | — | Ordinary structural alternatives; model rankings differ |

Rozalla's first cue is close to the owner's approximate 2:41 reference. This is
not owner acceptance or exact ground truth. In particular, the later closing
change is **not claimed to be the recording's musical endpoint**. Full-mix
listening still establishes whether vocals/grooves complete naturally. Sources
with missing beats cannot receive a phrase count across the gap. A later louder
section disqualifies an apparent closing passage in focused synthetic checks.

## Verification and deployment

Focused Python, controller, web and browser checks are recorded in the handover.
The owner runs Docker rebuilds and listening. Rebuild analyzer, controller and
web together, then explicitly recheck selected tracks with Beat This!; existing
stem separation is reused. No library-wide reanalysis is requested.
