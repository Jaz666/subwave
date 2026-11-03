# Opening phrase evidence — 3 November 2026

The owner accepted the Urban Cookie Collective `final0` and Gusto `small0`
32-second beat/bar auditions. This bounded follow-up reuses those exact grids
and original sources. It produces structural **candidates**, not approved vocal
cuts or track-pair transitions. No Beat This! inference was repeated.

## Result

| Recording | Machine candidate | Existing owner reference | Evidence |
| --- | ---: | ---: | --- |
| Urban Cookie Collective | 22.380s | 22.412s phrase change | Strong bass/texture change; strongest repetition-break descriptor in this opening. |
| Gusto | 22.940s | 22.964s completed groove release | Weak local change; second strongest repetition-break descriptor, following the earlier 7.720s change. |

Urban's candidate is 32ms before its reference, Gusto's 24ms before its
reference. These inherit the accepted model grid's timing offsets; the analysis
does not move timestamps to match the annotations. No production cue was set.

For auditions, the two highest positive local peaks in the repetition-break
descriptor give **7.600s / 22.380s for Urban** and **7.720s / 22.940s for Gusto**.
The earlier events lie near the owner-described early vocal/groove entrances,
but these descriptors do not identify the first sung sound. In particular,
Gusto's fading background vocal was reported around 7s; 7.72s is not permission
to skip its pickup. A change/arrival event is also distinct from a track's
incoming entry cue, which may need to precede it substantially.

## Small isolated method

[Probe script](probe_phrase_bars.py), [complete descriptors](phrase-bar-results.json).
Outputs are local to
`/home/jaz666/codex/subbeats-beat-this-20261103/phrase-bars/`.
A separate `phrase-venv` contains Librosa 0.11.0, NumPy 2.5.4 and SciPy 1.18.1;
the earlier Beat This! environment was left intact.

1. Verify each original source SHA-256 against the model-comparison record.
   Decode only source 0–32s to mono 11.025kHz for features.
2. Reuse `subbeats_structure.extract` to measure four energy bands, normalised
   mel spectra and chroma over each predicted beat. Reuse `landmarks` as the
   existing arrangement-change comparator. Importing those functions does not
   invoke preparation/cache publication.
3. Group measured beats between successive accepted downbeats, requiring four
   beats per complete bar. There are 17 complete Urban bars and 16 Gusto bars.
   Exclude the leading/trailing partial material from bar-block comparisons;
   retain it in the untrimmed auditions.
4. Describe every interior bar boundary using 1/2/4-bar before/after context:
   changes in energy, bass, spectral texture and harmony. The existing heuristic
   scales are reused; their scores are not calibrated probabilities.
5. Compare ordered blocks of 1/2/4/8 bars. The spectral descriptor preserves each
   beat's position, rather than reducing a whole block to one average. Record
   the distance between two preceding blocks, and, where coverage permits,
   between the most recent preceding block and the following block. Also retain
   harmonic/energy comparisons as separate diagnostics.
6. The repetition-break descriptor is following spectral distance minus
   preceding distance. Its maximum across supported block lengths describes
   where a previously repeating texture changes. Missing context stays absent;
   the eight-bar comparison cannot be fully supported in these short windows.
   Select at most two positive local maxima for audition, without adjusting
   them to four/eight-bar phrase spacing. This inspection limit is not a claim
   that a track contains two phrases.

Owner annotations are consulted only **after** computing the descriptors for
all boundaries, to assess their positions and ranks. No thresholds were tuned
to hit the references. This experiment uses generic block distances, not code
from automatic-cuepoints or a reproduction of the CBM paper. It is a small
baseline for deciding whether more elaborate segmentation is justified.

## What the measurements support

**Urban:** local novelty alone ranks 22.38s second, behind a 2.06s low-band
change in the sparse opening. At 22.38s, the four-bar preceding repetition
distance is .361, whereas the following block distance is 1.481: the repetition
break is 1.120, the largest in the opening. The one-bar bass change is +12.90dB
and the texture distance is 1.539. Arrangement change and repetition break
therefore both support the region the owner identified. The neighboring
20.54s and 24.24s bars also react to overlapping long contexts; they are not
three separately established musical phrases.

**Gusto:** the original beat-level arrangement detector returns no landmarks
in this window. All bar novelty strengths remain below its heuristic scale of
1; the 22.94s reference-nearest boundary ranks fifth by local novelty. By
repetition break it ranks second, behind 7.72s. At 22.94s, two-bar spectral
distance grows from .065 preceding to .143 following, and four-bar distance
from .125 to .204. This is useful additional evidence for retaining a candidate
that a strong-novelty gate would discard, but it is modest and uncalibrated.

Importantly, Gusto's two-bar harmonic distance preceding the release is .028,
compared with .144 over four bars and .524 over one bar. Its strongest repeating
fingerprint here is therefore two bars, not evidence of a uniquely four-bar
vocal phrase. Retain the owner's completed-groove description separately from
these feature periods. Do not rescale BPM or promote every repeated-unit ending
to a complete vocal phrase or loop seam.

## Auditions and remaining gate

`urban-cookie-collective-candidates.mp3` and `gusto-candidates.mp3` each retain
the accepted full 32-second grid audition and overlay a brief lower-pitched
chord at the two selected candidate positions. Ordinary/high clicks are still
model beats/downbeats; the chord means **structural candidate**, not verified
phrase or safe cut. Chords are 100ms Hann-windowed 600/900/1200Hz tones, .18
amplitude each, followed by common peak limiting to .95. The source audition's
quiet music/loud-click balance is retained. No looping, stretching, trimming
or timestamp repair was applied. The new marked auditions have not yet received
owner feedback.

Next: use owner feedback on the marked candidates to retain or reject their
musical roles. Before applying a cue or loop automatically, establish complete
vocal pickups/endings and tail clearance separately. If a full-mix repeating
texture cannot establish those edges, leave them unknown and use normal
transitions. No new renderer, picker, station reanalysis or stem preparation
is justified by these two examples alone.

Validation: the probe's small built-in numerical checks verify zero novelty
for constant material, correct ordering sensitivity for repeated blocks and a
known synthetic texture boundary. Both source hashes and all complete four-beat
bar checks pass. JSON is finite/valid; both marked auditions decode to 32s.
Only isolated research scripts/docs/evidence changed; no production tests were
required, and station services, library metadata and prepared caches are unchanged.
