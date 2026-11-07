# Variable-length natural finishes — 7 November 2026

The owner supplied eight MixMeister references for tracks that still had no
saved outgoing cue. Their suggested starts fall roughly 14–24 bars before the
terminal grid point. Several endings fade; others keep a steady beat almost to
the end. A fixed 8/16-bar phrase ending and a second independent beat tracker
were each rejecting useful cases.

Algorithm 13 adds a fallback only when the existing cue methods return no
outgoing cue. It fits the last supported Beat This! grid passage at 14, 16, 20
and 24 bars, then offers up to four start markers on observed beat events. Each
marker's handover is the complete recording end, so the preview matches the
incoming cue to the time remaining and retains the outgoing track through its
natural finish. These are audition candidates, not proof that a track is a good
pair. Existing cues and incoming cues are left alone.

The offline comparison covers 106 saved cue records. In that snapshot, 36 had
no outgoing cue and 70 already had one; no model inference or stem separation
was run. The fallback leaves existing outgoing cues and all incoming cues
alone. The closest candidate to each of the owner's eight references is:

| Track | Reference | Candidate | Difference |
| --- | ---: | ---: | ---: |
| Sash! — Encore une fois (Future Breeze edit) | 185s | 185.02s | 0.02s |
| Bicep — Glue | 236s | 236.38s | 0.38s |
| The Chemical Brothers — Hey Boy Hey Girl | 245s | 243.68s | 1.32s |
| Junior Jack — Stupidisco (radio edit) | 276s | 276.56s | 0.56s |
| N-Joi — Anthem | 167s | 166.16s | 0.84s |
| Fatboy Slim — Praise You (radio edit) | 192s | 192.58s | 0.58s |
| Ninetoes — Finder (radio edit) | 167s | 165.72s | 1.28s |
| Orbital — Chime (edit) | 158s | 156.82s | 1.18s |

Lonyo — Summer of Love remains a known difficult case because its saved
terminal grid does not support a continuous closing passage. Focused cue tests
cover the natural-finish preview path. User listening is still needed after the
station rebuild, especially to choose among alternatives where the best
candidate is not the default 16-bar estimate.
