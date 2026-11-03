# Vocal/groove edge inspection — 3 November 2026

The accepted opening structural events remain Urban 7.600/22.380s and Gusto
7.720/22.940s. This follow-up checks what the **existing cached stems** can say
about cutting at those events. They do not become safe cuts simply because
their musical positions passed listening.

## Owner clarification: Gusto's two vocal roles

The owner clarified during this inspection that the opening is a repeating
**background-vocal groove**; the closest thing to actual vocals starts around
54s. Keep both observations: background vocal texture around 7s, and a distinct
later vocal passage around 54s. For the opening, establish complete groove
cycles and their tails; do not require a foreground sung-phrase interpretation
of every cycle. For later vocal material, retain the separate requirement to
preserve complete vocal beginnings/endings. The 54s estimate is not an exact
first phoneme, safe cue or new bar/phrase anchor.

## Exact-source reuse

The Urban and Gusto managed head stems cover source 0–68s. Their manifests'
source SHA-256 hashes match the exact originals used for the model and bar
experiments. Two head-vocal files, two manifests and Gusto's head-other file
were copied into the isolated research directory through Docker's file-copy
interface, since the host bundle directories are not readable by the research
user. This read existing files; no rebuilds, restarts, separation, station
preparation or reanalysis jobs were run. Live files and permissions were unchanged.

All three FLAC byte counts/hashes were checked against their manifests. The
recorded shared storage gains (.936283 Urban / .891480 Gusto) were undone before
measuring amplitudes. Both stem source positions and decoded sample counts were
verified. Separation provenance is `htdemucs`, Demucs 4.0.1, one shift, overlap
.25; this is cached evidence, not a newly run or independently validated model.

[Probe](probe_vocal_edges.py), [full measurements](vocal-edge-results.json).
Local copies/outputs are under
`/home/jaz666/codex/subbeats-beat-this-20261103/vocal-edges/`.
The existing phrase-venv suffices; no new packages were installed.

## What the gate measures

The probe reuses `analyze_worker.vocal_ranges_from_rms` at 50ms resolution. Its
reference is the full 68-second head region, not just a quiet opening. Mix RMS
comes from the original source, whereas the old saved Sub/Beats vocal map used
the sum of separated stems; small output differences are therefore possible.
The nominal threshold is the greater of .15 times the vocal-stem 90th-percentile
RMS and .06 times the mix 90th-percentile RMS. Two diagnostic reductions, .2 and
.05 of those thresholds, inspect sensitivity. They are not proposed settings.
Merging/breath handling and the 300ms minimum range remain the existing helper's.

These are energy ranges, not recognised words, human-vocal certainty or proof
of a completed phrase. No range means no detection, not instrumental material.

## Urban: preserve the tail across the structural change

| Gate | Opening detected ranges | What it says about 22.380s |
| --- | --- | --- |
| Nominal, -30.07dBFS | 7.80–16.55s; 17.05–22.40s | Detected activity reaches across the boundary. |
| .2 scale, -44.05dBFS | 7.75–23.05s | Lower-level stem sound continues after the change. |
| .05 scale, -56.09dBFS | 7.75–23.20s; 29.30–30.00s | Still more low-level sound; a later detection also appears. |

The normal gate begins after the 7.600s musical event. That is consistent with
the event preceding the measured onset, but does not locate a first phoneme.
At the later event, source 21.88–22.38s has vocal-stem RMS -13.17dBFS;
22.38–22.88s is -43.11dBFS, 22.88–23.38s -49.91dBFS and 23.38–24.38s -66.48dBFS.
This supports a strong vocal-stem level drop with a subsequent low-level tail.
Only listening can distinguish the word ending, reverb and separation bleed.

Keep 22.380s as the accepted musical change/rhythm-handover candidate. **Do not
hard-cut the vocal stem at that point based on the structural label.** Preserve
the vocal through the tail when testing a transition. Neither 23.20s nor its
padding is automatically approved as a cut; a lower threshold is not a tail
completeness certificate. The earlier saved conservative passage ended at
23.25s, independently illustrating the same structural/vocal-edge distinction.

## Gusto: no detected foreground voice is not a loop-safe groove

There are **no opening 0–32s vocal-stem detections** at any of the three
thresholds. Thresholds are -33.55, -47.53 and -59.57dBFS respectively. The first
nominal detected range begins at 41.95s; even this must not be treated as the
first actual vocal passage, which the owner places around 54s.

At the opening markers, half-second vocal-stem RMS is approximately -73dBFS.
Normalising source 4–28s to a .7 peak would require about 118× gain (+41.5dB),
emphasising separation residue. That file was generated as a diagnostic but is
not useful evidence that the background-vocal groove is absent from the song.
Dropping the energy gate alone does not solve source allocation or semantics.

Gusto's `other` stem was copied and checked as the next place to inspect the
owner-known background sample. A marked `other`-stem audition is provided;
the owner subsequently confirmed the background-vocal groove is down at the
bass end in this `other` stem, with the first beat sounding like a "whomp".
This is owner listening evidence of allocation and audible beat character,
not a machine vocal classification. The owner did not supply an exact source
timestamp for the whomp, so none is inferred. It is not an isolated vocal.
No absence claim is made
about the drums/bass stems or reconstruction residual, which were not copied.

For early Gusto, retain the accepted completed-groove event at 22.940s. A future
loop/cut must preserve the whole repeating background-vocal cycle and its edge
decay, regardless of which stem carries it. The existing vocal gate cannot
certify that. Assess later ~54s vocal phrase boundaries separately when that
region becomes relevant; do not extend the opening's bar/phrase approval to it.

## Focused auditions and next step

Two recommended 24-second auditions cover original source **4–28s**:

- `urban-vocal-boundaries.mp3`: the cached vocal stem, level normalised; chimes
  at clip 3.60/18.38s correspond to source 7.600/22.380s. Listen for a word ending
  versus the tail at the second marker.
- `gusto-other-boundaries.mp3`: the cached `other` stem, level normalised;
  chimes at clip 3.72/18.94s correspond to source 7.720/22.940s. Listen for the
  background-vocal groove and whether its cycle/decay is complete at the marker.

The original stem signal is preserved continuously; there is no simulated cut,
gate, noise removal, looping or stretching. A 100ms lower chord marks each
source event. Level normalisation is for listening, not evidence about the
original stem balance. The chime/normalisation can obscure very faint details;
unmarked source copies remain available if needed. The owner has confirmed
Gusto's low background groove is in `other`. Urban's exact word-ending/tail
relationship and Gusto's decay across the later marker remain unconfirmed.

Next: establish Urban's word-ending/tail relationship and Gusto's groove decay
across the later marker. Keep the structural
events separate from vocal-stem cut/fade endpoints and background-groove loop
boundaries. No cue planner or renderer change is justified until these roles
and edge requirements are clear. Pair suitability also remains untested.

Validation: source/stem hashes and sample coverage checks pass; the small RMS
and range-intersection checks pass; all JSON is finite/valid; the three generated
diagnostic files each decode to 24s (two are recommended above). No production
tests were required and no station, library or cache writes were made.

For upstream #2248, the transferable observation is that better beat/downbeat
grids do not establish vocal-tail clearance or sampled-groove allocation.
These stem findings concern the cached htdemucs output, not an ONNX Beat This!
failure or validation of the draft Stem Blend integration. No comment was posted.
