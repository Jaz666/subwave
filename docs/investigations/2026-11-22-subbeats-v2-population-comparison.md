# Sub/Beats V2 population comparison — 22 November 2026

Population run `19562385-c3f5-4622-9782-a3e3ff2eca6b` (algorithm version 3) is **complete**. The run contains the full V1 snapshot and V2 results for its 2,983 baseline recordings. The CSV is a derived 5,966-row role-level export; the source run remains unchanged.

| Run status | Count |
|---|---:|
| Complete | 2979 |
| Failed | 4 |
| Queued or running | 0 |

## Primary intended-use Compilations cohort

The owner clarified that the 2,983 V1-supported recordings were largely
admitted by matching station play history to a broad Sub/Beats eligibility
filter; many have never been tested on air. The owner confirmed that tracks
from these Navidrome compilations are the kind of sustained-beat dance material
Sub/Beats is targeting first. Treat the full-population parity counts below as
exploratory coverage, not the primary quality gate. First review tracks from
the five named **Compilations** folders.

This cohort is matched by Navidrome media-file ID from the exact Compilations
folder path, then joined to the saved V1 queue and V2 run. Album tags alone are
not reliable for this join: the 900+ House Classics files carry the original
release album in their tags. The current algorithm-3 run already covers 1,237
V1-prepared tracks from these folders: 1,236 completed and one whole-job
failure. Across completed, V1-supported roles in this set, all incoming roles
were retained; 12 outgoing roles returned no cue. All 12 lost outgoing V1
roles used the estimated-phrase-grid evidence path.

| Navidrome Compilations folder | Files | V1 prepared / V2 complete | Incoming V1-supported → retained | Outgoing V1-supported → retained (lost) |
|---|---:|---:|---:|---:|
| 30 Years - Three Decades of Dance (2021) | 60 | 59 / 58; 1 V2 job failed | 58 → 57; 1 failed job | 58 → 57; 1 failed job |
| 90s Dance Anthems | 58 | 58 / 58 | 57 → 57 | 57 → 56 (1 lost) |
| 100 Hits - Club Anthems (2013) | 100 | 99 / 99; 1 unmeasurable | 98 → 98 | 98 → 97 (1 lost) |
| 100 Hits - Dance Anthems (2008) | 100 | 85 / 85; 3 queued, 12 not in V1 queue | 84 → 84 | 84 → 84 (plus 1 V2 gain) |
| 900+ House Classics | 941 | 936 / 936; 3 failed and 2 unmeasurable in V1 | 926 → 926 | 870 → 860 (10 lost) |

The 12 outgoing losses to review are **Slo Moshun — “Bells of n Y (House 2
House MIX)”** (V1 cue 93.91s), **Marshall Jefferson — “Move Your Body”**
(211.10s), and these ten from 900+ House Classics: Tenth Chapter — “Wired
(Stonk Mix)” (567.86s); Urban Hype — “Teknologi (Ambient House mix)” (378.82s);
Phil Jubb — “Remember Me” (388.88s); Mimmo Mix — “All Your Love” (287.26s);
Movin’ Melodies — “Indica (original mix)” (316.94s); The Fog — “Been a Long
Time (original 12″ mix)” (451.07s); Floor Federation — “Love Resurrection (Dub
Mix)” (424.39s); Paradox — “Indica” (343.83s); Greed — “Pump Up the Volume
(original DMC mix)” (396.37s); and Trotters Independent Traders — “Power Of
Love” (321.35s). Slo Moshun's V1 cue has already been judged musically wrong;
the other eleven have since received owner listening review, recorded below.
The 100 Hits - Dance Anthems V2 gain is
S’Express — “Theme From S‐Express” (196.65s).

This is the primary intended-use comparison cohort. V1 role support is still
not equivalent to approval of each cue, so use the losses and gains to
prioritize audio review.
The full Navidrome-ID membership and role-level V1/V2 fields are in the
adjacent `2026-11-22-subbeats-compilations-cohort.csv`.

### Local algorithm-4 replay of compilation tail losses

The 12 outgoing losses above were replayed offline using their original
Navidrome files and saved source-matched V2 grids. The local algorithm-4
candidate-union change returned no outgoing cue for all 12, including the
already-reviewed Slo Moshun case. It therefore does not resolve these
compilation losses; no broader algorithm-4 batch is justified by this test.
This replay was local and read-only. It did not touch the station, its V1
queue, or PR #10. The subsequent owner listening review found that one of the
remaining V1 cues (The Fog) has no obvious beat-matched outro; seven other
existing cue positions were suitable as auditioned; and three nearby
alternatives were preferred (Mimmo Mix, Floor Federation and Greed). This
points to a focused cue-location/grid replay, not a broader algorithm-4 run.

## Role comparison

### Head / incoming
V1 supported 2616/2,983. Retained 2591, gained 317, V1-supported but V2 returned no cue 18, neither supported 49, role-analysis failure 4; 4 whole jobs failed and remain unresolved. V2 completed-job role statuses: cue-ready 2908, no-cue 67, failed 4.
Comparing V1's selected cue to V2's first candidate (2591 retained roles): median absolute shift 0.0s; 540 exceed 8s (p90 24.43s).
When matching V1's selected cue to its nearest V2 alternative, 428 remain over 8s; median 0.00s.
Matching each saved V1 alternative (selected cue plus its windows) against all V2 candidates, 121 retained roles have no candidate within 8s (2206 have one within 1s; median nearest difference 0.00s).
After allowing half/double tempo equivalence, 7 retained primary BPM comparisons differ by over 2 BPM.

Largest remaining all-candidate timing differences to review:

| Recording | V1 cue alternatives (s) | V2 candidates (s) | Closest gap |
|---|---|---|---:|
| Forever More — Moloko | 11.98, 13.90, 15.34 | 107.45 | 92.11s |
| Pinnacles — Four Tet | 16.75, 18.65, 28.18, 28.65 | 106.74 | 78.09s |
| Don’t Give Up (original radio mix) — Chicane | 10.40, 12.23, 15.89, 24.59 | 103.81 | 73.72s |
| Another Runaway — Ladyhawke | 4.64, 8.47, 14.23, 18.07 | 100.61 | 72.95s |
| Abandoned Locomotive Overgrown by Luxuriant Vegetation — Jóhann Jóhannsson | 0.39, 6.11, 11.82, 17.53 | 99.43 | 72.37s |

### Tail / outgoing
V1 supported 2829/2,983. Retained 2680, gained 44, V1-supported but V2 returned no cue 142, neither supported 109, role-analysis failure 4; 4 whole jobs failed and remain unresolved. V2 completed-job role statuses: cue-ready 2724, no-cue 251, failed 4.
Comparing V1's selected cue to V2's first candidate (2680 retained roles): median absolute shift 0.0s; 618 exceed 8s (p90 49.08s).
When matching V1's selected cue to its nearest V2 alternative, 545 remain over 8s; median 0.00s.
Matching each saved V1 alternative (selected cue plus its windows) against all V2 candidates, 541 retained roles have no candidate within 8s (1956 have one within 1s; median nearest difference 0.00s).
After allowing half/double tempo equivalence, 6 retained primary BPM comparisons differ by over 2 BPM.

### Tail losses need separate review

The 142 V1-supported/V2-no-cue outgoing roles fall into two evidence groups:

- **126** V1 roles were supported by cached stems passing the 16-bar kick-grid
  and coverage checks; their saved V1 role snapshots contain no phrase cue
  points. V2 therefore has to establish an outgoing phrase from its own grid
  and arrangement evidence, rather than simply reproducing a saved V1 cue.
- **16** V1 roles used an estimated phrase grid. Their saved phrase ends lie
  4.0–15.6 seconds before the complete source end. V2's fitted-passage route
  or natural-finish fallback did not return a supported ending for these roles.

One concrete review case is **Bells of n Y (House 2 House MIX) — Slo Moshun**.
V1 saved an outgoing cue at 93.91s, a 16-bar phrase end at 123.96s, and full
stem-energy coverage through 137.39s (13.42s after the phrase end). V2 measured
the complete recording and grid through 137.39s but returned no tail cue. This
is not a source-coverage failure. It is a difference in how the two versions
establish and represent an outgoing phrase. The existing V2 natural-finish
fallback requires its fitted phrase endpoint to equal the full source end;
that rule does not reproduce V1's supported phrase-plus-natural-tail shape.

This is a comparison finding, not a quality verdict: the saved V1 evidence
alone does not prove that every one of the 142 cues is musically useful. Keep
the 16 estimated-phrase cases as a first listening/reason review set, then
sample the 126 cached-stem cases across cue location and genre. No rule change
or V1 migration has been made.

| Recording | V1 cue (s) | V1 phrase end to file end (s) | ID |
|---|---:|---:|---|
| Bells of n Y (House 2 House MIX) — Slo Moshun | 93.9 | 13.4 | `66PHgPURGTlzrxlEI3piCJ` |
| Running Up That Hill — Kate Bush | 268.0 | 13.3 | `6Qflq56GWHSAjgZHVtBU8I` |
| Who Can Make Me Feel Good? — Bassheads | 175.9 | 6.7 | `3fCq9FXw6FqmuBfrgiAg4O` |
| Wired (Stonk Mix) — Tenth Chapter | 567.9 | 8.4 | `2jENRCvmZxmyUVFIjZ69HG` |
| Move Your Body — Marshall Jefferson | 211.1 | 13.2 | `0gk3FISOCjn63AHrvAmoon` |
| Teknologi (Ambient House mix) — Urban Hype | 378.8 | 15.2 | `5Ep3X7vM4zJUFSzuaK48ml` |
| Remember Me — Phil Jubb | 388.9 | 15.6 | `6ZqMbUgvpV1ejjaUt75ZhU` |
| All Your Love — Mimmo Mix | 287.3 | 11.3 | `54W03SmxECSItuyBljxcTu` |
| Hideaway — De’Lacy | 181.1 | 8.6 | `31szL8rIwQBoqBgDe6teGB` |
| Indica (original mix) — Movin’ Melodies | 316.9 | 13.4 | `07pDAbcni4YmLZfmF5AUNQ` |
| Been a Long Time (original 12″ mix) — The Fog | 451.1 | 13.3 | `321hWc2gMPdjJk2VdP4RZj` |
| Love Resurrection (Dub Mix) — Floor Federation | 424.4 | 9.0 | `0UWXtn3YpdxfC6v0iqZStz` |
| Indica — Paradox | 343.8 | 4.0 | `6ZBYu7oWb9JMkzjvy2xoR5` |
| Pump Up the Volume (original DMC mix) — Greed | 396.4 | 11.9 | `2lRmtxdVbR6Gu3pBC9urnS` |
| Power Of Love — Trotters Independent Traders | 321.3 | 11.6 | `1TsDqcZ1maSn6rBPJyeFRB` |
| Hold That Sucker Down (radio edit) — O.T. Quartet | 180.5 | 9.0 | `4lLDL2xSU5vSb1RULRrsQr` |

### Large retained-tail cue shifts are usually a different boundary

Among retained outgoing roles, **541** have no V1/V2 candidate pair within 8s.
For **478** of these, V1's saved vocal-measurement window ends more than 16s
before the complete recording ends. V1's `leadSeconds`/`postSeconds` describe
the prepared 64-beat (16-bar) exit-stem region; its saved Sub/Beats support
does not by itself mean that region reaches the end of the original recording.
V2's outgoing cue is instead constrained to a supported terminal phrase or a
measured natural finish on the full-source grid.

For example, **Impossible — Röyksopp** has V1's eight exit-window candidates
between 70.81s and 122.31s; its measured V1 exit excerpt ends at 156.69s, while
the complete recording ends at 387.76s. V2 offers a cue at 347.94s with its
phrase ending at the full-source end. The 225.63s nearest-candidate gap is
therefore not an alternative-ordering artifact. It reflects the difference
between a prepared exit excerpt and a true full-track tail. This aligns with
the V2 plan's explicit terminal-placement rule and is a plausible improvement,
but representative source audition is still needed before classifying it as
musically better.

## Suggested listening slate

These examples cover both the changed boundary and cue changes where V1's
measured exit coverage already reaches near the file ending. Times are source
seconds; use the V1 and V2 cue columns as starting points, not as a pre-approved
mix.

| Recording | V1 cue (s) | V2 cue (s) | V1 coverage end to file end (s) | ID |
|---|---:|---:|---:|---|
| Impossible — Röyksopp | 122.3 | 347.9 | 231.1 | `3OpqpHalxrSdgNSiXpO5Bh` |
| Gimme Somethin' True — Basement Jaxx | 107.9 | 291.9 | 173.0 | `2pNOwscOL3yzjvup8zfzsK` |
| Between Stars — Underworld | 145.2 | 325.2 | 190.8 | `3FQjkayVf8ptVXPLQDq3XO` |
| You Make Me — Avicii | 133.0 | 196.8 | 15.9 | `4W3Q18DjbfRDGkxcgkAhNY` |
| School — Four Tet | 153.2 | 207.9 | 9.9 | `3pawyFkMKWvXaWtbRRVt8v` |
| Stakker Humanoid — Humanoid | 253.5 | 262.1 | 0.0 | `5kAZDuWywezFx4ggrl0ZvR` |

For incoming-role losses, a small complementary sample should include **Draw
One Animal — Brian Eno** (V1 cue 1.6s), **Quick Eternity — Daniel Avery** (12.1s)
and **denver luna — Underworld** (19.8s). All 18 lost incoming roles have the
same V2 reason: no supported passage in the measured opening. These three cue
positions test whether V1's early kick-grid support remains musically useful
when V2 asks for opening-passage evidence.

### Owner listening review — 22 November

The owner reviewed the four suggested examples in Navidrome:

| Recording | Review outcome | Comparison implication |
|---|---|---|
| Impossible — Röyksopp | Preferred natural cue around 05:41 (341s), slightly before V2's 05:48 (347.94s). | V2 finds the right ending area, but its cue is about three bars later than the preferred onset. |
| You Make Me — Avicii | Preferred natural cue around 03:11 (191s), before V2's 03:17 (196.80s). | Same approximate three-bar-late tendency; inspect candidate alignment before accepting timing parity. |
| Bells of n Y (House 2 House MIX) — Slo Moshun | V1's 01:34 cue is wrong; the natural outro cue is around 02:00 (120s). | V2 returned no cue. Its saved grid has a downbeat at 120.22s, but this is not enough by itself to establish a beat-supported terminal passage. |
| Draw One Animal — Brian Eno | Ambient and unsuitable for transitions. | V2's no-cue result is acceptable for this reviewed example; beat support alone should not imply transition suitability. |

For Slo Moshun, V1's 01:34 cue is musically wrong, while the owner hears a
natural outro beginning around 02:00. V2's saved grid contains a downbeat at
120.22s, but its last stable beat window ends at 122.58s; the later predicted
downbeats are irregular. The fitted-passage path returns no outgoing cue, and
the natural-finish fallback cannot fit a continuous terminal span. Its normal
candidate widths are 14, 16, 20 and 24 bars; an offline probe including 4–12
bar widths still returned no candidate under the same grid and energy checks.
This may be an audible outro whose beat grid is too weak for V2's beat-matched
role requirement, rather than a cue-selection miss. It remains unresolved
whether a stricter short-outro estimator can establish it safely. No code or
station change has been made.

### Owner listening review — 23 November

On 23 November the owner auditioned the first four Compilations examples and
reported no audible issue with any of the cue points:

| Recording | Cue auditioned | Comparison implication |
|---|---:|---|
| Move Your Body — Marshall Jefferson | V1 211.10s (03:31) | The V1 outgoing cue remains a musically plausible candidate despite V2 returning no cue. |
| Remember Me — Phil Jubb | V1 388.88s (06:29) | The V1 outgoing cue remains a musically plausible candidate despite V2 returning no cue. |
| Power Of Love — Trotters Independent Traders | V1 321.35s (05:21) | The V1 outgoing cue remains a musically plausible candidate despite V2 returning no cue. |
| Theme From S‐Express — S’Express | V2 196.65s (03:17) | The V2-only outgoing cue raised no audible concern in this spot check. |

This is a positive listening signal for these four cue positions. It does not
establish full transition quality or validate the remaining V2 losses. In the
next spot check on 23 November, the owner said the V1 cues were fine for Tenth
Chapter — “Wired (Stonk Mix)” (567.86s / 09:28), Urban Hype — “Teknologi
(Ambient House mix)” (378.82s / 06:19), and Movin’ Melodies — “Indica (original
mix)” (316.94s / 05:17). For Mimmo Mix — “All Your Love,” the owner preferred
a more natural cue around 299s (04:59), at the start of a vocal phrase, about
12 seconds after the V1 cue at 287.26s (04:47). This is a concrete cue-position
improvement to investigate in V2; it does not by itself establish a full
transition. The final four cue-bearing V1 losses reviewed were all from 900+
House Classics. No station or PR change has been made.

The final spot check used the V1 cues for **Been a Long Time (original
12″ mix)** — The Fog (451.07s / 07:31), **Love Resurrection (Dub Mix)** — Floor
Federation (424.39s / 07:04), **Indica** — Paradox (343.83s / 05:44), and
**Pump Up the Volume (original DMC mix)** — Greed (396.37s / 06:36). These V1
positions were candidate listening points, not claims about where an audible
outro begins.

The owner completed this final four-track spot check on 23 November:

| Recording | Owner's assessment | V2 follow-up |
|---|---|---|
| Been a Long Time (original 12″ mix) — The Fog | No obvious outro cue for a beat-matched transition. | V2's no-cue result is consistent with this assessment. |
| Love Resurrection (Dub Mix) — Floor Federation | No cue from the V1 point at 07:04 onward; the closest candidate is earlier around 06:36 (about 396s). | Investigate whether V2 can recognize the earlier phrase as a valid outgoing cue. |
| Indica — Paradox | V1's 05:44 cue is suitable. | V2's no-cue result needs to be reconciled with this positive listening result. |
| Pump Up the Volume (original DMC mix) — Greed | A more suitable cue is around 06:30 (about 390s), roughly six seconds earlier than V1's 06:36 cue. | Investigate the earlier phrase as a possible V2 cue. |

This completes the owner listening pass over all twelve cue-bearing V1 outgoing
losses in the prioritized Compilations cohort. Across them, seven V1 points
were judged suitable as auditioned, three tracks had a more natural nearby cue
identified (Mimmo Mix, Floor Federation and Greed), one track had no obvious
beat-matched outro cue (The Fog), and Slo Moshun's V1 point was already known
to be wrong. These are listening assessments, not yet beat-grid or full
transition validations. The next useful work is a focused offline replay of
the alternative cue locations and Paradox's accepted V1 point against their
source-matched V2 grids; do not broaden to a new batch run until that explains
which cases can be recovered without weakening the ending/continuity guards.

### Grid check of owner-identified cue locations

The saved V2 Beat This grids for the owner-identified locations were checked
read-only. Distances below compare the approximate owner timestamp with the
nearest predicted beat and downbeat; they are timing observations, not a
musical approval test.

| Recording and owner point | Nearest V2 beat | Nearest V2 downbeat | Local beat interval pattern |
|---|---:|---:|---|
| All Your Love — 299s | 298.86s (−0.14s) | 298.78s (−0.22s) | Irregular nearby intervals: 0.08–0.50s. |
| Love Resurrection — 396s | 396.20s (+0.20s) | 396.20s (+0.20s) | Locally steady: 0.44–0.46s. |
| Indica — 343.84s | 343.84s (+0.005s) | 343.84s (+0.005s) | Locally steady: 0.44–0.46s. |
| Pump Up the Volume — 390s | 390.06s (+0.06s) | 390.56s (+0.56s) | Locally steady: 0.48–0.50s. |
| Been a Long Time — existing V1 point 451.07s | 451.08s (+0.007s) | 451.08s (+0.007s) | Locally steady: 0.46–0.50s. |

The alternatives at Floor Federation and Greed, and the suitable Paradox point,
are near V2 downbeats. The Fog demonstrates the limit of that evidence: its
existing point is almost exactly on a V2 downbeat, yet the owner hears no
obvious beat-matched outro. Mimmo Mix's candidate is also in a locally
irregular grid region.

To locate the rejection stage, the five exact source files were verified
against the completed run's source hashes and replayed read-only with their
saved V2 grids. All five established an initial 16-beat entry window, but none
passed the full-span fitted-grid check: the beat fitter requires at least 85%
of all post-entry beats to stay within 60ms of one constant-period grid. The
observed inlier fractions were 21.2% for All Your Love, 22.3% for Love
Resurrection, 34.3% for Paradox, 25.5% for Pump Up the Volume, and 82.2% for
The Fog. The fitter therefore produced no fitted grid, ending estimate or
outgoing cue for any of the five. The terminal natural-finish fallback also
produced no candidate for any of them. The Fog narrowly misses the 85% gate;
the other four miss it by a wide margin. This local replay used an ephemeral
read-only container and did not alter station state, V1 data or PR #10.

This isolates the full-span fit as the immediate reason the V2 fitted-passage
route fails these reviewed examples; it does not prove which local tempo
changes or Beat This errors account for each low inlier fraction. As a simple
comparison, the existing V1 `closing_grid_passages` routine was run against
the same audio and saved V2 grids. It generated closing cues for all five:

| Recording | Existing V1 routine output | Owner's listening assessment |
|---|---|---|
| All Your Love | 04:47 and 05:03 | The owner prefers about 04:59, at a vocal phrase start; the 05:03 alternative is close but four seconds later. |
| Love Resurrection | 07:04 | The owner prefers an earlier point around 06:36; 07:04 is too late. |
| Paradox — Indica | 05:44 | Suitable. |
| Pump Up the Volume | 06:36 | The owner prefers around 06:30. |
| The Fog | 07:31 | The owner hears no obvious beat-matched outro cue. |

This confirms V1's routine is a useful comparison baseline, but copying its
results wholesale would retain points the owner has rejected or wants moved.
Keep V1 data intact and avoid a new cue-fitting design for now. The next step
is a small comparison of the existing V1 candidates, V2's current outcomes and
the owner's judgments, then only consider a narrow change if that comparison
shows a clear rule-level gap. No station or PR change has been made.

### Source-verified replay of the five reviewed endings

On 23 November, the five source files were rechecked against the SHA256 values
saved in the completed V2 run, and the saved full-recording Beat This grids
were replayed through both the V2 preparation path and V1's existing local
closing-span routine. V2 again returned no outgoing cue for all five. The V1
routine reproduced its saved cues: Mimmo Mix at 287.26s and 302.72s, The Fog
at 451.07s and 466.56s, Floor Federation at 424.39s, Paradox at 343.83s, and
Greed at 396.37s and 411.87s. These results confirm that simply falling back
to the V1 closing routine would restore old behavior, including The Fog's
owner-rejected cue and cue positions the owner prefers to move earlier. No
single supported threshold change emerged, so no algorithm change or station
rebuild was made.

### Terminal-grid screen across all 142 outgoing losses

To check whether Slo Moshun's weak terminal grid is common, the saved grids for
all 142 V1-supported/V2-no-cue outgoing roles were screened with the existing
`stable_beat_windows` test. This is a grid-only check; it did not reprocess
audio. It found at least one locally stable 32-beat window ending within 8,
16, 24, 32 and 48 seconds of the file end for 23, 42, 61, 71 and 100 roles,
respectively. Four roles had no stable window anywhere. Among the other 138,
the latest stable window ended a median 30.64 seconds before the source end
(range 0.46–318.07 seconds).

All 42 roles with a stable window within 16 seconds still have the same V2
reason: “No supported phrase reaches the measured recording ending.” The
local window test covers only 32 beats (eight bars) and is weaker evidence
than a supported continuous terminal phrase. The result shows that terminal
local beat stability is not enough to explain those rejections; it does not
show that the rejected cues are musically suitable. A useful next diagnostic
is to separate failure of the longer continuous phrase fit from the audible
body/ending checks, using a small set of these near-terminal cases and owner
listening before changing cue rules.

A second grid-only probe applied the fallback's 14/16/20/24-bar continuous
fit and downbeat-support checks to those 42 cases. The per-role artifact does
not retain the optional primary-grid seed, so this probe used only seeds
reconstructed from stable windows and is a lower bound, not an exact replay.
With those seeds, 24 cases reached a candidate satisfying the grid-fit,
tempo, tail-position, half-track and downbeat-support checks; 10 had no
continuous fit; and 8 had raw fits that failed one of those later grid
constraints. The candidate group still fails the actual preparation result,
so the next differentiator is the audio-derived terminal-body check (or an
unrecorded primary-grid seed), not just local beat-window stability. Slo
Moshun is among the no-fit cases. This is enough to choose a small follow-up
set, but not to justify relaxing the duration or continuity guards.

For both retained shifted tails, the owner's preferred onset is present in the
saved V2 beat grid: 341.02s for the 341s Röyksopp suggestion and 191.04s for
the 191s Avicii suggestion. V2's later cues are also on measured beats. This
narrows the discrepancy to which supported beat is selected as the natural
outro onset, rather than lack of beat coverage or an offbeat V2 cue.

An offline replay isolated an alternative-selection gap for **You Make Me**.
The fitted-passage route returns cues at 196.80s and 212.16s, so algorithm 3
never calls the natural-finish route. Running that existing route independently
finds an additional full-source-tail candidate at 193.46s, within about 2.5s
of the owner's 191s suggestion. A local-only algorithm-4 experiment now keeps
these terminal alternatives alongside fitted cues when the fitted candidates
do not reach the source end. The targeted source replay returned 196.80s,
212.16s, 193.46s, 185.78s and 178.08s for Avicii; Slo Moshun remains no-cue
under the existing terminal-grid safeguards. Seven V2 Python tests, the V2
store tests and controller type checking pass. The 2,983-track population
remains algorithm 3; algorithm 4 has not been run on the station.

Largest remaining all-candidate timing differences to review:

| Recording | V1 cue alternatives (s) | V2 candidates (s) | Closest gap |
|---|---|---|---:|
| Impossible — Röyksopp | 122.31, 113.81, 107.44, 98.95 | 347.94 | 225.63s |
| Gimme Somethin' True — Basement Jaxx | 107.88 | 291.88, 307.88 | 184.00s |
| Between Stars — Underworld | 145.20, 137.64, 131.97, 124.41 | 325.15, 340.27 | 179.95s |
| Beat Connection — LCD Soundsystem | 276.71, 269.44, 260.35, 253.08 | 453.07, 467.61 | 176.36s |
| The Deep (Global Communication mix) — Global Communication | 449.34, 447.34, 446.84 | 625.02, 641.04 | 175.68s |

## Failure triage

The three download-failed recordings were retried in separate run `58c875d6-198a-4634-814c-c571eba42feb` so the population comparison remains intact. All three failed again with the same incomplete-download result. The preparation guard caps reads at the library’s recorded file size plus one byte; the station stream exceeded that cap. The precise reason for the size mismatch remains unverified.

The fourth population-job failure is **Mosaic — Underworld**. Incoming fallback cues had negative `phraseStartSeconds`; the controller rejected the result schema, so neither role was saved. The normal fitted-cue path filters negative phrase starts, but `_incoming_grid_fallback` results are accepted without the same check. This identifies the failing path; no code fix or retry has been applied.

Four additional completed jobs have role-level learned-grid/coverage failures (Pendulum, The Orb, Squarepusher and Daft Punk). These are distinct from the four failed whole jobs.

## V1 preservation and airplay additions

V1 remains paused, while `subbeatsOnAirCaching` is enabled. Compared with the protected 6,423-row archive, the live queue has 52 additions and no removals. All 52 are queued airplay tracks: each matches a play record, and its queue timestamp follows the on-air timestamp by about one second. None changes the 2,983-record V2 comparison population: every V2 job ID remains present, all embedded V1 snapshots match their current rows field-for-field, and the current supported set has no additions or removals relative to the run.

## Files

- CSV: `2026-11-22-subbeats-v2-population-comparison.csv` — one row per recording-role, with V1 cue alternatives and V2 candidates, source provenance, coverage, reasons, selected-cue and candidate-set timing deltas. The full V1 snapshot remains in the original run JSON.
- CSV: `2026-11-22-subbeats-compilations-cohort.csv` — one row per Navidrome track ID from the five prioritized Compilations folders, joined to current V1 queue status and algorithm-3 V2 results.
- These are comparison screens, not quality verdicts. Timing shifts and role changes still need audio/evidence review before the parity gate.
