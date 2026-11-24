# Sub/Beats eligibility and pick-time preparation plan

Status: V2 preparation is available in a separate store. The current priority
is to use its saved cues for pick-time stem extraction and produce a Stem Beats
transition on-air. Keep V1 intact and leave all changes off PR #10 until the
station behavior is confirmed. The population comparison and cue-review work
remain useful follow-up, but do not block this first end-to-end station trial.

**Latest checkpoint, 24 November:** the owner confirms stable station playback
of both Stem Beats and Regular Stem Blend transitions. The deployed fallback,
grid/window fixes and longer tempo return have passed that listening check.
Automatic airplay-triggered V2 cue preparation was deployed to the station's
controller at 04:30 UTC. It persists and resumes its own V2 backlog, respects
transition priority and operator pauses, records preparation duration, and
leaves V1 data and later pick-time extraction separate. The controller is
healthy; the first-use airplay and later matching-pick trial is still pending.
See the handover for current checks, image ID and rollback; older deployment
notes below are dated history. PR #10 remains unchanged.

**Latest checkpoint, 23 November:** two Stem Beats transitions were confirmed
by the owner before the latest controller rebuild. Subsequent live renders
returned HTTP 422. Review reproduced a fractional-source-end disagreement
between the production extraction clamp and renderer; the existing
whole-second synthetic control still passes. The ordered recovery plan is:
unify sample boundaries and add the regression; expose safe render rejection
reasons; restore effective independent Regular fallback after V2 failure;
restore single-owner grid refresh and immediate-pair priority; validate both
Regular windows before extraction and repair genuinely short head coverage;
then prove the production contract and investigate the audible beat offset.
See the [current progress and next-steps handover](2026-11-20-stem-blends-subbeats-handover.md#current-checkpoint--24-november-2026)
for evidence, exact worktrees, deployed images, validation and acceptance gates.
That checkpoint takes precedence over older trial/status notes in this plan.

Later on 23 November, the owner confirmed the sample-boundary candidate aired
Stem Beats without mismatched beats and a Stem Blend aired fine. Steps 3–5 were
then selectively integrated into the dirty station checkout and both
controller and analyzer were rebuilt. The updated fallback, grid ownership,
complete-window admission and bounded head-grid repair now await their own
on-air check. Exact image hashes, rollback details and the two requested later
follow-ups are in the handover above. Keep PR #10 unchanged until this latest
station behavior is confirmed.

**Local implementation follow-up, 23 November:** the sample-boundary fix and
safe render failure codes (the first two recovery steps) are implemented and
have passed isolated native/adjusted-tempo audio checks, including fractional
source endings and refusal of missing samples. They were selectively integrated
and deployed with both controller and analyzer at 18:20 UTC; health, deployed
hashes and focused station checks passed. Normal programming has resumed, so
a new compatible pairing is unlikely for an hour. On-air verification remains
pending. Independent Regular fallback is now implemented and contract-tested
locally, with 37 Regular and 103 Sub/Beats checks passing; it is not deployed. See the
handover for exact images and rollback details. The development and station
live wrappers still differ; keep using selective integration.

This plan changes the Sub/Beats candidate and preparation flow so a recording is
not held in that
path merely because its genre and BPM match. Shared-grid and cue evidence
first establishes which roles it can supply. Stem extraction and vocal
measurement then happen for a real pair at pick time, before the transition
type is finalized. A candidate that cannot supply the needed Sub/Beats role is
released to the regular Stem Blend path, which makes its own pick-time decision.

### First-time Stem Beats workflow — 23 November 2026

Treat the standard Stem Beats preparation path as a user's first activation of
Stems. V1 and prior V2 experiments remain available for comparison, but they do
not supply candidates, baseline requirements, eligibility overrides or saved
results to a fresh run. A library run uses the current Dance Candidate rule
(dance-family genre and 90–180 BPM). A single-track run is queued automatically
from airplay; there should be no manual track search-and-prepare control. The
legacy Sub/Beats queue and its screens remain a separate comparison surface.

The controller now exposes compact run summaries and progress so the admin
screen can start, pause, resume and retry these independent runs without
polling full 20,000-track job payloads. The Library admin area links to a new
Stem Beats preparation screen for library analysis. It reports cue-ready
head/tail counts and average prep time. It prepares analysis only; it does not
extract stems or change pick-time playback.

### Pick-time integration boundary — 23 November 2026

The Stem Blend flowchart supplied by the owner describes current behavior and
is the reference path, not a request to rebuild it. The controller already
gates on an adjacent unsent pair, enabled transition settings and DJ/pair-drain
mode; obtains or refreshes shared beat grids when time permits; checks tempo,
test style, measured eight-bar windows and the handoff deadline; and prepares
the outgoing tail/incoming head asynchronously. At drain it tries Sub/Beats,
then gives Regular Stem Blend its independent assessment, then leaves the
normal pair-aware crossfade. See `broadcast/regular-stem-runtime.ts`,
`broadcast/regular-stem-needs.ts`, `broadcast/queue.ts` and
`broadcast/subbeats.ts`.

V2 is now connected to pair-time extraction/rendering, using prepared roles;
airplay-triggered cue preparation is deployed and awaits its first station
trial. The V2 cue-preparation queue can analyze a track after it starts playing
and persists its results separately from V1. On a later matching pick, use
saved V2 role cues to plan the pair-specific head/tail extraction in the
existing asynchronous window-preparation lane. Do not make a first-time pick
wait for full V2 analysis followed by a separate Demucs job; when cue prep is
missing, let that transition fall through and make the aired track available
for background preparation for a later pick. Preserve the existing
Sub/Beats → independent Regular Stem Blend → ordinary crossfade order.

The first station gate is an eligible track with no V2 record: confirm airplay
queues and completes cue/grid preparation without holding playback, records its
duration and leaves V1 unchanged. Then use prepared V2 records to confirm
pick-time extraction, vocal checking, rendering and safe arming. Keep these as
separate timing and playback observations.

The former V1 live hook (`music/subbeats-airplay.ts`) wrote to the legacy
queue behind `subbeatsOnAirCaching`. The new live hook calls the independent
V2 preparation owner instead; the legacy helpers remain available to explicit
comparison/scanning workflows. V1 is not V2 storage or run input.

### Follow-up: independently assess Regular Stem Blend after a Stem Beats miss

When a needed Stem Beats role has no cue, allow Regular Stem Blend to assess
the pair independently under its existing 3% BPM gate and its own window,
deadline and extraction rules. A missing Stem Beats cue is not itself a reason
to reject the pair or to reuse Stem Beats cue timing. Keep this behavior behind
the existing fallback while the first Stem Beats extraction and render path is
being proved.

### Progress — 20 November 2026

- A read-only inventory of the station V1 queue confirms 2,983 supported
  recordings: 154 head-only, 367 tail-only and 2,462 with both roles. The queue
  was already paused and was not changed.
- A protected V1 archive is complete at
  `/media/satadrive/subwave-v1-baseline-2026-11-20`. It contains 38,386
  selected files (101,387,328,904 bytes); its manifest records 2,983 supported
  tracks and its archived queue hash matches the station queue. The queue
  gained one queued, unprepared entry during the copy; that queue change and
  the original queue bytes are retained alongside the final 6,423-job queue.
  Existing jobs were unchanged and the queue remained paused.
- The corrected algorithm-3 station run `ceb928bd-2833-4678-9244-3aa2a3779ef9`
  completed all seven tracks against V1 snapshot hash
  `23c521bfd9b93e58b11812d2787621f0b8b92991b1a14c28b1f081afb5f9b30c`. Three
  both-role positives matched V1 cue positions exactly; Summer of Love's head
  and Sugar Is Sweeter's tail were retained, and In Pieces stayed negative.
  Booyah gained a V2 incoming role while retaining its V1 outgoing role. Its
  gained head cue and Sugar Is Sweeter's additional tail alternatives were
  reviewed by the owner and approved. Seven-track prep averaged 35.3 seconds
  (10.8–84.7 seconds); do not extrapolate this small sample as a batch promise.
- In the development checkout, a separate `state/subbeats/prep-v2` run and
  artifact store, admin API, resumable worker and independent cue assessment
  are implemented. V2 uses complete source-bound Beat This small0 grids,
  derives each role separately, performs no Demucs or vocal measurement, and
  does not write the V1 queue or library grids.
- The first temporary seven-recording station run completed in separate V2 storage.
  The V1 queue remained paused with its baseline hash unchanged. After fixing
  shared-file permissions, the sample exposed two mismatches: V1-supported
  roles were unavailable for several recordings, and one outgoing cue set for
  Benediction moved about 4.1 seconds. Dario G and Rozalla retained only V2
  tails; Booyah retained only a V2 head; the negative case remained negative.
  Details and the run ID are in the handover. This is not parity approval.
- Two request issues found during the station run are fixed locally: analyzer
  access to the staged complete source, tail-grid validation when both roles
  need refreshing, and omission of absent grids from the analyzer request.
  Focused type checks, the V2 store tests and all 21 Sub/Beats route tests pass.
  That sample used the original controller/analyzer images; no PR contents or
  metadata were changed.
- Focused controller type checks, V2 store/cue tests and all 21 Sub/Beats route
  tests pass. The broader analyzer Python suite still has six existing
  failures because `onnxruntime` is unavailable in this checkout; the new V2
  suite and sidecar packaging contract pass in the full run.
- The owner reviewed the previously disputed Booyah and Sugar Is Sweeter cues
  and confirmed they are fine. This clears the sample audio-review gate; it
  does not establish population parity or approve pick-time changes.
- A second seven-track station sample completed under V2 algorithm 2. Full-grid
  fitted cues for Sunchyme and Everybody's Free matched V1 exactly, and
  Benediction retained both roles. Booyah's tail, Summer of Love's incoming
  role and CJ Bolland's tail remain unexplained losses; the sample is not a
  parity pass.
- Algorithm 3 adds the existing Beat This-grid incoming and natural-finish
  fallbacks. The first controller-managed run stalled on its first job; the V2
  analyzer request was then hardened to keep its deadline active through the
  response body and retry stale keep-alive sockets. The corrected seven-track
  run above completed. This confirms the controller-managed path now completes
  the sample, though it does not prove which transport condition caused the
  earlier stall. V1 remains paused. No PR update has started.
- The owner approved the sample cues and authorized the bounded comparison.
  Station run `19562385-c3f5-4622-9782-a3e3ff2eca6b` contains all 2,983 V1-
  supported recordings, algorithm 3, and baseline hash
  `fc7b58f67197becfa20c7a30860aa5a8b3a537c6fbbd9669792d6f049d5b16c7`. At the
  The owner paused this run after about an hour for review, then authorized
  continuing after old-style preview testing. The latest snapshot has 169
  complete, 1 running, 2,812 queued and 1 failed; mean prep time is 25.1
  seconds across completed jobs (median 15.4 seconds). In those completed
  jobs, all 166 V1-supported incoming roles remained cue-ready; outgoing roles
  were cue-ready for 158 of 159 V1-supported roles. The one apparent loss is
  “Bells of n Y (House 2 House MIX)” by Slo Moshun and needs review. “When the
  Lights Are Out (garage mix)” still failed to download completely. The V1
  queue remains paused. The protected archive has hash
  `48ca705b5a8257e314946005e936aacf62dda3243de4d5392908d43c4f38f1d8` and 6,423
  jobs. The current queue has 6,433 jobs: ten added queued/unprepared entries,
  with no removed or changed existing rows versus the archive. All 2,983 V1
  records captured in this run still match their current queue fields. The
  controller now validates the saved V1 records and the supported population
  before resuming, so these unprepared additions do not invalidate V2. The
  interrupted Qattara job was recovered and the run resumed; the existing
  failed download was not retried. Review the apparent tail loss before
  completing the comparison or returning to pick-time work. PR #10 remains
  untouched.

### Latest checkpoint — 22 November 2026

- The population run completed 2,979 of 2,983 recordings; four whole jobs
  failed. Average preparation time was 28.81 seconds per completed recording.
  The V1 queue remains paused and separate. Its 52 new rows are on-air cache
  additions, not changes to the protected 2,983-record comparison baseline.
- The role-level comparison and CSV are in
  [`docs/investigations/2026-11-22-subbeats-v2-population-comparison.md`](../investigations/2026-11-22-subbeats-v2-population-comparison.md)
  and its adjacent CSV. V2 cue-ready counts are 2,908 incoming and 2,724
  outgoing among completed jobs; 18 V1 incoming and 142 V1 outgoing roles
  returned no V2 cue, with failures reported separately.
- The owner listened to four review examples in Navidrome. V2's Röyksopp and
  Avicii tail cues were both about three bars later than the preferred natural
  onset; Slo Moshun's V1 cue was wrong, while its natural outro around 02:00
  lacks a stable terminal grid in the saved V2 evidence, despite a downbeat at
  120.22s; Brian Eno's ambient opening was correctly judged unsuitable for
  transitions. This keeps the parity gate open and identifies outgoing cue
  derivation and terminal-grid coverage as the next review targets.
- An offline replay found that algorithm 3 suppresses natural-finish
  alternatives whenever fitted outgoing cues exist. A local-only algorithm-4
  experiment now retains terminal alternatives as well; on Avicii's “You Make
  Me” it adds a 193.46s candidate near the owner's 191s preference. Targeted
  Python tests, V2 store tests and controller type checking pass. The
  comparison population remains algorithm 3; no station scan, station change
  or PR update has been made for algorithm 4.
- A read-only screen of the 142 outgoing losses found 42 with a locally stable
  eight-bar beat window ending within 16 seconds of file end; all 42 still
  fail V2's continuous terminal-phrase rule. A second grid-only probe found
  that 24 can satisfy a continuous terminal grid fit using saved stable-window
  seeds, 10 have no fit, and 8 fail later grid constraints. Because the role
  artifacts omit the optional primary-grid seed, these counts are a lower
  bound rather than a full replay. Next, separate the audio-derived ending
  checks from grid-fit failures on a small sample before changing cue rules.
- The owner confirmed that tracks from the Navidrome Compilations library are
  Sub/Beats' primary intended-use material and directed quality review to five
  folders: 30 Years - Three Decades of Dance (2021), 90s Dance Anthems, 100
  Hits - Club Anthems (2013), 100 Hits - Dance Anthems (2008), and 900+ House
  Classics. Exact folder membership was joined by
  Navidrome track ID to the V1 queue and completed V2 run. The folders contain
  1,259 files; V2 has 1,236 complete results plus one failed job among the V1-
  prepared tracks. All completed V1-supported incoming roles were retained.
  Twelve supported outgoing roles were lost: Slo Moshun (already reviewed as a
  wrong V1 cue), Marshall Jefferson, and ten 900+ House Classics tracks. All
  twelve came from V1's estimated-phrase-grid path. Details are in the
  compilation cohort CSV and comparison report. The broad 2,983-track totals
  no longer serve as the primary audio-review gate. Replaying those 12 losses
  offline with local algorithm 4 and their original files/saved grids produced
  no outgoing cue for any of them, so the experiment does not resolve these
  cases. On 23 November the owner auditioned the V1 cues for Marshall Jefferson,
  Phil Jubb and Trotters Independent Traders, plus the V2 cue for S’Express, and
  reported no audible issue with any of the four. This supports retaining those
  cues as plausible candidates; it is not a full transition test. Slo Moshun
  remains separately judged wrong. In the next review, Tenth Chapter, Urban
  Hype and Movin’ Melodies V1 cues were also judged fine. For Mimmo Mix — “All
  Your Love,” the owner preferred a more natural cue near 04:59, at the start
  of a vocal phrase, about 12 seconds after V1's 04:47 cue. This is the first
  reviewed cue-position improvement to carry into V2 evaluation. The owner
  then completed the last four cue-bearing V1 losses: The Fog had no obvious
  beat-matched outro cue; Floor Federation's closest cue was earlier around
  06:36 rather than after V1's 07:04 point; Paradox's 05:44 cue was suitable;
  and Greed's more suitable point was around 06:30, slightly earlier than
  V1's 06:36. The listening pass is complete. A read-only comparison with the
  saved source-matched V2 grids found the identified points near V2 downbeats
  for Floor Federation (396.20s) and Paradox (343.84s); Greed's 390s point is
  near a beat at 390.06s but not the nearest downbeat (390.56s). The current
  V1 cue for The Fog is almost exactly on a V2 downbeat (451.08s), even though
  the owner hears no suitable beat-matched outro. Mimmo Mix's 299s point is
  near a predicted downbeat (298.78s), but the local beat sequence is
  irregular. A source-hash-verified, read-only replay of all five reviewed
  source files found that each had an initial entry window, but none passed
  the full-track constant-period fit: their inlier fractions were 21.2%,
  22.3%, 34.3%, 25.5% and 82.2%, below the 85% threshold. No fitted grid or
  ending was produced, and the terminal fallback returned no cue. This points
  to global-grid consistency as the immediate rejection stage; it does not
  establish why each grid drifts. A read-only run of V1's existing closing
  routine generated cues for all five, including The Fog and the later
  Floor Federation cue that the owner did not prefer. Treat it as a comparison,
  not a drop-in replacement. Keep the next step simple: compare V1 output, V2
  output and owner judgment on this small set, then consider only a clearly
  supported narrow change. Keep V1 intact; do not run a broad batch or relax
  population-wide guards.
- No station behavior or PR contents were changed during this review.

## Revised action plan — 20 November: preserve V1, prove V2 preparation first

The owner reports **2,983 scanned tracks with Sub/Beats support in the head,
tail, or both**. Preserve that work as V1. V2 is a separate preparation workflow
with separate persisted results; running it must not overwrite, migrate,
invalidate or delete V1 entries, cue data, reviewed corrections, vocal evidence,
prepared stems or supporting artifacts. This instruction supersedes the earlier
clean-reset permission. A failure or an unsupported role in V2 must leave V1
available for comparison.

V1/V2 here name preparation workflows. They are not the existing cache folder
version, cue algorithm version or `classic`/`small0` method. Inventory those
actual methods rather than assuming all 2,983 entries use the same one.

### 1. Capture and protect the V1 comparison baseline

- Inventory the exact recording IDs behind the reported 2,983 supported tracks,
  recording head-only, tail-only and both counts. Also inventory the remaining
  scanned tracks, so later comparisons can detect false positives as well as
  recovered roles. Reconcile any count difference explicitly; the owner count
  is the starting expectation, not a count verified by this documentation edit.
- Save a consistent baseline of V1 records, source identities, methods/versions,
  cue choices, timing, coverage, vocal/lyric evidence and reviewed corrections.
  Record artifact references and integrity information, and preserve the
  referenced files with a recoverable snapshot or backup before a trial scan.
  A metadata export alone does not preserve prepared audio.
- Trace the previous successful preparation and playback path and record known
  successful examples. Keep file presence, V1 role support and a successful pair
  distinct: Rozalla's exit files alone did not establish a valid pair with
  Booyah under the rebuilt controller.
- Ensure V2 scheduling, cache budgets, cleanup and invalidation cannot evict or
  rewrite V1 artifacts indirectly. Do not send V2 jobs through the V1 enqueue
  operation, which replaces a previous entry's preparation fields.

Deliverable: a reproducible V1 reference set and a checked preservation boundary.
This step does not switch live playback or roll back the station automatically.

### 2. Add a separate, versioned V2 preparation store

- Give V2 its own job queue, results and artifact namespace, for example
  `state/subbeats/prep-v2/`; keep all V1 readers and writers explicit. V2 retries,
  pause/resume and failures affect V2 records only. Publish completed results
  atomically and retain the prior comparison run when the algorithm changes.
- Identify results by exact recording and source revision. Save checksum, byte
  size, decoded duration, grid model/preprocessing version, cue algorithm
  version and preparation run identity. A changed recording is a source-change
  case, not a V1/V2 quality regression for the same audio.
- Store independent head and tail outcomes, each with its grid/coverage,
  candidate cues and stable reason. Distinguish not scanned, running, failed,
  no usable cue and cue-ready. Missing tail evidence must not erase a good head.
- Keep V2 results out of automatic live admission during this comparison phase.
  In particular, do not relabel V1 as stale or unsuitable merely because it does
  not contain the new V2 fields.

Deliverable: V1 and V2 can coexist for the same recording without either being
silently selected, replaced or merged into the other.

### 3. Implement the proposed V2 prep stages, without separation

Run these stages in order, reusing existing analysis helpers where they fit:

1. **Candidate/source check:** use Dance Candidate as discovery only. Explicitly
   include every V1-supported recording in the comparison even if today's
   discovery filter would exclude it. Validate the complete current source;
   downloading/decoding may be needed, and a capped prefix cannot prove a tail.
2. **Shared-grid analysis:** reuse complete, source-matching Beat This `small0`
   head/tail evidence where sufficient. Refresh missing or insufficient windows
   independently, with enough measured span to evaluate the candidate passages.
   Keep newly calculated grids in V2 during comparison so they do not replace
   V1's inputs or alter the live library grids. Do not use legacy Librosa timing
   as fallback V2 authority.
3. **Cue derivation:** derive incoming and outgoing candidates from those grids
   and the recording's arrangement. Preserve useful existing cue behaviour,
   including phrase timing, alternatives, natural starts and natural finishes;
   retain measured coverage and validation/confidence for each candidate. Reuse
   cue logic, but do not blindly copy V1 outcomes or substitute arbitrary
   eight-bar windows just to increase the supported count.
4. **Independent role assessment:** record usable incoming head, outgoing tail,
   both or neither, with cue positions, BPM, phrase/interval bounds and reasons.
   Require source identity, sufficient measured coverage and true tail placement.
   Mark usable results as cue-ready, not stem-ready or approved for a pair.
5. **Durable completion:** save the evidence and timings, then report completion
   into the V2 queue. Interrupted, failed and source-changed jobs remain
   retryable without repeating completed, unchanged work.

V2 prep runs no Demucs, stem extraction or new vocal measurement. Existing V1
vocal/lyric evidence remains comparison material; it cannot count as newly
measured V2 vocal evidence. Vocal approval still belongs after extraction in
the later pick-time phase. Pair tempo, harmonic style and vocal compatibility
also remain separate from per-track role support.

### 4. Prove the prep contract on a small representative set

Start with V1-supported head-only, tail-only and both-role examples, plus
scanned negatives and difficult endings. Include tracks from known successful
pre-rebuild transitions and the recent station trial tracks where useful.
Select by exact recording ID, not artist/title alone.

Check V1 preservation, no separation calls, independent head/tail failures,
source-change refusal, incomplete-source/tail refusal, interrupted/resumed work
and deterministic results for unchanged inputs. Compare cue timing against
waveforms and listen to original passages where the two versions disagree.
Keep these checks independent of automatic queue selection or a new live render.

Deliverable: trustworthy V2 prep on a small set before spending time on a batch.

### 5. Review the owner-prioritized Compilations cohort first

The algorithm-3 run over all 2,983 V1-supported recordings is complete, but its
aggregate is exploratory because V1 admission was broad and many recordings
have not been tried on air. First review the exact Navidrome track IDs in these
five Compilations folders: 30 Years - Three Decades of Dance (2021), 90s Dance
Anthems, 100 Hits - Club Anthems (2013), 100 Hits - Dance Anthems (2008), and
900+ House Classics. Reuse the saved V2 results; do not rescan tracks already
prepared. Prioritize outgoing losses and changed/gained cues, checking original
audio and sustained-beat suitability. The full folder membership and current
V1/V2 status are exported in
`docs/investigations/2026-11-22-subbeats-compilations-cohort.csv`.

Once this focused review establishes the useful V2 behavior and any needed
algorithm changes, return to the wider V1-supported population and scanned V1
negatives. Keep failures and unprocessed tracks separate from role losses;
reuse current source/grid evidence, bound concurrency and retain per-stage
timings. Do not expand into a whole-library scan by default.

Produce an operator-readable per-track comparison and an export containing:

- V1 and V2 head/tail support, including unprocessed/error counts separately;
- retained, gained and lost roles, and movements between head-only, tail-only,
  both and neither;
- cue positions/alternatives, BPM, phrase timing, natural-tail placement,
  measured coverage, source identity and reason for each difference;
- preparation time and work reused, with unsupported-by-policy distinguished
  from failed processing or unavailable source, plus the average elapsed time
  per completed recording for future batch estimates;
- review outcome for disagreements, linked to the evidence used to settle them.

Preserve raw V1 fields in the comparison. A normalized comparison view may map
older suitability formats to role support, but must retain the mapping/version
and must not invent equivalent cues where V1 never stored them.

### 6. Keep the preparation comparison as follow-up work

The focused compilation review and remaining population review still matter
before treating V2 as a broadly validated replacement for V1. They do not block
the first end-to-end pick-time trial, which will use already prepared V2
records and confirm source identity before use. Continue to preserve V1 and
record the comparison evidence. Before broad rollout, establish that:

- V1 records and referenced artifacts are preserved and remain readable;
- every baseline recording is accounted for, including failures/source changes;
- head and tail are assessed separately, with no unexplained loss of a
  previously supported role on the same recording;
- differences are checked for timing and musical usefulness. A genuine V1
  false positive may be corrected with documented evidence and owner review;
  a higher total supported count alone is not evidence of improvement;
- representative retained, gained and changed passages have been reviewed,
  with no relaxed source, timing or tail-placement guards;
- the owner agrees that V2 prep matches or improves upon V1 for the intended
  role/cue behaviour. Prep parity does not claim vocal or final-render parity.

### 7. Reach the first on-air Stem Beats transition

Use a small set of already prepared V2 tracks to prove the complete path:

1. Read only complete V2 jobs whose saved source identity still matches the
   current recording; require the outgoing tail and incoming head roles for
   the actual pair.
2. Apply the existing Sub/Beats pair, tempo and handoff-deadline checks, then
   extract only the required source windows through the bounded CPU stem
   worker. Keep these outputs in a Stem Beats working area, separate from V1
   and regular Stem Blend caches.
3. Measure vocal activity on the extracted vocal stems, run the existing
   Sub/Beats render checks, and publish the lossless handoff only after the
   queue occurrence, source identity and deadline still match.
4. Exercise failures and ordinary fallback locally, then confirm the result
   with station listening. Keep all work off PR #10 until station behavior is
   confirmed and preserve the testing branches and their pre-rebuild state.

The first trial can use the existing comparison run; it does not claim that
the wider V2 population has passed review. Airplay-triggered preparation for
unprepared tracks follows after the saved-cue pick-time path works. The
independent Regular Stem Blend assessment remains the fallback and is not a
mixed renderer.

## Implementation checkpoint — 20 November: role policy and regular fallback

Historical checkpoint. The V2-first action plan above now controls sequencing
and data preservation. The station trial is recorded in the
[current handover](2026-11-20-stem-blends-subbeats-handover.md).

The owner confirmed that a declined Sub/Beats pair must always be offered to
Regular Stem Blend under its independent rules. Both regular roles use the
regular renderer; there is no mixed Sub/Beats/regular renderer. This supersedes
the candidate reservation and crossover rules in the 17 November regular plan.

The first seven-track V2 station sample revealed that V2 was assessing
role-windowed grids rather than the full-recording Beat This grid used by V1.
V2 now predicts or reuses a complete source-bound grid, evaluates incoming and
outgoing roles from that shared grid, and saves it only under V2 artifacts.
This correction is algorithm version 2; no V1 state is changed. Local tests
pass. Next, repeat the seven-track station sample and review retained, gained,
lost and shifted roles against V1, including audio timing, before starting a
larger comparison. Do not update PR #10 until station behavior is confirmed.

`music/subbeats-role-policy.ts` now screens the requested head or tail separately
using current small0 shared-grid provenance, complete-source size, cue timing and
window coverage. It distinguishes `cue-ready` from `coverage-ready` and returns
stable missing/stale/short/source reasons. The screen reads metadata only and
does no separation. These are readiness proposals; the existing worker still
verifies saved artifacts and original source audio, applies the Sub/Beats tempo
and vocal checks and renders before a handoff can be armed.

Live admission and Mixing Desk status use the same directional check. A missing
outgoing head or incoming tail no longer vetoes the roles this pair needs. The
pair fingerprint includes the relevant shared grids and library source sizes so
their replacement invalidates an unpublished render.

Broad Dance Candidate admission no longer blocks regular window preparation,
grid widening, rendering or suitability status. Regular preparation retains its
own exact eight-bar windows, three-percent tempo rule, CPU/source safeguards and
handoff deadlines. The current coordinator can prepare regular fallback windows
while Sub/Beats has saved coverage; prioritizing Sub/Beats extraction ahead of
regular work belongs to the preparation split below.

This checkpoint does **not** change the managed preparation worker: it still
generates cue coverage and measures vocals before pair selection. Live Sub/Beats
still needs saved coverage. Next implement shared-grid cue refresh without
Demucs, then exact CPU extraction and vocal checks for the actual pair. No new
persisted role evidence or station reset has been introduced yet.

The local station candidate is on `codex/subbeats-role-policy-station-20261120` in
`/home/jaz666/codex/pr10-integration-20261118`. No source has been copied to the
test-station checkout and no services, cache files or settings were changed.
The owner requires station behavior to be confirmed before this work is added
to PR #10. Keep this candidate local; do not push it to the PR branch or update
the PR description until that confirmation.

Verification for this checkpoint:

- Controller lint and the final type check pass (existing lint warnings remain).
- The focused regular-stem suite passes 36 cases; the Sub/Beats suite passes
  95 cases and the extended grid test passes. The final live suite passes all
  17 cases, including cancellation, uncovered-cue cleanup and grid replacement.
- All 737 web tests and the final web lint/type check pass. The first web lint
  run exposed one existing class-order error in `NowPlayingWaveform.tsx`; its
  class order was corrected without a visual or behavioral change.
- The full controller run completed 7,649 cases: 7,647 passed and two failed.
  One is the unchanged `analyzer-python.test.ts` group, covering existing beat,
  downbeat, facet, tail-placement, loudness-curve and stem-marker fixture
  failures. The other was this checkpoint's live fixture clearing markers
  during simulated grid replacement; it was corrected and its suite rerun
  successfully. The whole 28-minute suite was not repeated after that fixture
  correction. Analyzer source and its failing Python fixtures are unchanged.
- Real audio auditions, live station playback and rollout were not run.

## Goal

For each selected transition, reach one explicit outcome:

1. **Sub/Beats confirmed:** the outgoing track has a usable Sub/Beats tail, the
   incoming track has a usable Sub/Beats head, the required stems are extracted
   and source-verified, and the vocal-activity check passes before a Sub/Beats
   render is armed.
2. **Released to Regular Stem Blend:** Sub/Beats cannot use the required role
   or the final Sub/Beats check fails. Regular Stem Blend gets an opportunity
   to select its own current tail/head windows and extract them at pick time.
3. **Ordinary transition:** neither stem path has complete evidence, sufficient
   deadline, or a successful final check.

“Dance Candidate” remains a broad discovery label, not proof of suitability
and not a reservation from regular stems. Eligibility is directional: one
track can have an incoming head, an outgoing tail, both, or neither.

## Why change the current flow

The current broad Sub/Beats admission is based on BPM 90–180 and a dance-genre
predicate. That is useful for finding candidates, but it does not prove that a
track has a current shared grid, an incoming cue, an outgoing cue, or saved
coverage for either role. The current preparation path derives cues and then
immediately separates cue regions and measures vocal activity. The current
Regular Stem pair policy also treats broad Sub/Beats eligibility as a blanket
reservation. A candidate with no usable Sub/Beats role can therefore miss both
Sub/Beats and regular Stem Blend preparation.

The scanned subset is already a useful warning: of 6,412 scanned Dance
Candidates, 4,448 lacked incoming cues and 4,526 lacked outgoing cues. These
figures overlap and do not describe the full 12,205-candidate pool. They show
why the genre/BPM candidate label should not be treated as role readiness.

## Target decision flow

| Stage | Work | Result |
| --- | --- | --- |
| Candidate discovery | Keep the existing Dance Candidate predicate as a broad, inexpensive discovery filter. | Candidate to screen; no stem reservation. |
| Grid and cue screen | Ensure current shared Beat This head/tail grids and derive/refresh role cues. Store outcomes separately for head and tail. | Sub/Beats role evidence, role-specific failure reason, or release. |
| Pair selection | For the actual outgoing-tail/incoming-head roles, check Sub/Beats grid/cue readiness, the existing Sub/Beats tempo/pair rules, and remaining handoff time. | Sub/Beats extraction request or release to Regular Stem. |
| Pick-time extraction | Extract only the exact cue regions required for the selected pair, using the regular pick-time CPU worker foundation where its contract fits. | Source-bound temporary stems, or a named extraction failure. |
| Vocal check | Measure vocal activity from the extracted vocal stems for the candidate cue regions and run the existing Sub/Beats vocal/conflict logic. | Confirmed Sub/Beats render, another already-covered cue choice, or release. |
| Regular fallback | Run Regular Stem Blend's independent current-grid, role-window, tempo and deadline checks; extract its exact windows if admitted. | Regular Stem Blend, or ordinary transition. |
| Handoff | Revalidate queue occurrence, source identity, evidence version, job completion and deadline immediately before arming. | One immutable transition handed to the mixer. |

The flow must not wait for Sub/Beats preparation if it cannot meet the handoff
deadline. Pending work is not an eligibility verdict. Completion must trigger
a fresh decision against the live pair and queue generation.

## 1. Define candidate, role and pair evidence

Replace the use of one broad boolean as the authority for both Sub/Beats and
Regular Stem Blend with explicit evidence dimensions:

- **Candidate:** genre/BPM discovery predicate matched. This may prioritize
  grid/cue screening, but does not reserve either track role.
- **Current source:** the grid, cue and any extracted stems refer to the current
  recording revision. Check source identity and size, and checksum where the
  extraction contract provides one. Stale or mismatched evidence is unusable.
- **Head role:** current shared head grid plus a Sub/Beats incoming cue and
  enough measured coverage for the requested extraction window.
- **Tail role:** current shared tail grid plus a safely placed Sub/Beats
  outgoing cue and enough measured coverage for the requested extraction
  window. Do not infer a real ending from a byte-capped prefix.
- **Extracted role:** verified stems cover the exact source interval selected
  for this queue occurrence.
- **Pair:** the outgoing tail and incoming head both have their required role
  evidence and pass current Sub/Beats pair/tempo policy.
- **Final Sub/Beats decision:** extracted evidence passes vocal activity and
  render checks before the pair is armed.

Represent head and tail independently. Missing one role must not erase or
invalidate the other. A missing Sub/Beats role should release that role to the
regular path; it should not trigger unnecessary Sub/Beats extraction for the
other end.

Give each stage a stable reason code, including candidate-not-matched,
grid-stale, head-cue-missing, tail-cue-missing, tail-placement-unproven,
window-too-short, source-changed, role-not-prepared, pair-tempo-rejected,
deadline-insufficient, extraction-failed, vocal-check-failed,
regular-role-ready, and ordinary-fallback. Keep human-readable logs tied to
track title/artist and role.

## 2. Screen candidates using shared grids and cues

1. Use the shared Beat This grid as the authoritative grid for this feature;
   do not revive legacy Librosa grids as fallback evidence.
2. Refresh head and tail outcomes independently for candidates that enter the
   screening flow. A successful head refresh with a missing tail is a partial
   result, not a fully current Sub/Beats record.
3. Derive or refresh cue candidates from the current grids and current source.
   Record each usable cue interval and its role. Do not require both roles for
   the track to remain useful.
4. Screen without Demucs. Candidates with no cue for the relevant role, no
   complete grid coverage, or no provable tail placement should leave the
   Sub/Beats role queue without stem extraction.
5. Keep the candidate scan bounded and resumable. Start with the current Dance
   Candidate population and report counts for head only, tail only, both, and
   neither; do not infer eligibility from genre counts alone.

This stage may still require downloading/decoding source audio for shared-grid
and cue work. It must not run Demucs or vocal measurement merely to classify a
candidate. Existing complete, current analysis can be reused; stale or
source-mismatched data cannot.

## 3. Split Sub/Beats preparation before and after selection

Refactor the current combined `prepareSubbeats` sequence into two explicit
parts:

### Before a pair is selected

- Validate source identity and current shared-grid provenance.
- Generate and save cue candidates and per-role grid/cue readiness.
- Do not separate stems and do not require saved Sub/Beats coverage for a role
  to count as a candidate.
- Release role-ineligible candidates to Regular Stem eligibility instead of
  leaving them reserved by the broad genre/BPM predicate.

### After a pair is selected

- Select the actual outgoing-tail and incoming-head cue candidates.
- Request only the exact stem regions needed to evaluate those candidates,
  including alternate cues only when the same bounded extraction covers them.
- Reuse verified saved Sub/Beats stems if they match the current source,
  separator/model version and requested intervals. Otherwise use the new
  pick-time extraction path; do not rely on the legacy standard stem cache.
- Measure vocal activity on the separated vocal stem and apply the existing
  Sub/Beats vocal, cue-conflict and render checks.
- Finalize the Sub/Beats decision only after those checks complete.

The vocal measurement remains based on the isolated vocal stem. Moving it to a
whole-track stage with the current algorithm would require whole-track stem
separation and would defeat the extraction savings. The pick-time extracted
regions provide the needed input without a second separation pass.

## 4. Route the pair to Sub/Beats, Regular Stems or ordinary transition

Change pair routing so a broad `subbeatsEligibleTrack` result cannot by itself
block Regular Stem Blend:

1. Try Sub/Beats only if this pair has role-specific head/tail grid and cue
   evidence, plus the existing Sub/Beats pair rules.
2. If either required Sub/Beats role is absent, stale, unextractable, or fails
   its final vocal/render check, pass control to Regular Stem Blend.
3. Regular Stem Blend independently checks its shared-grid provenance,
   eight-bar/native-tempo windows, complete matching source, the vanilla
   3%-with-half/double-equivalent tempo gate, and its own deadline. It must not
   consume Sub/Beats cues or declare Sub/Beats readiness to be regular role
   readiness.
4. If Regular Stem Blend is admitted, request its own exact CPU windows using
   its existing pick-time contract. Reuse an extraction only when source,
   interval, separator settings and output provenance are identical.
5. If neither path reaches a verified render before the deadline, choose the
   ordinary transition with the most specific available reason.

This replaces the blanket candidate-level Sub/Beats reservation with
role-specific routing. Preserve the existing Sub/Beats tempo rules and
transition style; this plan does not force a drums-late style or alter random
style selection. Pair compatibility remains distinct from track-level
eligibility.

## 5. Pick-time extraction and safety contract

Use the existing regular pick-time extraction foundation where possible, while
keeping Sub/Beats cue planning and outputs distinct:

- CPU-only separation for these pick-time jobs, including on GPU-equipped
  analyzers; do not load or run a GPU model for this path.
- Explicit source bounds for each role, with bounded CPU threads/concurrency
  and no uncontrolled whole-track separation.
- Complete-source and current-source identity checks remain mandatory unless a
  separately designed and validated range-extraction contract proves the same
  identity and true tail placement. A truncated download cannot establish a
  track ending.
- Validate requested samples, finite stem arrays, actual output coverage and
  completion metadata before accepting a result. Publish completion last.
- Key reuse to recording identity, exact interval, separator/model version and
  queue generation as applicable. A matching track ID alone is insufficient.
- Reuse a verified existing Sub/Beats region only when its provenance matches;
  never treat old standard stem-cache presence as readiness.
- Retain temporary files only for the active playback/queue working set and
  clean stale outputs after active jobs and mixer references release them.
- On timeout, source change, malformed output, worker failure or queue change,
  reject the Sub/Beats result and re-evaluate Regular Stem/ordinary fallback.

The Sub/Beats and Regular Stem Blend paths should share worker primitives and
CPU/resource limits where possible, not a semantic readiness flag or an
unverified cache. Preparation completion must re-check the exact live queue
occurrence before rendering; a late job may finish but cannot arm a stale pair.

## 6. Migration and compatibility

- Preserve V1 alongside the separate V2 preparation store. The owner's latest
  instruction supersedes the earlier clean-reset approval: do not discard or
  overwrite V1 cue, eligibility, coverage, prepared stems or supporting evidence.
- Keep shared Beat This grids, library metadata and unrelated analysis. V2 can
  read source-matching shared evidence; newly measured comparison grids remain
  in V2. Leave old standard stem-cache files untouched.
- Version the new role-readiness and pick-time evidence. Old broad eligibility
  rows are candidate hints only until refreshed; do not silently reinterpret
  them as current head/tail readiness.
- Make preparation resumable so existing library analysis and source data are
  not needlessly repeated. Refresh only the grid/cue facets required to settle
  missing or stale roles.
- Keep ordinary playback available throughout migration. A missing or failed
  Sub/Beats job must never hold the queue past its normal handoff deadline.
- Confirm the exact crossover policy while integrating with the current
  Regular Stem admission. This plan releases role-ineligible candidates to the
  regular path, but should not silently introduce a new mixed-mode renderer
  for a pair that was previously configured to use an ordinary transition.

## 7. Diagnostics and operator visibility

Emit per-track role states and per-pair decisions, distinguishing:

- broad candidate vs usable head/tail role;
- grid/cue screening vs extraction pending/complete;
- vocal-check result vs final transition verdict;
- Sub/Beats release reason and whether Regular Stem Blend accepted the pair;
- queue wait, extraction time, vocal-check time and remaining handoff budget.

The Mixing Desk can later display concise current/next role and pairing status
using the existing header icon proposal. This plan requires a stable status
contract first; it does not require redesigning the UI as part of the first
backend implementation.

## 8. Focused validation

Add targeted tests alongside each stage, keeping the initial test set small:

- Candidate genre/BPM match with no cues is not Sub/Beats-ready and is released
  to Regular Stem policy; it does not invoke Demucs during screening.
- Head-only and tail-only evidence are preserved independently and can supply
  only their matching transition role.
- A stale grid, changed source, missing tail placement, incomplete source,
  insufficient bars, or too-short extraction cannot be reported ready.
- Current cue/grid evidence with no saved stem coverage can reach pick-time
  extraction; matching saved coverage can be reused without another
  separation.
- Pick-time job requests exact regions and CPU, and rejects wrong device,
  incomplete coverage, invalid output and stale queue generation.
- Vocal activity is measured after extraction and before final Sub/Beats
  render admission; a vocal failure releases to Regular Stem policy.
- Regular Stem fallback applies its own 3% half/double-equivalent BPM rule and
  exact role-window/source requirements. Missing evidence falls through to an
  ordinary transition with an explicit reason.
- A pair is re-evaluated after asynchronous work; deadline expiry, skip,
  reorder, source replacement or worker failure cannot arm a stale seam.
- Current valid Sub/Beats saved artifacts remain reusable, and legacy cache
  files remain unchanged and ignored.

Use a few contrasting real tracks from the recently played test-station set
that have already passed through the shared-grid analyzer: Sub/Beats-ready at
both roles, head-only, tail-only, neither, and at least one non-Dance-Candidate
regular Stem Blend case. Exclude the previously identified unsuitable track.
Listen to any resulting transitions; technical checks alone cannot establish
that vocal overlap or the musical result is acceptable. Do not run a
library-wide Demucs pass.

## Implementation order and completion gates

Follow the revised seven-step V2 action plan at the top: preserve and inventory
V1; add separate V2 storage; implement grid/cue prep; validate on a small set;
review the owner-prioritized Compilations cohort; then review the wider
supported population and scanned negatives before passing owner review of prep
parity and resuming pick-time integration and station listening.

Do not remove the Sub/Beats tempo/pair checks, relax source-completeness or
tail-placement guards, force a transition style, run whole-track Demucs just
for candidate classification, or delete old caches as part of this work.

## Open implementation details

- Confirm which existing Sub/Beats cue alternatives the current vocal check may
  select after extraction, so the worker requests exactly the regions needed
  without extracting the entire track.
- Decide whether failed Sub/Beats vocal checks should always offer the same
  pair to Regular Stem Blend or only do so when its independent pair policy
  passes. Recommended default: always evaluate regular policy; it may accept or
  reject independently.
- Confirm the current crossover setting/behavior against the integration
  baseline before enabling a mixed Sub/Beats-to-Regular renderer. The role
  release should not change an existing ordinary-transition rule without an
  explicit decision.
- Measure cold/warm CPU extraction times and establish a realistic cutoff
  before the queue handoff deadline; a job that cannot finish in time should
  release immediately.

## Stem Beats preparation storage and entry points — 23 November

The development name for V2 preparation and future pick-time work is **Stem
Beats**. New persistent preparation data belongs under the shared stems root in
`stembeats/`; regular Stem Blend data uses `stemblends/`. V1 data and its
existing preparation queue remain in their current locations and are not
rewritten by V2.

The V2 store writes new runs and source-bound grid artifacts to
`<stems-root>/stembeats/runs/`, alongside `tmp/` and `pick-time/`. It still
reads runs from the former `<stems-root>/stembeats/prep-v2/` and
`state/subbeats/prep-v2/` locations so existing comparison work remains
available. Temporary downloaded recordings are removed from
`<stems-root>/stembeats/tmp/` after each job. Cache sizing, sweeping, orphan
cleanup and Sub/Beats cleanup treat the feature directories as reserved
namespaces, never as track folders.

V1-backed batch runs retain their immutable V1 snapshot for explicit
comparison. A fresh library-analysis run uses the existing Dance Candidate
discovery rule (90–180 BPM and a dance-family genre), without extending its
scope from saved V1/V2 results. It can start when no V1 queue exists. The
planned airplay queue is a separate single-track route into V2, not a manual
search action. The older records remain available through their explicit
comparison path and do not change fresh-user eligibility or scan behavior.
Library runs are capped at 20,000 recordings. Keep the current 2,983-track
comparison available until the fresh scan has been reviewed.

No station rebuild or PR update is part of this change. At the next station
rebuild, confirm the controller and analyzer both see the configured shared
stems root before starting V2 work; the previous station images had the
controller and analyzer mounted to `/media/ssd/stems` while the default root was
empty.

The first pick-time implementation step now reads source-bound V2 outgoing-tail
and incoming-head roles, retains the existing 8% Sub/Beats cue-tempo gate, and
plans exact bounded stem windows for the selected cue pair. A versioned
CPU-only analyzer contract writes those windows under a temporary
`stembeats/pick-time/` workspace with its own marker and completion evidence;
the workspace protects an analyzer job after a client timeout and removes
completed files after use. A pair staging coordinator now acquires complete
source leases against each V2 SHA-256/size fingerprint, extracts both windows,
and holds their source and workspace leases through rendering. The pair-drain
path now prefers this route when both V2 roles and a bounded pair plan are
available. A separate V2 render request verifies the completion stamps and
complete source hashes, then reuses the existing vocal-conflict assessment,
native-tempo return and lossless seam checks without reading V1 bundle data.
The V1 route remains a comparison surface; live pair drain does not fall back
to V1 bundles when V2 has no usable pair plan. The original synthetic CPU render
passed inside the analyzer image, including source verification, V2 window
loading, vocal assessment and lossless clip publication. The owner subsequently
confirmed two transitions on-air, then the 23 November review reproduced a
fractional-endpoint failure missed by that whole-second fixture. Follow the
current handover's recovery plan before further deployment or any PR update.
