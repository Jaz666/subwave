# Stem Blends and Sub/Beats handover

Updated: 25 November 2026. Start with the fresh-session handover below; older
dated checkpoints remain as historical investigation notes.

## Fresh-session handover — 25 November 2026

### Goal and guardrails

Continue the opt-in **New Style Stems** work: prepare Stem Beats evidence in
advance, then extract stems only when a suitable pair is picked. Vanilla
behavior remains available as **Legacy Stems**. Preserve that separation and
do not reintroduce the retired V1 Sub/Beats picker, queue, or renderer. The
V1 data backup was for comparison; its old runtime behavior is not part of the
current feature. Keep Regular Stem Blend admission independent, followed by
the ordinary transition when neither stems path succeeds.

The station has previously produced stable Stem Beats and Regular Stem Blend
transitions. Do not alter timing or eligibility based on speculation; new
audible issues require a measured example. The historical beat-alignment note
and Regular Stem coverage investigation below remain useful background.

### PR and working-copy state

Draft [PR #10](https://github.com/Jaz666/subwave/pull/10) remains on
`feat/subbeats-draft`; continue the existing draft rather than opening a new
PR. The handover-only update was committed as `922b36c34`. The next follow-up
adds focused New Style route coverage as `735104edc`. Query the PR for its
current head before starting another update. Recent feature commits are:

- `fde524803` — expose Stem Beats preparation stages/diagnostics and show
  pick-time extraction averages by Stem Blend and Stem Beats bar sizes.
- `4ec3a32f3` — add the **No Cues** cue-role filter to the Stems page.
- `eb8f769f0` — retire the old Sub/Beats route test file, whose assertions
  still targeted the removed V1 endpoints.
- `735104edc` — cover New Style route authentication, candidate reads,
  selected-run creation/progress/pause, metrics, and invalid selections.

The old attached development worktree at
`/home/jaz666/codex/pr10-integration-20261118` is still on `58a59a803` and has
substantial uncommitted changes. Preserve them. Do not push from that stale,
dirty worktree or copy its entire diff into the PR. A separate clean worktree
was used to update the PR head safely. The station checkout is
`/home/jaz666/Docker/subwave`, branch
`test-station/ordered-pr-union-20261118`, with committed HEAD
`107e4746e` (`feat(stems): filter tracks without cues`). It also has extensive
uncommitted station work. Keep those edits intact and inspect diffs before
selecting any further changes for the PR.

The PR currently includes the three commits above; it does **not** include the
whole uncommitted GPU/provider investigation and pick-time work present in the
station and development checkouts. Treat those as separate work until reviewed
and verified. The earlier instruction to keep work off the PR was followed
until the owner later explicitly asked to update PR #10.

### Latest verification and known gap

On the clean PR worktree, the V2 prep-store tests passed (9/9),
extraction-metrics tests passed (2/2), the new New Style route tests passed
(4/4), and controller and web TypeScript typechecks passed. The host Python
environment lacks NumPy, so the analyzer prep Python unit test was not runnable
there. The old route suite was retired because 23 of 26 assertions exercised
V1 endpoints that are intentionally gone. The replacement covers auth,
candidates, selected-run creation/progress/pause, metrics, and invalid
selections; retry-failed and full library-scan route behavior remain uncovered.

Live station checks on 25 November:

- Controller container ID `2a6c501a09c3`, image digest
  `sha256:3a9d72160f218e2faa5bf6ff01c133fffdb38e6cc266ba736341fe8d0617eb26`;
  its in-container `GET /health` returned `200 {"status":"on-air"}`.
- Web container ID `a0384879483e`, image digest
  `sha256:f250d90ffa147e0abe59e3cca3f329260ca39e5cf7736e2c49c5d79eb5c0e443`.
  `GET /admin/library/stems` returned HTTP 200 and its loaded page chunks
  contain “No Cues”, “Cue role”, “Pick-time extraction”, and the prep-stage
  label. This confirms those assets are served; no browser-control tool was
  available to test actual clicks or visually inspect the rendered panel, so
  the `B.counts is undefined` fix still needs an interactive check.
- All Compose services were running. Image tags are `latest`; the digests do
  not identify the exact source revision. Station source is committed through
  `107e4746e` and has extensive uncommitted work. No new transition was heard
  or assessed as part of these UI/API checks.

### Suggested next actions for the new chat

1. Read this section and check the current PR head and station status before
   editing. Preserve the dirty station and development trees.
2. When browser access is available, interactively smoke-test the Stems page:
   verify **No Cues** returns cue-less tracks, other cue-role filters still
   work, run stages/metrics render, and the old `B.counts` panel error is gone.
3. Consider adding coverage for retry-failed and full library-scan route
   behavior; the current route tests cover selected preparation and pause.
4. Review the uncommitted GPU/provider and Pick-Time changes separately. Only
   after identifying their dependencies and station evidence should the owner
   decide which completed changes belong in PR #10.
5. Continue observing actual Stem Beats and Regular Stem Blend transitions
   before changing timing, gates, or extraction budgets.

The detailed 24 November checkpoint and earlier dated investigations follow.
They are historical context; use this 25 November section for current branch,
PR, and verification status.

## Historical checkpoint — 24 November 2026

The owner reports stable station playback of **both Stem Beats and Regular
Stem Blend transitions** following the 23 November deployments. Record this
as the listening confirmation for the deployed scheduling/window fixes and
longer tempo return. It is not a separate confirmation of every preview/status
edge case, and no new global beat-alignment offset has been introduced.
On 24 November at 04:30 UTC, the controller-only airplay-preparation candidate
was selectively integrated and deployed. At 11:06 UTC, the Library Run/Re-scan
controls and shallower V2 store path were integrated into the station checkout,
then the controller and web images were rebuilt and restarted. Controller
health is healthy and the web server is responding; broadcast and analyzer
retained their running images. PR #10 is unchanged.

Confirmed airplay now queues eligible tracks directly into V2 cue/grid
preparation, without touching the V1 queue or waiting in the sender. It uses
the existing Dance Candidate filter and requires both Stem Blends and Stem
Beats enabled. No new control or whole-track tempo-fit gate was added. Stem
extraction remains a later matching pick's work; it is never chained to this
first-use preparation.

- `subbeats-prep-v2-library.ts` owns automatic scheduling alongside existing
  explicit runs. The queue supplies current availability; immediate pair work,
  pending Regular extraction, grid refresh, force-send, library scans, quiet-only
  mode and cache maintenance defer new automatic analysis. Priority is checked
  again after source acquisition. Running requests are not preempted.
- Ordinary V2 run files persist the automatic backlog, grouped into a run to
  avoid creating thousands of per-track run files. Optional `airplay` and
  `expectedSourceBytes` fields preserve compatibility with previous V2 data.
  The async startup index tracks pending and terminal attempts. Replays do not
  hot-retry current positive, no-cue or failed results. Source byte-count changes
  and algorithm changes permit fresh work while keeping the older result.
- Restarts recover queued/interrupted automatic work when allowed, without
  resuming paused runs or unrelated explicit library/comparison runs. The
  existing per-job duration and average-preparation timing fields are retained.
- Existing V1 records and audio remain preserved for comparison, but Legacy
  mode now ignores the old queue during vanilla Library Demucs scans, does not
  seed that queue from airplay history, and does not start or recover the V1
  preparation worker.
  Legacy also hides the Sub/Beats and Stem Beats Library entries; the old
  workspace and V2 preparation page are available only with Stems enabled in
  New Style. Shared beat-grid upgrades and wider Regular grid measurements are
  also New Style-only; Legacy keeps the vanilla analyzer and existing grid
  data without scheduling these refreshes. New Style Library Run now offers a
  bounded preparation of missing or stale Dance Candidate results; Re-scan
  refreshes only tracks with a completed V2 result. Both are explicit user
  actions, limited to 20,000 tracks, and preserve earlier V1 and V2 results.
  The older standalone V2 page remains available for comparison and progress.

The V2 store now writes beneath the configured stems root at
`<stems-root>/stembeats/runs/`, with short-lived source downloads under
`stembeats/tmp/` and pick-time windows under `stembeats/pick-time/`. Run and
cue/grid artifact data is persisted in the V2 files; each prepared track's
shared beat grid is also written to the library database for the normal
pick-time readers. Temporary complete recordings are removed after analysis.
The store continues to read the former `stembeats/prep-v2/` and
`state/subbeats/prep-v2/` locations so comparison results remain accessible.

The new production-path regression uses the real now-playing hook (even with
the legacy airplay toggle enabled), source downloads, fingerprint validation,
V2 persistence/indexing and a fresh controller process for restart recovery,
with cue analysis supplied by a fixture HTTP analyzer. It verifies no
separation/render endpoint is used,
V1 queue bytes stay unchanged, no-cue/failed attempts deduplicate, a pause is
respected, priority can change during download, quiet-only blocks work, and a
new source version preserves the old result. A shutdown during download keeps
the job queued; it resumes in a fresh process without reclassifying it failed.
This does not measure real-model
cue quality, prep speed or audible transition quality.

Verification on 24 November:

- `npm test -- subbeats-`: 105/105 passed across 17 files. After adding the final
  database-shutdown guard and exercising the actual now-playing hook, the
  updated automatic-preparation regression passed again (1/1).
- `npm test -- regular-`: 40/40 passed across 17 files; shared drain, grid
  ownership and window/fallback behavior remain covered.
- `npm run typecheck`, targeted ESLint and `git diff --check` passed.
- Before deployment, the station controller `npm run typecheck` passed. Its
  controller-only image built as `subwave-controller:stembeats-followups-20261123`
  (`sha256:91d79239c31282d0de9188564e3696deb04637b533b4980ec61f8edc9abff3a5`)
  and health returned to healthy after startup. The analyzer and web images and
  broadcast container were not rebuilt or recreated. The controller retained
  the shared `/var/sub-wave` and `/var/sub-wave/stems` mounts.
- The broader run initially found a stale workspace-expiry test from the
  already-deployed preview work: expiring its old busy marker is insufficient
  while the 30-minute preview lease is valid. That fixture now verifies both
  retention during the preview lease and removal after its expiry. No workspace
  implementation was changed for that test correction.
- For the Library update, station checkout tests passed: Sub/Beats routes 22/22,
  V2 store and path compatibility 8/8, cache sweep 22/22, and orphan cleanup
  89/89. Controller and web type checks passed. After deployment the new
  controller health endpoint returned `on-air`; authenticated V2 run listing
  returned 9 historical runs, including the 2,983-track comparison run. The
  prior `/stems/stembeats/prep-v2/` data was not moved or rewritten.
- Controller image: `subwave-controller:stembeats-library-prep-20261124`
  (`sha256:3c96f34a963fef3df998a58efb88d4f3bb518c05cb8c97e465c196fc86498575`).
  Web image: `subwave-web:stembeats-library-prep-20261124`
  (`sha256:3c8559069cea9aecac2f3e71c0423948a12c038070fa3f717e4b9eda84a7b33b`).
  Rollback tags are `subwave-controller:rollback-stembeats-library-20261124`
  and `subwave-web:rollback-stembeats-library-20261124`. Key pre-deploy source
  files, image IDs and compose config are saved at
  `/home/jaz666/codex/station-backups/stembeats-library-run-20261124/`.
- No analyzer image build, real model/CPU timing measurement, complete package
  suite or new on-air audition was performed in this session. The controller
  startup also launched the previously deferred Legacy V1 child noted below.

**Next acceptance gate:** trial one eligible track with no current V2
preparation. Verify first playback is not held, its automatic cue job completes
with recorded duration, and a later compatible pick uses the saved V2 evidence
for extraction/rendering. Confirm no new V1 queue writes. Existing
preview/status edge checks remain a separate follow-up; do not reset
preparation or run the full population scan. Exact-window caching remains
deferred until measured station timings justify it.

The Library Run/Re-scan controls and new storage root are deployed. New V2 runs
write to `/var/sub-wave/stems/stembeats/runs/`; the reader still finds the
previous nested path and the state-directory legacy path. The station rebuild
did not start a Library Run, so the next acceptance gate is a small bounded Run
and Re-scan trial from the Library UI, confirming a new run writes at the new
path, stores the shared grid, preserves earlier results, and can be read by
pick-time. Keep this work off PR #10 until that station behavior is confirmed.

Development remains in `/home/jaz666/codex/pr10-integration-20261118`; changes
are intentionally uncommitted with the existing dirty work and remain off PR
#10. The pre-edit source snapshot for this follow-up is
`/home/jaz666/codex/dev-backups/stembeats-airplay-20261124T035749Z`.
A scoped runtime diff is saved as `controller-candidate.patch` in that snapshot
directory. The station source snapshot and controller rollback reference are
in `/home/jaz666/codex/station-backups/stembeats-airplay-20261124T042759Z`;
`subwave-controller:stembeats-airplay-rollback-20261124` retains the previous
controller image (`sha256:b5906cc0e81c28b94485ced86659af45b27bee3e0b7b647a5be06c59e43afb3c`).
The station's V2 store still admits algorithm-3 pick-time records alongside
algorithm 4. The deployment preserved the V2-only wrapper, 16-beat release,
previews, Sleeve Notes, Sub/Flow, Sub/Shows and controller-stall work. No
analyzer implementation or render policy changed.

## Historical checkpoint and action plan — 23 November 2026

### Scope, locations and owner decisions

- Development: `/home/jaz666/codex/pr10-integration-20261118`, branch
  `codex/subbeats-role-policy-station-20261120`. It contains extensive
  uncommitted implementation, documentation and new files. Preserve them.
- Station: `/home/jaz666/Docker/subwave`, branch
  `test-station/ordered-pr-union-20261118`, committed HEAD
  `10bcfaa92f14f1472d4c840539152d08a8ca5789` plus extensive uncommitted edits.
  HEAD alone does not describe the deployed candidate. Inspect the station
  diff before copying changes; recent Regular Stem fixes are not all present
  in the development worktree above.
- Use **Stem Beats** for V2 preparation and live rendering. Keep new feature
  directories under `stembeats/` or `stemblends/`. V1 remains comparison data;
  preserve its records and audio. Do not use V1 bundles as a live fallback.
- The immediate goal is reliable Stem Beats transitions on-air using already
  prepared V2 tracks. Cue outliers and broader preparation refinements are
  deferred. Avoid new whole-track tempo-fit gates or broader eligibility rules.
- Preserve independent Regular Stem Blend assessment after Stem Beats
  declines, then ordinary pair-aware crossfade. Do not combine the two
  renderers. Regular retains its shared-grid 3% tempo gate, including the
  existing half/double-time handling; Stem Beats retains its 8% cue-tempo gate.
- Keep a broader Mixing Desk redesign for another session. The planned Admin
  Dashboard follow-up is the narrower correction of V1 labels/readiness and
  previews so they describe V2 and Regular pick-time behavior accurately.
- Preserve Extended Sleeve Notes, Sub/Flow, Sub/Shows and the separate
  controller-stall fix during future integration/rebuilds. The original
  station-control/UI stalls predate this work and are being handled separately.
- No PR changes or pushes were made during this review. Leave this handover
  and the implementation uncommitted locally until the owner resumes the
  agreed development/integration workflow; do not publish the dirty tree.

### Progress and deployed state

The algorithm-3 comparison run `19562385-c3f5-4622-9782-a3e3ff2eca6b` finished:
2,979 complete jobs, four failed jobs, none queued/running, from 2,983 baseline
recordings. Counts are historical comparison evidence, not proof that every
cue is musically suitable. The owner prioritized sustained-beat dance tracks
from five Navidrome Compilations folders and reviewed selected cues. See the
[population/cohort report](../investigations/2026-11-22-subbeats-v2-population-comparison.md)
for membership, gains/losses and listening notes. Do not restart the full scan
or let its unresolved outliers block the live transition work.

V2 role selection, bounded CPU stem-window extraction, complete-source leases,
vocal checking, tempo release and lossless handoff rendering are connected to
pair drain. The live attempt uses V2 evidence and does not consult V1 bundles.
The owner confirmed two Stem Beats transitions before the latest rebuild.
One had a small audible beat offset while both drum parts were audible;
its cause remains unmeasured. Do not apply a guessed global timing correction.

Recent controller work gives V2-ready pairs priority, reserves extraction and
render time before optional intro speech, propagates cancellation and logs
phase timings. The subsequent Regular Stem fix keeps selected eight-bar
windows at least 1 ms inside the rounded measured-grid endpoint, searching
earlier tail spans when necessary. Its reported focused verification was 34
Regular Stem checks plus the controller typecheck; this is prior-session
evidence, not a fresh test run in the review below.

Before the scoped fix below, the controller was rebuilt/recreated at
**17:28 UTC on 23 November**. Image ID:
`sha256:20148bba36ab07ab1c2c3fde3fd68820d9df2cae3eebd349f79b451a4d3b78a5`.
The analyzer remained on `subwave-analyzer-stembeats-picktime:local`, image ID
`sha256:78e76b33a5e0f236e8e4aeb8b237835756c5a9e144f44b9b2c784f4bb1c6f135`.
Broadcast and web were not rebuilt by that controller deployment. Both
controller and analyzer see the host's `state/stems` at
`/var/sub-wave/stems`; retain this shared-root mapping at the next deployment.
To roll back a future scoped fix, retain these image IDs and the pre-change
source diff rather than resetting the station checkout to committed HEAD.

### Recent live failures and confirmed review findings

| UTC, 23 November | Pair | Observed outcome |
| --- | --- | --- |
| 17:28–17:29 | What's Up → Ecuador | Recovered pair had about 64 seconds; aborted during tail extraction, total about 65 seconds. |
| 17:31–17:32 | Ecuador → Tha Wildstyle (klubbheads remix) | Both extractions completed in 60.5 seconds; render started with 58.9 seconds remaining, then returned HTTP 422 after about 3.4 seconds. |
| 17:36–17:37 | Tha Wildstyle (klubbheads remix) → Lift Me Up (THK club mix) | Both extractions completed in 34.8 seconds; render started with 85.1 seconds remaining, then returned HTTP 422 after about 3.1 seconds. |

Regular fallback reported no admitted pair/role windows after these attempts.
The show was finding candidate pairs; lack of recently aired transitions does
not establish a lack of compatible picks. The controller's generic renderer
message initially suggested contention/timeouts, but HTTP 422 is an explicit
render rejection. Its exact reason was suppressed by the then-current transport.

**Confirmed endpoint regression:**
`controller/src/music/subbeats-picktime-extraction.ts` clamps extraction ends
to `floor(source.durationSeconds * 1000)`. In contrast,
`controller/scripts/subbeats_live.py:render_live_v2` requires the outgoing end
to equal `ceil(plan.out_end * 1000)` and subsequently requires coverage through
the complete outgoing recording in samples. Ecuador's saved duration is
353.1290702947846 seconds: extraction ends at 353129 ms, while rendering
requires 353130 ms. Retained windows for What's Up, Star to Fall and Tha
Wildstyle show the same 1 ms disagreement; Call on Me's millisecond-aligned
duration does not. This guarantees rejection at that check for affected
windows, but does not establish the cause of every historical HTTP 422.

The review reproduced `ValueError: Stem Beats windows do not cover the selected
transition plan.` using the existing synthetic integration fixture with a
fractional duration (180.123456 seconds) and the production extraction clamp.
The existing whole-second 180-second control rendered successfully. Both ran
in disposable, network-disabled containers using the station analyzer image,
without station volume mounts or models. They did not render station audio,
change station data, or establish audible alignment. No source fix, rebuild,
full package test suite or new listening confirmation followed this review.

### Ordered next steps

**Implementation checkpoint, later on 23 November:** steps 1–2 below are now
implemented in the development worktree and selectively deployed to the
station at **18:20 UTC** (details below). They remain off the PR. The production-planner regression first failed because whole-ms
rounding lost 20 real samples from the synthetic tail, then passed after the
fix. Window transport retains fractional milliseconds at exact 44.1 kHz
sample positions. The TypeScript planner now matches Python's absolute-sample
subtraction and half-to-even rounding. The analyzer uses decode-from-zero
sample counting for Stem Beats, requires the exact decoded length, and keeps
the Regular extraction path's existing behavior. The renderer checks sample
endpoints and never pads missing source audio.

Controlled coverage/source/vocal/timing failure codes now survive the worker,
sidecar service and local/HTTP controller transport. Busy, deadline and
cancellation reasons remain distinct; arbitrary errors/URLs are not echoed.
V2 cancellation cleanup now removes its actual `.stembeats-` scratch prefix.
The existing render/deadline limits have not been increased.

Validation so far: the full isolated audio check passed with real decoding,
window files, completion evidence and rendering at 180 seconds, and at
180.123446712 seconds with native and adjusted tempo. It checks extracted drum
samples against the original decoded source exactly and rejects shortened
coverage and a changed source. Only the separator is replaced by a fixture;
this does not test real Demucs quality or establish on-air alignment. All 40
facet checks and 19 live/transport checks pass. Two stale test fixtures were
updated for the required shared grid and the trailing timing-summary log;
the assertions still check the actual failure and publication behavior.
Final local verification:

- `npm test -- subbeats-`: initial broader run passed 102/103; the remaining
  failure was an existing assertion that expected the fallback to be the last
  log line, before the timing summary was added. After correcting that fixture,
  `npm test -- subbeats-live` passed all 19 live/transport checks. The complete
  16-file group was not rerun after that fixture-only correction.
- `SUBWAVE_STEMBEATS_TEST_IMAGE=subwave-analyzer-stembeats-picktime:local npm
  test -- analyzer-stembeats-window`: 2/2 passed, including the three real-audio
  cases in a disposable container with no station mounts/network/models.
- `SUBWAVE_PYTHON_TEST_SUITE=analyzer_facets_test.py npm test -- analyzer-python`:
  all 40 facet cases passed, including strict Stem Beats source-end handling
  and the unchanged Regular extraction cases. The fixture now supplies a
  deterministic shared tracker instead of depending on an optional grid.
- `npm run typecheck`, targeted ESLint on changed TypeScript/test files,
  schema-mirror generation and `git diff --check` passed.
- Additional check: `SUBWAVE_PYTHON_TEST_SUITE=analyzer_downbeat_test.py npm
  test -- analyzer-python` still has one pre-existing inference-error wording
  failure. The fixture expects “required Beat This beat grid is unavailable”
  but the failing tracker raises “bad chunk”; the grid still fails closed.
  The test file and `measure_bar_grid`, `bar_grid`, `get_downbeat_tracker` were
  compared against HEAD and are unchanged. The real-model case skipped because
  its host dependencies/model were unavailable. This issue was not changed
  as part of the Stem Beats fix.

No full package suites, real Demucs extraction or new station listening were
run for this candidate. The implementation, fixtures, generated mirror and
documentation remain deliberately uncommitted locally with the existing work.

**Station deployment, 18:20 UTC on 23 November:** the nine scoped source files
were selectively integrated and both controller and analyzer replaced. The
station's V2-only live wrapper, Regular render-style checks, extra Regular
compressed-audio recovery, queue scheduling and unrelated dirty edits were
preserved. Source hashes confirm no unrelated dirty file changed. The source
and environment retain Extended Sleeve Notes, Sub/Flow, Sub/Shows and the
separate controller-stall work. V1 data was not changed by this deployment.

- Controller: `sha256:d7679d749dff243e29dccfd0735a051f26f2094d65e33287595f9ebf95884369`,
  also tagged `subwave-controller:stembeats-samples-20261123-181344`.
- Analyzer: `subwave-analyzer-stembeats-picktime:samples-20261123-181344`,
  `sha256:406719a5259a3a7e07cefd3aa962118949df5fb5da31c5e988c202ac5f35b45c`.
  It derives from the previous GPU analyzer with only the worker, handoff,
  live-render and sidecar-service scripts replaced; dependencies/models are
  unchanged. Its retained Dockerfile is in the backup directory below.
- Controller is healthy; analyzer `/health` reports `ok`, Regular windows v2
  and Stem Beats windows v1. Beat This loaded and its worker is ready. All
  scoped deployed source hashes match the station checkout. Compose environment
  values and shared `state/stems` mounts were unchanged, including GPU access.
  Broadcast and web retain their original container IDs/start times.
- Fresh station checks: typecheck, targeted ESLint and `git diff --check` passed;
  extraction 3/3, pair planner 4/4, live/transport 19/19, isolated analyzer
  audio/acknowledgment 2/2 passed. The audio check also runs the existing
  sample-counted decoder fixture; all three real-decoding/render cases pass.
  An existing station V1-veto test was corrected to inspect the fallback log
  rather than the later timing summary. Its V1 exclusion assertion is intact.
- Rollback source copies, pre-change diff, dirty-source hashes, both previous
  image tags, deployed hashes, build context and Compose overrides are retained
  at `/home/jaz666/codex/station-backups/stembeats-sample-boundaries-20261123T181344Z`.
  Previous image tags are `subwave-controller:rollback-stembeats-samples-20261123`
  and `subwave-analyzer:rollback-stembeats-samples-20261123`. To roll images back,
  use the station base/GPU/Discord Compose files plus that directory's
  `rollback-images.override.yml`, with `up -d --no-deps --no-build --pull never
  controller analyzer`. Do not reset the dirty station checkout.
- The active analyzer override is `/tmp/stembeats-analyzer-image.override.yml`;
  a durable copy is `analyzer-candidate.override.yml` in the backup directory.
  Use that candidate override for subsequent analyzer recreations. Origin and
  fork refs were fetched; neither was merged into the station candidate.

Playback continued after deployment, with no new Stem Beats attempt observed
in the initial checks. The owner confirmed a return to normal programming;
a new compatible pairing is unlikely for the next hour. On-air success and
alignment remain unverified for this fix. Leave this candidate running while
working on the independent Regular fallback locally; do not invent a test
pair or wait an hour polling for one. No PR changes or pushes were made.

**Latest station observation, 23 November:** the owner has since heard Stem
Beats transitions on the deployed sample-boundary candidate and reports no
mismatched beats. An earlier transition had a small offset, so keep that
observation as a separate unresolved report rather than assuming a timing
correction is needed. The owner has now also confirmed that the next Stem
Blend aired fine. This clears the listening gate for selectively integrating
local steps 3–5.

**Local step 3 follow-up, later on 23 November:** independent Regular fallback
is now implemented locally and is **not deployed**. `queue.ts` records V2
refusal for the actual outgoing/incoming queue objects, releases that pair's
preparation deferral, and yields to Regular preparation only within the existing
handoff runway. Wakeups do not retry V2 for that occurrence. Force-send bypasses
preparation waiting and does not start fresh preparation. An expired clock,
independent tempo rejection or queue cancellation goes to ordinary audio.

`RegularStemRuntime` keeps deferred pairs admitted and retains their selected
working windows, so verified files remain usable. Each later V2 pair also
keeps its own extraction deferral. The immediate V2 pair pauses new jobs in the
Regular lane; jobs already running remain non-preemptible under the existing
lease rules. Single-owner grid refresh and protection from already-running or
unrelated work still need step 4; complete two-sided window validation still
needs step 5. No new timing limit, renderer mixing or eligibility gate was added.

The new `regular-stem-v2-fallback.test.ts` uses saved V2 cues/artifacts, the real
queue, real Regular runtime/admission/source leases, HTTP preparation stamps
and the real Regular renderer transport. Only separation/render audio and the
V2 refusal are fixtures. It reaches an armed Regular transition, verifies one
V2 attempt across preparation wakeups, and checks short deadlines, incompatible
Regular tempo, force-send and cancellation. The runtime checks also prove
verified windows survive deferral and later V2 pairs do not start early.
The Regular group passed 37/37 and the complete Sub/Beats group now passed
103/103. This is controller/runtime contract evidence, not new on-air listening
or real Demucs/render quality evidence. Local typecheck, targeted ESLint and
`git diff --check` passed. Both enhanced runtime checks and the new fallback
check were rerun successfully after their final fixture adjustments. Keep
step 3 local while steps 1–2 await the next
suitable on-air pair; no second station rebuild was made for this follow-up.

**Integration caution:** the development checkout still contains its older
V1 live-fallback branch, whereas the station had that branch removed during
testing. It also differs in Regular grid/preparation scheduling. Apply only
the scoped sample-boundary, extraction and error-reporting changes to the
station version; do not overwrite `broadcast/subbeats.ts`, `queue.ts` or
`analyzer.ts` wholesale. The steps 1–2 deployment included both controller
and analyzer, including `subbeats_handoff.py` and the sidecar service helper;
future Python changes must also reach the analyzer image. The local step 3
follow-up changes controller scheduling/runtime only. Preserve the existing
testing features and keep V1 data untouched.

**Local steps 4–5 follow-up, later on 23 November:** the grid-ownership and
complete-window changes are implemented locally and **not deployed**.
Queued unsent Regular tracks belong to the complete-source refresher; the
generic refresher still handles other tracks and stations with Regular
disabled. Existing generic work settles before Regular takes over. The
immediate V2 pair and force-send defer new grid jobs as well as the Regular
extraction lane. A priority change during source acquisition or head repair
prevents the next grid request from starting; completed measurements remain
reusable. Running requests are not killed. A real-queue regression reproduced
the original duplicate ownership before the fix and now checks phase deferral,
force-send, feature-off behavior, enabling Regular during an existing generic
request, and preservation of wider tail coverage.

Regular window planning now requires both valid roles before scheduling
either extraction, including full incoming coverage of the outgoing duration.
The station's conservative rounded-EOF selection fix has also been retained
in this development version and pinned by a regression. Current head grids
with too few measured markers can receive a grid-only 60–120 second repair
from source zero. This uses a new optional `head_grid_seconds` field through
the controller, sidecar and worker, and preserves saved musical metadata.
Complete bounded coverage with no usable span does not hot-loop. An older
analyzer ignoring the new field is rejected on insufficient returned coverage;
the eventual deployment must include both controller and analyzer.

The queue timing fixture previously supplied only one head bar while testing
tempo compatibility. It now supplies a genuine covered eight-bar head, so the
test continues to isolate tempo/deadline behavior. Separate tests cover the
short-head repair and bounded no-cue case. The sidecar contract checks the new
field, and the numerical facet checks cover source-zero placement, incomplete
audio and invalid requests. Isolated analyzer-image validation additionally
uses real file decoding through the new head path, replacing only the tracker
with deterministic measurement evidence; this does not assess real-model
bar-detection quality or on-air alignment.

Final local verification for steps 3–5:

- `npm test -- regular-`: 40/40 checks passed across 17 files, including
  queue ownership, complete pair admission, short-head repair and bounded
  no-cue coverage.
- `npm test -- subbeats-`: 103/103 checks passed across the shared queue,
  analyzer and Stem Beats routes.
- `SUBWAVE_PYTHON_TEST_SUITE=analyzer_facets_test.py npm test --
  analyzer-python`: 42 facet checks passed. The sidecar contract test also
  passed with the new `head_grid_seconds` field.
- `SUBWAVE_STEMBEATS_TEST_IMAGE=subwave-analyzer-stembeats-picktime:samples-20261123-181344
  npm test -- analyzer-stembeats-window`: 2/2 passed. This includes real file
  decoding through the wider head-grid path and three synthetic renders; only
  the bar tracker and separator are fixtures. It does not establish real-model
  cue quality or audible alignment.
- `npm run typecheck` and `git diff --check` passed. Targeted ESLint reported
  zero errors and one existing `no-explicit-any` warning in
  `scripts/regular-stem-queue.test.ts:33`.

At this local checkpoint the changes were held for the sample-boundary
candidate's listening assessment. The later selective station integration is
recorded below; preserve unrelated dirty files and do not copy the development
queue/analyzer files wholesale into the integration checkout.

**Selective station integration, 20:35 UTC on 23 November:** after the owner
confirmed Stem Beats aired without mismatched beats and a Stem Blend aired
fine, local steps 3–5 were integrated as scoped hunks in the dirty station
checkout. V2 refusal now releases the Regular pair and holds the drain until
both windows are ready; a declined pair is not retried. Shared grid refresh has
one owner, queued Regular tracks use complete-source measurements, immediate
Stem Beats work defers new grid/preparation work, and both Regular windows are
validated before either extraction begins. Short head grids can request a
bounded 60–120 second grid-only measurement from source zero. The wider-head
request spans controller, sidecar and analyzer, so both images were rebuilt.

- Controller: `subwave-controller:stembeats-grid-ownership-20261123`, image
  `sha256:395c411d257361cc6aa19097b57c7b6f47d71f2d5766973f854ae8b0399ba33f`.
- Analyzer: `subwave-analyzer-stembeats-grid-ownership:20261123`, image
  `sha256:07dee94ff993ccd4c500b78e0411f29231ad29ae1d6d1403e3938b2441a1d52f`.
  Beat This, Regular windows v2 and Stem Beats windows v1 report ready. The
  analyzer image also passed the isolated fractional-window render check.
- Controller is healthy; `/health` reports Stem Beats windows v1 and Regular
  windows v2. Only controller and analyzer were recreated. Broadcast and web
  retained their prior containers; Extended Sleeve Notes, Sub/Flow, Sub/Shows,
  the controller-stall changes, shared `/state/stems` mapping and V1 data were
  preserved.
- Focused station validation: Regular 38/38, Sub/Beats 100/100, V2 refusal to
  Regular render 1/1, grid ownership/priority 1/1, focused analyzer facets and
  sidecar contract passed, analyzer image render checks 2/2, typecheck and
  `git diff --check` passed. Targeted ESLint had zero errors and one existing
  `no-explicit-any` warning in `regular-stem-queue.test.ts:33`. The broad
  Python harness has dependency-gated Beat This failures in the host test
  environment; the isolated changed facet suite passed with a test-only NumPy
  install.
- Rollback images, container inspection, source snapshot and Compose overrides
  are in
  `/home/jaz666/codex/station-backups/stembeats-grid-ownership-20261123T202758Z`.
  Use `rollback-images.override.yml` with the base, GPU and Discord Compose
  files to restore the pre-integration controller/analyzer images, without
  resetting the station checkout.

This deployed integration still needs an on-air check. The owner confirmed the
previous candidate behaved well; that does not yet verify steps 3–5 after this
rebuild. No V1 data was intentionally changed. The controller startup log still
contains `[scheduler] analyzer started (Sub/Beats)` and `Sub/Beats finished
(exit 1)`; defer log wording/ID cleanup as requested below. No PR changes or
pushes were made.

1. **Complete — unify Stem Beats sample boundaries.** Reproduce the fractional-endpoint
   failure in a permanent regression test, then carry one consistent source
   sample boundary through planning, extraction, completion evidence and
   rendering. Keep actual complete-source coverage authoritative. Merely
   allowing the 1 ms metadata disagreement would still leave missing final
   samples under the renderer's current coverage check. Check TypeScript's
   relative-time rounding against Python's absolute-sample subtraction too.
   Cover fractional source/cue times, source-end decoding and native/adjusted
   tempo. Do not pad or invent source audio to make the check pass.
2. **Complete — make render failures diagnosable.** Preserve safe structured reasons for
   invalid coverage, source mismatch, vocal conflict, unsupported timing,
   busy renderer, timeout and cancellation. The sidecar service currently
   collapses worker failures to 422, and `analyzer.ts` turns every non-success
   into the same busy/unavailable/budget message. Return bounded reason codes
   without exposing arbitrary subprocess stderr, URLs or credentials. Validate
   both sidecar and local renderer paths. This was implemented with step 1,
   deployed at 18:20 UTC, and passed the subsequent on-air listening check.
3. **Deployed — restore effective independent Regular fallback; on-air check pending.**
   `queue.ts:syncRegularStemPreparation` excludes a V2-ready pair from Regular
   admission, and `RegularStemRuntime.sources()` requires that admission even
   if files exist. After a Stem Beats failure, calling the Regular renderer
   therefore cannot rescue this pair. Make V2 priority a temporary deferral,
   release it on failure and assess a complete Regular pair under its own
   gates. Use valid ready windows when available; start further preparation
   only if the remaining deadline permits. Otherwise use ordinary crossfade.
   Test a real V2-ready failure through runtime admission, not only a mocked
   fallback renderer. Do not extract both renderers' windows concurrently.
4. **Deployed — restore grid ownership and protect the immediate pair; on-air check pending.** Recent
   `queue.ts` changes removed the generic refresh's exclusion for tracks owned
   by Regular preparation. The generic and extended head/tail refreshers can
   start for the same track and race their grid writes. Give each refresh one
   owner and defer unrelated analysis while the immediate Stem Beats pair
   needs its extraction runway. Verify retained wider coverage after either
   job completes. A legacy migration also ran at 17:29–17:30; its actual cost
   is unmeasured, so do not attribute the timeout to it without evidence.
5. **Deployed — validate complete Regular windows before extraction; on-air check pending.**
   `regular-stem-needs.ts` adds a tail need before confirming the incoming
   head and any required duration extension fit. Admit both usable roles
   together. A current head grid with some markers can still lack nine real
   markers; the current repair predicate only detects absent/stale/incomplete
   evidence. Refresh bounded head coverage when genuinely short, respect
   unusable/trimmed intros and require enough decoded incoming audio for the
   outgoing eight bars. Preserve backward tail selection before wind-down,
   source identity checks, tempo gates and explicit failure reasons.
6. **Prove the production contract, then listen for alignment.** Extend tests
   through production window planning/staging and the renderer, rather than
   constructing mutually compatible request metadata by hand. Keep the
   whole-second success case alongside fractional failures, deadline/queue
   cancellation and source-change cases. After scoped checks pass, integrate
   selectively into the dirty station tree and rebuild the services actually
   changed (analyzer image as well as controller when Python rendering changes).
   Preserve the other testing features. Confirm source acquisition → both
   extractions → render → armed → committed → observed on an actual pair.
   Compare extracted drum timing against original decoded audio and measured
   grids to investigate the owner's small offset before changing cue policy.

**Deferred:** exact-window reuse/cache tuning until successful timings justify
it; airplay-triggered single-track V2 preparation for first-time users (still
not wired); population cue outliers. The first-play path must do cue/grid
preparation only and leave extraction for a later matching pick. Do not chain
full V2 prep and Demucs into one first pick.

**Follow-ups deployed to the station, on-air check pending:**

1. **Longer tempo return — deployed 23 November.** V2 now returns to native BPM
   over 16 beats; V1 retains its existing 8-beat timing. The waveform preview
   derives its V2 beat period from the same 16-beat release duration.
2. **Controller diagnostics — deployed 23 November.** V2-facing messages use
   “Stem Beats”; legacy V1 attempts remain explicitly labeled as legacy. Known
   tracks are logged by title and artist, with IDs retained as a fallback. A
   configured playlist named `Sub/Beats Prepared Tracks` remains user data,
   not a stale feature label.
3. **Admin Dashboard status, Queue box, and previews — deployed 23 November.**
   The Mixing Desk now reports V2 incoming/outgoing role readiness from the
   independent V2 store, and marks a transition verified only for the current
   V2 pair. Regular Stem Blend remains separate. Preview requests resolve only
   the active V2 pair's extracted windows, use its recorded timing/evidence,
   and fail closed for stale or expired sources; normal V1 and Regular preview
   behavior remains separate. The Queue tooltip distinguishes reusable V2 role
   preparation from the current transition, and badges identify Stem Beats,
   legacy stems, and Stem Blend separately. Focused checks cover V2 preview
   selection and expiry, V2 role coverage, preview timing and existing queue
   behavior. One-role-unavailable, no-pair, Regular fallback, and rendered/
   verified states still need a live station check.

V2 preview workspaces are retained for up to 30 minutes for listening/audition,
and the dashboard will not serve them after expiry or if the pair is removed.

**Validation:** controller typecheck; `subbeats-prep-v2-pair` (4 tests),
`subbeats-live` (19 tests), and `stem-cache-coverage` (9 tests); web typecheck
and `stem-preview` (15 tests) pass. The analyzer image passed the three-case
Python live-render integration test, including fractional cue positions and
coverage/source-mismatch refusals. All three services report healthy; the
dashboard returns HTTP 200, and the controller resumed the queue and station
services. The 16-beat release and exact-pair previews still need an on-air
listening check. The controller-startup log still shows the leftover Legacy V1
stem-prep child exiting with code 1; this is separate from V2 rendering and
should be investigated only if it affects station behavior.

**Station preservation and images:** rebuilt from
`/home/jaz666/Docker/subwave`, keeping the `test-station/ordered-pr-union-20261118`
checkout, its dirty Extended Sleeve Notes, Sub/Flow, Sub/Shows, regular-stem,
beat-grid and controller stall-fix changes, and all station data. No reset,
clean, queue clear or V1 cleanup was done. The deployed images are
`subwave-controller:stembeats-followups-20261123`,
`subwave-web:stembeats-followups-20261123`, and
`subwave-analyzer-stembeats-followups:20261123`. The earlier custom images
remain tagged for rollback. Compose image override is saved at
`/home/jaz666/codex/station-backups/stembeats-followups-20261123/images.override.yml`.
PR #10 remains unchanged. Keep these separate from completed steps 3–5 and
their on-air confirmation. Do not redesign the Mixing Desk layout unless the
preview update requires a small adjustment.

**Immediate resume point:** steps 1–2 passed the owner's listening check, and
steps 3–5 are now selectively deployed. The owner has since confirmed Stem
Beats aired without mismatched beats and a Stem Blend aired successfully. The
three follow-ups are deployed to the station. Confirm the longer tempo return
and preview/status behavior on air before moving any of this to PR #10.
Do not repeat the population scan, widen time budgets to hide HTTP 422, reset
the station checkout, or update PR #10 as part of that work.

## Earlier investigation history

**Latest owner direction, 20 November — V2 prep first:** preserve the existing
V1 preparation work, including the reported 2,983 tracks supporting an incoming
head, outgoing tail or both. Implement V2 preparation with separate data and
artifacts and compare the two versions before returning to pick-time work.
This supersedes the earlier clean-reset permission. V2 must not overwrite,
invalidate, migrate or evict V1 records or artifacts. The detailed
[V2 action plan](2026-11-19-subbeats-eligibility-pick-time-preparation-plan.md#revised-action-plan--20-november-preserve-v1-prove-v2-preparation-first)
now controls the next work. This documentation update changes no runtime code,
station data or PR contents.

**Station trial update, 20 November:** the role-policy checkpoint was copied
selectively into `/home/jaz666/Docker/subwave` and the controller was rebuilt.
The controller is healthy. The station queue was not changed by the trial and
no Sub/Beats cache reset was performed. The operator confirmed the previous
pipeline completed a Sub/Beats transition in the preceding hour.

The operator manually queued `Everybody’s Free (to Feel Good)` (Rozalla) into
`Booyah` (Showtek). Both existing Sub/Beats bundles are marked prepared. The
Rozalla bundle still contains all four `exit-*.flac` files, but its old queue
record has no `cuePoints` or `cueCoverage`, and the live role check reported
`grid-stale`. The new policy requires both current grid evidence and saved cue
coverage; the existing exit audio alone does not satisfy that role check.
Regular Stem Blend also declined because its working windows were not ready.
The station played the ordinary transition into
Booyah; no stem render was logged for this pair and no audible stem join has
been confirmed. The Mixing Desk tail-grid icon reports shared library grid
suitability, not whether a Sub/Beats exit stem file exists.

This trial exposed the preparation/admission gap for older prepared entries;
it does not confirm the intended prepared-to-prepared Sub/Beats behavior. First
prove the separate V2 preparation against retained V1 results, then resume
pick-time work and station verification. No PR branch or PR metadata was updated.

**V2 station sample, 20 November:** a temporary controller/analyzer build ran
seven selected recordings in V2 storage under run
`3076adf7-eca3-40c1-8c87-e71865ba240e`. The sample covered Dario G’s
“Sunchyme,” Rozalla’s “Everybody’s Free,” Showtek’s “Booyah,” head-only and
tail-only V1 examples, a both-role example and a V1 negative. The controller
could not initially share its mode-0700 staged folder with the analyzer; after
opening traversal on that temporary folder, the run exposed two more request
edge cases, which were corrected locally and retried. The finished run is
persisted at `state/subbeats/prep-v2/runs/3076adf7-eca3-40c1-8c87-e71865ba240e/run.json`.

The results do not meet the V1 parity gate. Dario G and Rozalla each retained a
V2 tail but no incoming cue despite V1 supporting both roles. Rozalla’s tail
cues were about 1.85 seconds earlier than V1’s. Booyah produced a V2 incoming
cue but no tail cue, while V1 listed tail support. Lonyo’s V1 incoming cue and
CJ Bolland’s V1 outgoing cues were not reproduced; CJ Bolland had no complete
V2 shared grid. Hot Natured’s “Benediction” retained both roles; its incoming
cues matched within 0.006 seconds and its outgoing cues shifted about 4.1
seconds earlier. The V1 negative, J Majik & Wickaman’s “In Pieces,” remained
negative. No V1 queue bytes changed: its SHA256 remains
`48ca705b5a8257e314946005e936aacf62dda3243de4d5392908d43c4f38f1d8`, and it
remains paused. These are analysis comparisons only; the sample has not had
owner audio review. Do not begin the 2,983-track batch or return to pick-time
work yet.

After the sample, the station was returned to its original controller and
CUDA-analyzer images. Its controller is healthy, and the V2 run remains on the
station for review. The temporary override file and image tags were used only
for this validation. No PR branch or PR metadata was changed.

**V2 grid correction, 20 November:** the sample used existing role-windowed
head/tail grids, or refreshed those same partial windows. That did not give the
cue evaluator the full-recording context used by V1, and some short tail grids
also failed the minimum evidence length. V2 now predicts or reuses one
source-bound Beat This `small0` grid spanning the complete decoded recording,
assesses both roles against it, and stores it only in the V2 run artifacts.
It does not use the V1 Librosa incoming fallback as V2 timing authority. The
new algorithm version is 2, leaving the first station sample unchanged.
Focused analyzer tests, controller typecheck, V2 store tests, route tests, and
diff validation pass locally. The corrected build has not yet been tested on
the station; repeat the same seven-track sample, then compare role outcomes and
audio timing to the retained V1 record before extending the batch. Keep work
off PR #10 until station behavior is confirmed.

**Full-grid comparison follow-up, 20 November:** a new algorithm-2 run
`dabfb552-7060-468c-8f87-c7d52c2f1297` completed all seven recordings. The
fitted-grid cues on Sunchyme and Everybody’s Free matched their saved V1 cue
times exactly. Benediction’s incoming and outgoing cues also became cue-ready;
its outgoing endpoint is slightly later than the detected audible decay, which
the existing V1 fitted-grid algorithm allows while keeping it inside the
complete source. Booyah’s V1 tail, Summer of Love’s V1 incoming role and CJ
Bolland’s V1 tail still had no V2 cue. In Pieces remained negative. The full
grid corrected the first Sunchyme/Rozalla misses, but this is still not parity.

Algorithm 3 locally adds the established grid-based incoming fallback and
natural-finish tail path, both tied to the complete Beat This grid. Its request
schema was checked in the analyzer image, and a direct full-source request for
Sunchyme returned both roles. The controller-managed seven-track run
`8dd5f9ce-dada-4012-aa64-4ea7eaf3af7c` did not complete its first job, so it was
paused and the station was returned to the original healthy images. The V1
queue still hashes to
`48ca705b5a8257e314946005e936aacf62dda3243de4d5392908d43c4f38f1d8`, remains
paused, and has 6,423 jobs. No V1 records or artifacts changed. The controller
integration stall needs local diagnosis before another station run; do not
start the population comparison or update PR #10 yet.

**V2 transport and timing follow-up, 20 November:** local diagnosis found that
the V2 analyzer POST did not keep its request deadline active while consuming
the response body and did not opt into the stale keep-alive retry already used
by other analyzer calls. Both protections are now enabled locally; this is a
plausible integration-stall cause, not yet station-confirmed. V2 jobs also
record elapsed milliseconds, and the run endpoints report the mean over
completed recordings so bounded samples can establish a preparation-time
baseline. Focused tests and controller typecheck pass. The station remains on
its original images, and PR #10 remains unchanged pending another station run.

**V2 transport retest and station restoration, 20 November:** the corrected
controller-managed run `ceb928bd-2833-4678-9244-3aa2a3779ef9` completed all
seven recordings against V1 baseline
`23c521bfd9b93e58b11812d2787621f0b8b92991b1a14c28b1f081afb5f9b30c`.
Elapsed prep time totaled 247,113 ms: mean 35,302 ms (35.3 seconds) per
recording, with a 10.8–84.7 second range. This is a seven-track baseline, not
a population estimate. The per-job durations are persisted for future
comparisons and batch estimates.

Sunchyme, Everybody's Free and Benediction reproduced all saved V1 incoming
and outgoing cue positions exactly. Summer of Love reproduced its V1 incoming
cues and remained without a supported tail. Sugar Is Sweeter remained
incoming-negative and its first outgoing cue (257.460 s) was 0.016 seconds
from V1's first cue (257.476 s). Its alternatives differ: V1 also had 278.110 s,
while V2 offers 262.640, 247.160 and 236.840 s. Booyah had a V1-supported
outgoing role but no saved V1 cue-point set; its old suitability cue was
174.907 s. V2 offers outgoing cues at 167.860, 175.360, 182.860 and 186.600 s,
and incoming cues at 16.657 and 31.680 s despite V1's incoming role flag being
false. Review those Booyah passages and the Sugar Is Sweeter alternatives
against audio before treating the gained role or changed cue choices as an
improvement. In Pieces remained unsupported in both roles. The earlier
algorithm-2 positive-role losses are resolved in this sample, but this is not
the full V1 parity gate or production approval.

After the run, the temporary images were replaced with the station's recorded
pre-test GHCR controller and CUDA-analyzer images
(`ghcr.io/perminder-klair/subwave-controller:latest` and
`ghcr.io/perminder-klair/subwave-analyzer-cuda:latest`); the controller is
healthy. The station checkout's existing test branch and uncommitted changes
were left intact, including the Extended Sleeve Notes, Sub/Flow and Sub/Shows
work. No source reset or cleanup was performed. V1 remains paused and
unchanged; the V2 run remains saved separately. PR #10 remains untouched.

**Station stems-permission follow-up, 20 November:** after that restoration,
the controller logged analyzer `EACCES` errors while writing regular-stem
files. The track work directory was writable, but its per-window child folders
were root-owned mode `755`; the analyzer runs as UID 10001 and cannot create
temporary FLAC files there. The station checkout already has a controller fix
that explicitly makes each new child folder writable before dispatching work.
The controller was rebuilt from that existing test checkout, which also
restores its Extended Sleeve Notes, Sub/Flow and Sub/Shows changes. It is
healthy. The old failing folders are replaced when a new stem job is prepared;
that next job has not yet confirmed the fix in live use. No broad permission
change or source reset was made, and PR #10 remains untouched.

**Station commit/source mapping:** the station checkout is on branch
`test-station/ordered-pr-union-20261118` at `10bcfaa92`. Its committed
Regular Stem Blend chain runs from `2a7c80c68` through `10bcfaa92` and contains
the extraction-window, shared-grid/BPM and Mixing Desk status work. Station
`10bcfaa92` already corresponds to PR commit `e27150bb6` (wait for the pending
beat-grid upgrade); do not apply that fix again. The station's existing
uncommitted edits contain the equivalent work for local commit `6eb06324e`
(`fix(stems): separate Sub/Beats roles from regular admission`). Preserve and
review those checkout edits in place; do not cherry-pick `6eb06324e` over
them. Handover and plan commits are documentation and need no deployment.
These source edits were present in the checkout used for the latest controller
rebuild. Keep all unrelated dirty station files intact.

The controller integration-stall fix is also uncommitted relative to full
station commit `10bcfaa92f14f1472d4c840539152d08a8ca5789`. The running
controller image was built from that commit plus the fix, not from the bare
commit. Preserve that fix in any later rebuild or handoff; do not reset the
controller checkout to the commit alone.

**V2 population comparison, 20 November:** the owner confirmed the reviewed
algorithm-3 sample cues are fine. A station V2 run,
`19562385-c3f5-4622-9782-a3e3ff2eca6b`, was created from all 2,983 supported V1
records with baseline hash
`fc7b58f67197becfa20c7a30860aa5a8b3a537c6fbbd9669792d6f049d5b16c7`. At run
creation, the V1 queue was paused and matched that hash. On the first launch,
V2 reached its fallback path before resolving the analyzer backend, leaving
one job waiting without sending a sidecar request. The run was paused, the
controller restarted from its durable V2 state, and backend resolution was
added before V2 requests with a regression test. The recovered job then
completed through the V2 analyzer endpoint. After about an hour the owner asked
to pause and review. The durable run is paused with 167 complete, 1 interrupted/
running, 2,814 queued and 1 failed; mean prep time is 25.0 seconds (median 15.4)
across the 167 completed jobs. All 166 V1-supported incoming roles in this
sample remained cue-ready. For outgoing roles, 158 of 159 V1-supported roles
remained cue-ready. The one apparent V1-to-V2 loss is “Bells of n Y (House 2
House MIX)” by Slo Moshun: V1 has two estimated outgoing cues at 93.91 and
108.94 seconds, while V2 found no phrase reaching its ending criterion. Review
this against the source before deciding whether V2 should change. “When the
Lights Are Out (garage mix)” still failed to download as a complete source.

The V1 queue remains marked paused. The protected read-only archive contains
6,423 jobs and its queue hash remains
`48ca705b5a8257e314946005e936aacf62dda3243de4d5392908d43c4f38f1d8`. The current
queue has 6,434 jobs and hash
`b34799f938d9976ab20cd96bbfa8705068ab3580fdb42594f69fb7918c1aed59`; a
field-by-field comparison found 11 additions, with no removals or changes to
archive-existing records. All 2,983 V1 records captured in the V2 run still
match their saved V1 fields exactly. The original run baseline hash
`fc7b58f67197becfa20c7a30860aa5a8b3a537c6fbbd9669792d6f049d5b16c7` differs
from current queue bytes because of additions; the V1 snapshot guard checks
the saved fields and supported population rather than requiring whole-file
identity. New runs record whether their scope is the full supported population
or selected tracks.

The owner rebuilt the controller after old-style stem preview samples. The V2
route is present (unauthenticated requests return 401), and the controller is
healthy. The updated controller was rebuilt from the full station checkout,
including the preserved Extended Sleeve Notes, Sub/Flow, Sub/Shows, regular
stem and controller stall-fix edits. Focused route and store tests pass in both
checkouts; typecheck passes. The V1 snapshot check accepts the current queue,
whose eleven added entries are queued and unprepared; it finds no changed or
removed existing entries versus the protected archive.

After the owner said to proceed, the population run was resumed. **Overnight
checkpoint, 20 November 21:27 UTC:** 451 complete, 1 running, 2,530 queued and
1 failed. Mean prep time is 26.4 seconds (median 19.3) over completed jobs.
The one failure, “When the Lights Are Out (garage mix)” by Maceo Plex, still
has no complete source and has not been retried. At the observed mean, remaining
queued work represents about 18.6 hours of prep time before download and
scheduling overhead, so completion by morning is unlikely. The controller is
healthy and recent V2 requests continue to return successfully. Recent logs
also contain two missed `node-cron` execution warnings attributed to possible
blocking I/O or high CPU; the controller was using little CPU at the check,
while the analyzer was actively using about one core.

V2 state is under the root filesystem, with about 48 GB free; its run directory
currently uses about 69 MB. Stem storage is on `/media/ssd` with 159 GB free.
The separate protected archive drive has 31 GB free (97% used) and is not the
V2 state or stem-output target. Do not clean either volume as part of this run.
These remain in-progress results, not the final population average. The
Slo Moshun outgoing-role difference remains open for source review; do not
return to pick-time work until the full comparison and owner review are complete.

**Morning progress, 21 November 10:08 UTC:** the same run is still active with
1,996 complete, 1 running, 985 queued and 1 failed (about 67% complete). Mean
prep time is 27.8 seconds (median 20.7) over completed jobs. The failed Maceo
Plex recording is unchanged. All 2,983 saved V1 snapshots still match the
current queue; V1 remains paused. The protected archive still has no removed
or changed records, with 23 queued/unprepared additions since its capture.
Recent analyzer logs show successful V2 requests through 10:07 UTC. Based on
the observed overnight throughput, the remaining queue is roughly eight more
hours of work if that pace holds. V2 state uses about 80 MB; root has 48 GB
free, `/media/ssd` has 160 GB free, and the archive drive has 29 GB free.

**Upstream #2244 rebase review, 21 November:** reviewed upstream head
`13298fbc16161796983e6df8001260cac2810b81` against original #2244 head
`dc4bbbc44`, #2341 source `a03065cac`, and station commit `10bcfaa92` plus
its current source files. The original ten commits (nine from #2244 and the
shared-engine contribution) were rebased; the shared-engine contribution is
now `dbbf3d5c7`. Two additional commits are `d70777ab2` (licence documentation)
and `13298fbc1` (defer source hashing in the flat `analyze()` route until a
learned head or tail grid actually exists, retaining and cleaning up owned
downloads around that operation).

The inference engine `beat_this_grid.py`, provenance schema, model-export
script and parity script are byte-identical to the station copies. Both
Dockerfiles pin the same small0 model checksum. The newer whole-file loudness,
tail-curve and CUDA code was already in the station's shared upstream base
`62e7fdd9`; those relevant base files are identical at the PR's new base
`6301a7fa`. The sidecar mapping preserves the newer loudness/tail fields and
adds grid provenance. No changed inference, cue algorithm or provenance format
was found that requires repeating the ongoing V2 population preparation.

Verified upstream head in an isolated temporary source copy, using existing
development dependencies and temporary test state: `npm test -- analyzer-python`
passed (including the new hashing/cleanup regression); its downbeat suite ran
17 cases and skipped the real-model case. Other optional torch/pyloudnorm
cases also skipped because their dependencies were absent. `npm test --
beat-grid-provenance` passed all six cases, covering protocol mapping, database
reopen, replacement/reset, ID adoption and the nullable-column upgrade.
No image build, real-model comparison, GPU execution or listening test was
performed against this upstream revision. A fresh image smoke test is still
appropriate before claiming that exact revision works on the station.

The station intentionally includes local changes beyond upstream: required
shared grids on all tiers, stricter failure handling, pick-time refresh and
the Sub/Beats/V2 routes. Upstream retains opt-in/heavy-only grids and Librosa
fallbacks. These are pre-existing scope differences, not regressions from the
rebase; replacing the station image with the unmodified upstream image would
omit local functionality. This review made no station source, image, queue or
run changes. The ongoing V2 results remain valid for the current station build.

The station controller was rebuilt from the existing checkout after adding
the V2 routes and worker. This includes the checkout's current Extended Sleeve
Notes, Sub/Flow, Sub/Shows, role-policy, regular-stem and controller stall-fix
edits; no reset, clean, cherry-pick or PR update was performed. The analyzer
now runs from local image `subwave-analyzer-v2-test:local`, built as an additive
overlay on the exact prior CUDA analyzer image. The prior container remains
stopped as `sub-wave-analyzer-v1-backup` for rollback. The admin run endpoint
reports the batch and timing. Keep V1 paused; do not resume pick-time work or
update PR #10 until the complete comparison and owner review pass.

**Continuation, 20 November:** the first role-policy checkpoint is now
implemented in the development worktree. Broad Dance Candidate status no longer
reserves regular stems; Sub/Beats checks only the required outgoing tail and
incoming head. The owner explicitly approved independent regular fallback for
declined Sub/Beats pairs, with no mixed-mode renderer. See the
[current implementation checkpoint](2026-11-19-subbeats-eligibility-pick-time-preparation-plan.md#implementation-checkpoint--20-november-role-policy-and-regular-fallback)
for the implemented contract and remaining preparation split. No source was
copied to the station at the time of that checkpoint. The station trial update
above supersedes that state; the earlier runtime notes below describe the
pre-trial state.

The owner requires confirmed station behavior before adding these changes to
PR #10. The checkpoint is kept locally on
`codex/subbeats-role-policy-station-20261120`; the existing PR branch and remote
PR have not been updated. Do not push this candidate or update PR metadata
before station confirmation.

## Current work locations

| Purpose | Location and state |
| --- | --- |
| Local station candidate | `/home/jaz666/codex/pr10-integration-20261118`, branch `codex/subbeats-role-policy-station-20261120`. Local only, pending station behavior confirmation. |
| Existing PR source | `codex/pr10-integration-20261118` / `jaz666/feat/subbeats-draft` remain at `988cd6e66`, including `e27150bb6`. The role-policy checkpoint has not been added to the PR. |
| Test-station integration checkout | `/home/jaz666/Docker/subwave`, branch `test-station/ordered-pr-union-20261118`, HEAD `10bcfaa92`. The controller is rebuilt from this checkout with V2 routes and the existing test edits; it is healthy. The analyzer runs `subwave-analyzer-v2-test:local`, based on the exact prior CUDA image plus the V2 endpoint; the old analyzer container is retained as `sub-wave-analyzer-v1-backup`. V2 population run `19562385-c3f5-4622-9782-a3e3ff2eca6b` is active under `state/subbeats/prep-v2/`; V1 is paused and hash-stable. The checkout still has many unrelated uncommitted changes. Do not reset, clean or cherry-pick over them. |
| Draft PR | [Jaz666/subwave#10](https://github.com/Jaz666/subwave/pull/10), open draft, `feat(stems): integrate Sub/Beats and regular Stem Blends`. |

When rebuilding the station after future source changes, run from the station
checkout:

```bash
docker compose up -d --build controller
```

The station currently has the V2 comparison controller and analyzer active.
Keep the analyzer image override and rollback container intact while the batch
runs. Rebuild the controller only from the station checkout so its existing
testing branches and uncommitted controller fixes remain present. Investigate
the incomplete source failure during final batch accounting before retrying it.

## Work completed

### Regular Stem Blends

- Added a separate pick-time Regular Stem Blend path using measured shared
  Beat This `small0` head and tail grids, exact role windows, source identity
  validation and CPU-only stem extraction.
- Head and tail readiness are handled separately. The preparation path checks
  the required windows and falls back to an ordinary transition when evidence
  or time is insufficient.
- Regular Stem Blend remains open to non-Dance genres. Its pair tempo rule is
  vanilla's 3% tolerance, including clean half/double-time equivalents.
- During testing, both head and tail preparation were allowed to generate
  freely. This was for observation and is not necessarily the final production
  preparation policy.
- Stem style selection remains as implemented; no forced drums-late behavior
  was introduced.

Details and implementation history are in the [Regular Stem Blend
implementation plan](2026-11-17-regular-stem-blends-implementation.md).

### Mixing Desk

- Added stem-readiness information to the Mixing Desk as part of the combined
  PR work, following the theme's Faint Text and Accent colors.
- The UI concept discussed in this chat places current-track status icons in
  the Mixing Desk header and moves timeline-sync controls onto the Auto row so
  the collapsed panel is more compact. Each icon needs a tooltip; narrow/mobile
  space remains a design constraint.

### Grid timing correction

The log line `pair blend 6s` reports the ordinary pair crossfade duration; it
does not mean a stem blend was chosen. The logs did expose a race: the queue
could evaluate Sub/Beats and Regular Stem fallback before an incoming shared
head grid finished, because the pending check required an already-admitted
regular pair. Missing BPM prevented that pair admission, so its pending grid
was ignored.

The pending check now waits for the outgoing tail or incoming head grid while
there is still time before the normal handoff deadline. When analysis
completes, the pair is reconsidered; after the deadline the normal fallback is
allowed. The fix is `e27150bb6` on the PR branch and `10bcfaa92` in the test
station checkout and is included in the rebuilt station controller.

Other standard transition effects use existing library/track BPM, key and
outro data rather than shared Beat This head-grid evidence. Their behavior is
not gated on that grid refresh. Missing classic BPM/key can affect those
existing calculations, but it is a separate issue from this pending-grid race.

## Sub/Beats: current findings and next design

The current Sub/Beats admission is a broad candidate predicate (dance genre and
BPM range), while actual usefulness is directional: a track may have a usable
incoming head, outgoing tail, both or neither. In the scanned 6,412 Dance
Candidates, 4,448 lacked incoming cues and 4,526 lacked outgoing cues. These
counts overlap. The larger library has 12,205 Dance Candidates out of roughly
72,000 tracks.

Current preparation measures grids/cues and then separates cue regions and
measures vocal activity. The regular path can also blanket-reserve broadly
eligible Sub/Beats tracks even when their needed role has no usable cue. This
may block tracks from both routes.

The proposed flow is documented in the [Sub/Beats eligibility and pick-time
preparation plan](2026-11-19-subbeats-eligibility-pick-time-preparation-plan.md).
In short:

1. Treat Dance Candidate as discovery only, not as proof of readiness or a
   reservation from regular stems.
2. Refresh current shared head/tail grids and cue evidence independently,
   without running Demucs just to classify a candidate.
3. At pair time, extract only the required Sub/Beats regions on CPU, then run
   the vocal activity check before the final Sub/Beats decision.
4. If the needed Sub/Beats role or final check fails, evaluate Regular Stem
   Blend independently, then use the ordinary transition if neither path is
   ready before the deadline.

The role-policy and independent regular fallback stage is implemented. The V2
grid/cue refresh and isolated run store are now implemented in the development
checkout, with focused checks passing; representative audio review and station
validation remain pending. The pair-drain path now prefers V2 when both roles
and bounded windows are ready. Its separate analyzer request renders from
source-verified `stembeats/pick-time/` windows through existing vocal and seam
checks, without reading V1 bundle data. Synthetic CPU rendering passes in the
available analyzer image at native tempo and a 3.2% tempo adjustment; real
prepared windows and station listening remain. No station or PR changes have
been made.
Pair crossover behavior is confirmed: always evaluate regular policy after
Sub/Beats declines, using a complete regular render rather than mixed modes.

**Station verification and rebuild, 23 November:** the owner confirmed that
two Stem Beats transitions aired on the existing station image. The station
checkout remains on `test-station/ordered-pr-union-20261118` at `10bcfaa92`
with extensive local testing edits. The pick-time priority, deadline reserve,
fractional-window clamp, cancellation and timing improvements were applied to
that checkout and the controller image was rebuilt; the analyzer image was
left in place. The controller restarted healthy, and its analyzer health check
reported Stem Beats window version 1. At the first post-rebuild check, analyzer
models were not resident. The station should now be monitored for the next
transition and its new timing logs. PR #10 remains untouched pending that
post-rebuild behavior check.

The owner's latest instruction requires preserving V1 preparation alongside
V2. The previous permission to discard old Sub/Beats preparation is superseded.
Keep existing cue, eligibility, coverage, reviewed evidence and prepared-stem
artifacts, as well as shared grids, library metadata, unrelated analysis and
old standard stem-cache files. New V2 comparison results live separately.

**Pick-time review, 23 November:** The six follow-up improvements are now in the
development checkout: clamp millisecond extraction ends to the verified source
duration; give V2-ready pairs priority over new Regular Stem pair prep and its
tail-grid refresh; bypass the Regular Stem pending gate for those pairs; reserve
the remaining extraction/render/deadline runway before optional intro speech;
propagate cancellation through shared source staging and analyzer extraction;
and log source staging, each extracted role, rendering, total time, remaining
budget and analyzer model residency where reported. Exact-window reuse remains
deferred until these timings show whether repeated extraction is material.
Targeted ESLint and controller typecheck pass. No tests, station rebuild or PR
changes were made; station validation is still required before PR #10 work.

## Resume guidance

Use the **Current checkpoint and action plan — 23 November 2026** at the top
of this document. The earlier seven-recording/population-prep instructions
above are historical; they do not supersede the owner's current priority of
getting reliable V2-based Stem Beats transitions on-air. Preserve V1 and keep
the latest work off PR #10 until station behavior is confirmed.
