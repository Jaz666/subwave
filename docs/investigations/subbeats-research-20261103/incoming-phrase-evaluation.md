# Incoming opening-passage comparison — 3 November 2026

The owner reports the outgoing choices seem satisfactory on the tracks previewed
and authorizes applying the same treatment to incoming tracks. This accepts the
next stage, not every outgoing candidate or any new incoming cue.

## Method and scope

Use the same five source/hash-verified recordings and saved official small0/final0
predictions. Extract existing energy/spectrum/chroma over the first 68 seconds,
matching prepared head coverage. No new neural inference or stem separation.
The offline probe asserts up to eight candidates and exact observed 8/16-bar
counts for every phrase-labelled arrival. Every intervening bar must have four
continuous beats. Two boundary types may anchor the passage: the first complete
measured bar or an existing structural candidate. The arrival itself must have
independent structural evidence and must not reduce median energy by over 1 dB
relative to the passage. Flat or broken grids receive no fabricated labels.

Three strongest original, spaced change candidates are protected before filling
the menu with phrase hypotheses. This prevents conventional-length suggestions
from crowding out strong unconstrained arrivals. No track IDs or owner timestamps
appear in selection. These are hypotheses, not verified phrase origins, vocal
endpoints or vocal-free openings.

[Complete results](incoming-phrase-results.json) preserve source hashes, model,
coverage and cue metadata. Reproduction probe `probe-opening-phrases.py` and
inputs remain in `/home/jaz666/codex/subbeats-beat-this-20261103/`, using its
`phrase-venv/bin/python` and the development scripts.

## Findings

| Recording | Opening evidence across models |
| --- | --- |
| Rozalla | 8 bars from 0.500s to 15.440s; 16 bars from 0.500s to 30.160s remain among alternatives |
| Urban Cookie Collective | 8 bars 0.200s–15.000s; 16 bars 0.200s–29.780s; accepted final0 arrival 22.380s retained, with 8 bars from 7.600s |
| Gusto | Both retain 8 bars to 22.940s from around 7.7s; small0 additionally retains 16 bars 0.060s–30.560s |
| Afro-Left | Ordinary candidates only; no invented opening phrase across its unsupported grid |
| Cubik | 8 bars 25.300s–40.800s; the preceding source audio must still be heard and retained |

All ten outgoing model/track candidate lists exactly match saved algorithm-3
results when evaluated with the new code. The accepted Urban final0 22.380s and
Gusto small0 22.940s arrivals remain available. This is computed evidence, not
new owner listening acceptance.

## Operator interpretation

The browser auditions source zero through the chosen arrival and two bars beyond,
at original speed, with all voices/background grooves. It does not trim to the
phrase anchor. With an outgoing closing passage selected, choices are ordered by
complete opening duration after tempo adjustment, within the existing 8% tempo
limit. Displayed source indices remain unchanged. The comparison is duration
only: the current pair renderer still aligns rhythm handovers and does not yet
place the opening against the full outgoing closing passage. Extending saved
ending coverage and changing pair placement require a separate rendering step
after these incoming listening choices have been accepted.
