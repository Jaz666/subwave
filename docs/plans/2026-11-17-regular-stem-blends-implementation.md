# Regular Stem Blends: CPU pick-time implementation plan

Status: implementation plan with operator decisions recorded, 17 November 2026. Planning only; this document does not enable new station behaviour.

## Intended result

Replace regular Stem Blends' legacy beat-carry transition and library-wide stem backfill with eight-bar, native-tempo transitions prepared as tracks enter the queue. Prepare an outgoing tail for a qualifying track; prepare an incoming head only when its actual predecessor forms an eligible pair. Keep a small, bounded working cache. Sub/Beats retains its beatmatched transitions and its existing prepared stems.

Version one explicitly runs regular stem separation on CPU, including when the analyzer host has a GPU. Device selection must be specific to these jobs, not an analyzer-wide change that changes Sub/Beats or other analysis. GPU support for this workflow is deferred.

## Evidence and limits

The CPU trials passed for three selected pairs, including concurrent CPU compute: target tail/head totals were 42.4–46.3 seconds under contention; rendering and waveform generation took about 0.3 seconds. Cold-start/download overhead and waiting behind the station's analyzer queue are separate costs. These results establish viability on the test hardware, not a guarantee on every installation or every eight-bar duration.

Auditions supported drums-late, rhythm-late and vocals-late; full-mix crossfades are excluded. Mushrooms → Feel Good reproduced the temporary station's sound on the proper station after fixing analyzer style forwarding. The proper station still uses older cache preparation, so this does not yet prove the complete proposed orchestration.

A renderer rejection also exposed a window-selection defect: the final nine tail markers may cross the wind-down, while an earlier eight-bar span is valid. Fix selection rather than treating this as musical incompatibility.

## Product rules

- Regular blends use eight measured outgoing bars, no beatmatching, looping, pitch shift or tempo recovery. The incoming recording plays at native tempo throughout; differing grids may drift. Both sides' actual coverage and drift must be checked rather than assuming eight outgoing bars equal eight incoming bars.
- Reserve Sub/Beats-qualified tracks for Sub/Beats using its authoritative admission policy, independent of whether their preparation has completed. Missing Sub/Beats stems must not silently send those tracks into regular blends. An unsuccessful Sub/Beats seam uses the ordinary transition.
- Mixed Sub/Beats/regular pairs use the ordinary transition in either direction. Do not attempt a crossover stem render in version one. For Sub/Beats → regular, omit the regular head for this seam but prepare the regular tail for a possible following regular pair. For regular → Sub/Beats, do not generate a regular head for the Sub/Beats track; release any unused outgoing working stems through normal cleanup. Reassess crossover mixing separately after this version.
- Keep track suitability separate from pair suitability. A rejected busy or incompatible pair must not disqualify either track from pairing with another track. Do not ship an unvalidated melody-clash classifier; existing technical gates cannot guarantee musical compatibility.
- Do not apply the Sub/Beats dance-genre gate to regular Stem Blends. Regular-stem track eligibility follows upstream's existing stem behavior; known busy or clashing audition results remain pair-level evidence, not a reason to exclude either track from every regular blend.
- Rotate reproducibly through drums-late, rhythm-late and vocals-late for accepted seams. Choose a style once per pair attempt; retries keep it. Use the exact auditioned envelopes as the baseline.
- Preserve existing show, DJ mode, request, blocklist, trim, capped-exit, boundary, speech and transition-precedence rules. Audit their actual call sites before changing precedence.
- Retain ordinary crossfade as the immediate fallback when evidence, capability, time, space or extraction is unavailable. No music handoff may depend on a worker finishing.

## 1. Define one preparation and eligibility contract

Implement shared regular-blend policy beside the existing transition policy modules. Its output should name eligibility, reason, exact source windows and required evidence. Analysis, queue preparation, rendering and UI should consume the same decision rather than implement separate gates.

Separate track admission, head/tail readiness, and ordered-pair admission. Resolve Sub/Beats reservations through its current policy rather than a saved ID list. Retain current tempo/harmonic safeguards initially; measure whether they describe the new native-tempo renderer correctly before changing thresholds. Report grid-span drift for auditions and select any tighter limit from listening evidence.

Deliverable: documented policy and tests covering accepted/rejected roles, Sub/Beats reservation, missing evidence and duplicate recordings. Navidrome IDs identify exact recordings; titles or albums must never substitute for identity.

## 2. Finish analysis metadata and eight-bar window planning

Audit the current station branch against this development worktree: shared-grid integration already deployed on the station must survive consolidation. Wire the shared-grid path into normal Library Analysis with versioned provenance and source identity.

Persist enough head/tail grid coverage to choose complete eight-bar windows, including slower tracks. Select the latest valid outgoing span before the wind-down and trimmed end, searching earlier spans when the final one fails. Respect head trim, decoded duration, minimum retained audio and measured source coverage. Do not synthesize bars from BPM or silently shorten a blend.

Use stored timestamps to derive extraction start/end, render start, handoff points and waveform needs. The outgoing duration determines overlap; verify that the incoming head covers its start plus that duration, including seam margins. Plan any additional continuation needed at the clip boundaries. Bound analysis/extraction duration and reject insufficient coverage explicitly; determine a supported slow-window limit from CPU measurements rather than imposing Sub/Beats' 90 BPM floor.

Reuse existing structured analysis fields where sufficient. Add a narrow versioned preparation record only for facts that cannot be safely derived; do not duplicate the beat grid in another cache.

Upgrade with a resumable, targeted grid/cue refresh for currently regular-eligible tracks whose metadata is missing or stale. Preserve unrelated analysis, tags and valid Sub/Beats preparation. Existing suitable rows require no rescan; old rows can continue ordinary playback while upgraded. Do not mandate repeated whole-library scans.

Deliverable: deterministic window plans, targeted refresh command/progress, and slow-track coverage checks.

## 3. Add bounded CPU extraction and cache contracts

Extend the existing analyzer job contract to request explicit windows and CPU processing for regular-blend jobs. Validate the device and windows in the worker and acknowledge actual device, requested style, supported contract version and output coverage. A controller must detect an incompatible worker before expensive work; it must never accept a legacy beat-carry response as a new regular blend.

Retain atomic writes and recording provenance. Cache identity must include source identity, window bounds, extraction/model version and relevant generation cutoff; a matching track ID alone is insufficient. Write completion metadata last and reject partial or mismatched results. Old cache files are not inputs to the new regular-blend workflow, even if they appear compatible. Reuse is limited to verified windows generated by the new workflow for tracks still in its active working set. Include waveform version/coverage in preview reuse checks.

Persist model weights separately from the working audio cache. Reuse a verified local download across worker restarts; avoid repeated checkpoint downloads. Measure cold and warm CPU behaviour and limit thread count/concurrency to leave capacity for broadcast and other services.

Use a separate regular working-cache directory, outside Sub/Beats retention. Retain working files for the current track plus up to eight queued tracks: at most nine track identities, with no historical LRU collection. Derive membership from the authoritative live queue and current playback, not the most recently requested nine jobs. A repeated recording can share verified source windows, while seam state stays specific to each queue occurrence. Nine tracks is the retention ceiling, not a requirement to generate both windows for all nine; tail-first and pair-dependent head preparation still apply.

Reuse existing cache/provenance helpers where possible. Associate stems, previews, partial downloads and rendered clips with their track/pair dependencies and account for their bytes. Retire artifacts as tracks leave the active set, after the mixer and running jobs release them; never delete a clip already handed to the mixer before its seam has played. Cancel stale work and clean its temporary outputs before admitting replacement work, so queue churn cannot create an accumulating tenth-track cache. Validate on restart and sweep abandoned outputs only in this new working directory. Check free space before starting work and fall back when insufficient; nine-track retention cannot guarantee a fixed byte size. Preserve every old cache file, and keep legacy sweeps from deleting or refreshing those files through this workflow.

Deliverable: CPU-only extraction on both CPU and GPU hosts, verified model reuse, bounded storage, and controller/worker contract checks.

## 4. Prepare asynchronously in playback order

Move preparation out of the blocking drain path. Use one small controller-owned coordinator integrated with existing queue events and the analyzer pool; avoid a second independent job system.

For queue A → B → C:

1. When qualifying A is held, schedule A's tail for its future exit.
2. When B arrives, judge A → B. If eligible, complete A's tail, then B's head, then render the seam. If rejected, do not request B's head for that seam.
3. Schedule B's tail if B qualifies, even when A → B is rejected. B may blend with C.
4. Prioritise the nearest usable seam and its missing prerequisites over speculative tails for later items. Deduplicate identical jobs and avoid flooding the analyzer after rapid queue additions.

Treat work as pending, preparing, ready, armed, committed, cancelled, or fallback, with one owner of each transition. Preparation completion triggers a fresh queue/policy check and wakes the existing drain. Pending work is not a final crossfade decision. Once handed to Liquidsoap, a seam is immutable.

Integrate the existing hard drain deadline: preparation gets only the time genuinely available before safe handoff, with a margin for render/write/probe. Do not extend a deadline to meet the two-minute processing target. Unknown clocks, imminent skips and insufficient lead time fall back promptly. Recompute remaining time after waits.

Cancel stale queued work after removal, reorder, skip, show change, source change or disabling the feature. A running non-cancellable CPU job may finish, but cannot arm a stale pair or overwrite a newer result. Use pair/queue generation identity, not just track IDs. After controller restart, reconstruct readiness from verified files and the live queue; do not duplicate or resurrect an already committed seam.

Coordinate with Library Analysis: regular preparation must not wait unboundedly behind a bulk job, and bulk runs must not starve indefinitely. Define admission/priority at job boundaries; never assume a running Demucs job can be preempted. Start with one regular extraction at a time and bounded CPU allocation. Log queue wait separately from compute time.

Deliverable: deadline-safe tail-first preparation without out-of-order queue work or stale seam arming.

## 5. Promote the renderer and operator experience

Remove the exact-ID test allowlist from normal operation only after the policy and coordinator pass. Replace the legacy regular beat-carry path with the three supported patterns. Keep the existing loudness resolver, seam-overlap arithmetic, cue-landing checks and Liquidsoap identity rules. Validate style, output file, finite cues, source/window identity and coverage before arming.

Expose simple readiness: checking pair, preparing tail/head, rendering, ready, or ordinary transition with a reason. Keep “Held” for its actual meaning: not handed to the mixer. It must not double as a processing indicator. Surface exact track version/album where useful for troubleshooting duplicates.

Reuse the existing Stem Blends opt-in for the new workflow. Put the existing pick-time caching feature on hold: retain its saved configuration for a future decision, but suspend its legacy head-and-tail cache-filling and upgrade jobs for regular blends. The new regular preparation path must not depend on enabling that legacy setting. Do not offer a legacy cache-only mode in this version. Explain that regular blends prepare CPU stems when needed and retain only the current track plus eight queued tracks; no operator cache-size choice is needed for this working set. Preserve old files without reading, refreshing or deleting them for regular blends. Keep Sub/Beats preparation and storage separate. Document the changed meaning of enabling Stem Blends and verify migration from each legacy setting combination.

Stop ordinary Library Analysis from pre-generating regular stems after migration; it supplies grids/cues and other established analysis only. Keep separate vocal-activity analysis and Sub/Beats preparation available. Ensure the legacy upgrade/backfill logic cannot refill the old regular cache behind the new workflow.

Deliverable: understandable settings/status, one regular render path, documented migration and rollback.

## 6. Verify and roll out

Run focused policy, worker-contract and queue integration tests, then required controller/web lint and suites through `npm test`, one heavy command at a time. Include:

- Eight-bar spans below 90 BPM; half/double BPM labels; missing/irregular grids; earlier valid tail span; trim, fade and cold endings.
- Tail-only first; no head for rejected pairs; B's tail still prepared when A → B fails; later queue additions never jump urgent prerequisites.
- Completion before deadline reconsiders a pending seam; completion after commitment never alters it; skip and unknown clocks hand off promptly.
- Removal/reorder, same track queued twice, restart, feature toggle, worker crash/timeout, partial files, replaced recordings, full/offline/unwritable cache.
- Current track plus eight queued tracks; a queue replacement while work runs; released tracks/played clips cleaned safely; no accumulating historical windows; old cache files ignored and unchanged regardless of legacy Pick Time settings.
- Old analyzer rejects new requests cleanly; API forwards style and CPU selection and returns them correctly; local and sidecar paths agree.
- Sub/Beats-qualified but unprepared tracks remain reserved; Sub/Beats files/settings survive migration and regular cleanup. Mixed Sub/Beats/regular pairs in both directions use ordinary transitions without unnecessary head extraction, while a regular incoming track still gets tail preparation for its next eligible seam.
- CPU-only hardware and a GPU-equipped host both report CPU for these jobs; bulk-analysis contention and cold model startup are measured.

Roll out to the proper test station from its existing branch, preserving all other test commits. Retain a rollback image/configuration. First replay known pairs with an empty regular working cache; then enable ordinary eligible selection for a representative observation period. Check actual audio and operator listening, not only container health.

Collect qualifying tracks, tail/head job counts, cache reuse, queue/compute/render times (median/p95/max), CPU/memory, storage peak, attempted/armed/aired seams and fallback reasons. The occasional 90–120-second preparation is acceptable if average workload is reasonable and it meets its actual handoff deadline. Track tails prepared but never used: that determines average cost better than the blend count alone. Do not promise every pair a blend on slower hardware.

Release gates: successful cold-cache on-air pairs across varied material and slow windows; no preparation-caused late handoff/dead air; no stale arming; bounded cache; successful restart/rollback; unchanged Sub/Beats playback; and acceptable measured average CPU demand. Musical auditions remain necessary because technical checks do not judge clashing melodies reliably.

## Confirmed operator decisions

1. Existing pick-time caching is on hold for version one, pending a future decision on allowing caching again. The new workflow uses only its temporary active working set; the legacy persistent cache-filling feature does not run for regular blends.
2. Old cache files are of no use to the new regular workflow. Ignore them, but do not remove any. Preserve Sub/Beats storage and behaviour separately.
3. Keep working files for nine tracks: the currently playing track and up to eight queued tracks. Retire released artifacts safely instead of retaining a historical cache. No head is generated merely to fill a slot.

4. Sub/Beats/regular crossover pairs use ordinary transitions in both directions. Crossover mixing is deferred for later assessment.

CPU processing remains mandatory for new regular-blend jobs in this version. These decisions settle the previously listed cache-mode and retention questions. Supported slow-window bounds and CPU thread limits still need measurement during implementation; they do not change the nine-track retention rule.

Implementation order is 1 → 2 → 3 → 4 → 5 → 6, with tests added alongside each change. The agreed delivery is one combined draft PR with Sub/Beats, Mixing Desk and regular Stem Blend work, sharing the beat-grid and analyzer contracts.

## Implementation progress — first development pass

Implemented in the development worktree (not deployed):

- Pure regular-pair reservation policy, eight-bar window selection and current-plus-eight working-set membership, with focused tests. Reservation and membership helpers still need their production queue/cleanup consumers; they are not yet active admission or eviction rules.
- Regular test renderer now searches earlier complete tail spans when final markers cross wind-down or available tail coverage. A regression render verifies the earlier span is selected.
- Request-scoped `stems_device: cpu` from controller through sidecar to both Demucs windows, without changing the worker's default device for later jobs. Device overrides are restricted to stems-only CPU requests. The response acknowledges the choice and the controller rejects a missing acknowledgement. Exact-pair preflight requests now select CPU explicitly. This does not force the legacy background cache-filling path to CPU.

Integration finding: this worktree has no production Sub/Beats modules; the station checkout contains them and the deployed shared-grid work. General admission, targeted metadata upgrades, the asynchronous coordinator, working-directory lifecycle and settings migration must be integrated against that combined baseline before the allowlist is removed. Do not enable the pure membership/reservation helpers as a replacement for the station's authoritative policies by guessing from coverage or test ID lists. No live checkout or containers were changed in this pass.

Remaining delivery: reconcile the intended feature baseline without importing unrelated station work; finish versioned capability negotiation before requesting CPU work from older analyzers; explicit grid-sized extraction; activate authoritative admission and nine-track cleanup; integrate deadline-safe asynchronous queue preparation and completion wakeups; suspend legacy regular backfill; add UI/settings migration and run full validation. Existing exact-pair integration remains an experiment, not the completed new workflow.

Validation for this pass: four regular-policy tests passed; 66 pick-time/policy/drain tests passed; the analyzer Python suites passed, including CPU request scoping, sidecar forwarding and earlier-tail-window rendering. Full controller lint/type check is recorded separately after completion. GPU-host execution and real CPU inference timing for the new request-scoped device contract remain to be verified; synthetic tests do not establish those runtime results.

Final controller `npm run lint` passed (existing warnings, no errors; TypeScript passed). No changes were pushed or deployed.

## Combined integration baseline — 17 November 2026

Development now continues on `codex/regular-stems-integration` in the managed
worktree `/home/codex-worker/.codex/worktrees/regular-stems-integration/subwave`.
It starts at the station's committed `aa0bab6ad`, preserving its other test
features, rather than merging the entire station into the older upgrade branch.
The original upgrade worktree and all its unfinished edits remain intact.

The running controller's relevant source was compared with that commit. Its
shared-grid schema, database persistence, cue-refresh policy and Sub/Beats
consumers have been retained in this integration worktree. The waveform-peaks
helper is included because the deployed Sub/Beats library module imports it;
unrelated station route, tagging and web edits were not copied.

The running analyzer snapshot did not contain the shared-grid worker/module,
although the controller and saved database evidence supported shared grids.
The station's local source was therefore not a sufficient rebuild baseline.
Recovered shared-grid source comes from `c49750b8f` / `8108f40e3`, with the
missing tracker configuration recovered from `feat/beat-this-shared-grid`.
A three-way source merge preserves the station's Sub/Beats coverage fallback
and preview observation hooks while adding the regular audition renderer,
earlier valid tail-window selection and request-scoped CPU processing.
The analyzer and AIO recipes include checksum-pinned ONNX assets; duplicate
model-download and module-copy steps were removed from the recovered recipe.

Baseline test repairs: remove the Python runner's stale registration of
`shared_stem_coverage_test.py` (neither it nor its module exists on this
baseline), retaining the present Sub/Beats coverage tests; align the converted
bundle reuse fixture with the existing Sub/Beats separator identity's
`shifts: 1`. No Sub/Beats separation setting is changed by that fixture repair.
New explicit CPU regular jobs use `shifts: 0`; the existing default path keeps
its existing behaviour pending the separate workflow migration.

The sidecar now forwards `regular_style`, the CPU request and head grid
provenance. Tests exercise request-scoped device forwarding, regular style
round trips, earlier tail selection, shared grid evidence and existing
Sub/Beats rendering. Real-model ONNX/CUDA/CPU inference checks remain distinct
from the synthetic regression suite. No station containers, cache files,
database rows or runtime configuration have been modified by this integration.

This establishes the combined source baseline; it does not yet implement the
asynchronous coordinator, active nine-track cache lifecycle or migration off
legacy regular caching. Continue with versioned capability negotiation and
explicit extraction windows, then connect authoritative admission and queue
preparation before removing the test allowlist.

Integration verification: 101 Sub/Beats assertions, 234 stem-related assertions,
six beat-grid provenance assertions and all registered analyzer Python suites
passed. The latter includes shared-grid regressions, Sub/Beats cue/coverage
preparation, API style/CPU forwarding, regular renderer window selection and
CPU scoping. Controller lint and TypeScript passed with existing warnings.
The web schema mirror was regenerated, not hand-edited. No Docker image build,
real-model inference, web build or on-air test was run for this new candidate.

Timing-refresh parity was also restored from the existing managed-refresh
patch: the worker advertises its supported version, the API accepts/forwards
timing-refresh and previous-coverage inputs, and saved coverage is revalidated
against the source/base/separator before reuse. New coverage tests prove that a
changed cue artifact reuses saved stems without another separation, rejects
invalid/mismatched reuse references and honours rounded sample boundaries.

Next gate: implement versioned regular-job capability negotiation and explicit
extraction windows in this combined branch, then the deadline-safe coordinator
and current-plus-eight lifecycle. Keep the exact-pair trial restriction until
that workflow and its migration/cleanup tests pass. This baseline is not yet
the completed replacement for existing regular stem caching.


### Explicit extraction and working retention foundation

Added a separate version-one regular extraction request with CPU-only separation,
explicit head/tail source bounds and a caller-supplied identity key. Malformed
jobs are rejected before opening audio. The worker requires a complete source,
checks decoded sample coverage and all four finite stem arrays, and publishes a
regular completion record last. It requires a dedicated regular-root marker and
never enters the legacy head/tail analysis/cache path. The initial per-window
safety bound is 120 seconds; it is not a measured performance guarantee.

Added serialized working-set retention for current plus eight queued identities.
Worker/mixer leases defer retirement after queue removal; duplicate release is
safe. Restart reconciliation removes retired hashed track directories while
leaving miscellaneous files and links alone. These components are not yet wired
into the queue: no station behavior or legacy cache files changed.

Validation: six regular-policy/retention tests pass; controller lint/type check
passes with the existing 1,919 warnings. Analyzer Python suites exercise exact
32-second CPU extraction, duplicate publication refusal, malformed contracts and
short decoding. Real model execution remains outstanding.

Still required before activation: capability negotiation before expensive jobs,
verified recording/model identity and response matching, isolated job publication
and preview handling, queue admission/order/cancellation/completion wakeups,
deadline-safe render integration and legacy settings/backfill migration. The
retention class must receive only the dedicated regular working root; its leases
are process-local and startup must reconcile mixer-owned artifacts before sweep.


### Preparation scheduling and analyzer compatibility

Added a single-flight asynchronous preparation lane with ordered queue needs and
absolute deadlines. It re-reads the latest desired order after each job instead
of allowing later additions to overtake the nearest incoming head. Removing a
need or reaching its deadline suppresses its completion callback. Failed jobs
settle without an immediate retry loop; removing/reintroducing the need permits
a retry. This lane is tested independently; Queue has not yet been connected to
it, so its callbacks cannot arm or alter live seams yet.

The analyzer now advertises regular-stems contract version one through both
local readiness and sidecar health (all ready pool workers must support it).
Regular extraction refuses unsupported workers before submitting work. Responses
must acknowledge CPU, the identity key, requested side/bounds/version, sample
rate and sample count. A missing shared path fails explicitly rather than
returning an empty successful facet response. Tests include worker replacement
with an older version, incorrect keys/coverage/device and unavailable paths.

The existing regular renderer now consumes the authoritative Sub/Beats admission
query, independently of prepared coverage. Regular/Sub/Beats crossover and
Sub/Beats-to-Sub/Beats fallback cannot enter the regular renderer. A database-backed
test verifies both directions with qualifying but unprepared tracks.

Validation: 241 stem-related assertions pass, including the new scheduling,
reservation and request tests; the analyzer Python suites and controller lint/type
check pass (1,919 existing warnings, no errors). This remains a
development-only change, with no station deployment, cache removal or migration.

Next: build the queue's actual desired-window snapshots and runner with recording
and model provenance, attach the lane/cache to queue lifecycle and existing hard
deadlines, then switch regular render input to verified working windows and
suspend legacy preparation/backfill. Do not activate the isolated components
before those consumers and restart/mixer ownership handling are complete.


### Queue and working-render integration (audition rollout)

The existing exact-pair audition mode now uses the actual preparation owner.
Queue drain supplies current-plus-queued membership, shared-grid evidence and
live clocks without awaiting separation. It holds an eligible pending pair only
before the preparation deadline, re-enters on completion, and has independent
force/unknown-clock/hard-deadline fallbacks. Once handed over, ordinary queue
ownership still prevents any late change to that seam. Legacy pick-time caching
is skipped for these audition tracks; other tracks retain existing behaviour
until the broad migration step. This is deliberately not broad activation yet.

The snapshot planner requests tails first and incoming heads only for the actual
eligible predecessor. A rejected pair still leaves the incoming tail available
for the next pair. At native tempo, incoming head coverage follows the outgoing
eight-bar duration, which can exceed the incoming track's own eight bars. A
missing/short/stale source grid gives an ordinary transition, not invented timing.
Only grids carrying complete encoded-recording fingerprints produce jobs.

The runner uses a dedicated `regular-stems-working` root, keyed by track identity
and recording/window/grid/model/protocol evidence. It stages complete original
audio and asks explicitly for CPU/htdemucs with shifts zero. It verifies completion
stamps before reuse, holds source leases during rendering, and does not read,
refresh or delete the old persistent cache. Sub/Beats storage is unchanged. Mono
masters are normalized to stereo for separation rather than rejected.

The protocol is now **version two**: the preceding version could echo a caller's
fingerprint without verifying it. Version-two requests require the recording
hash/size and expected model; the worker compares encoded bytes before loading
Demucs and again before publication. Version-one/unknown workers are refused
before job submission. Replaced recordings fail without a completion stamp.

Styled renders require their working-window identity keys. The worker loads
absolute head/tail coverage from the new stamps and never falls through to
legacy/Sub/Beats files on a working-cache miss. The native-tempo renderer runs
before legacy beat-carry checks, so legacy loop-length and fixed-head limits no
longer veto these windows. Both rendered sources remain leased until the separate
transition WAV is complete; the mixer then needs the WAV, not those source stems.

Bounded durable busy stamps protect extraction/render source files across a
controller restart, and stop new regular work from overtaking an unresolved old
job. Successful work clears its stamp. A failed/timed-out request leaves it to
expire (extraction: ten minutes; render: at least one minute). This is conservative
recovery, not proof of cancellation of an arbitrarily hung external worker. Keep
that limitation in the real-station timeout/restart validation gate. Ordinary
playback always retains its existing fallback deadline. Bulk analysis defers work
at job boundaries rather than causing immediate retry loops. Processing and
wait/download time are logged separately for later workload observation.

New validation includes queue hold/release/force/deadline tests; a simulated
sidecar exercising the real download/request/cache owner, tail/head order,
render priority and source leases; native working-window alignment without
legacy sidecars; replaced-source refusal; mono input; and durable lease expiry.
The simulated sidecar does not establish real Demucs performance or audio quality.

Remaining before broad activation: finish source/queue mutation and restart
fault tests, preview/waveform handling and status presentation; retire the legacy
regular renderer/backfill and migrate settings/UI; remove the exact-pair rollout
gate only after those checks; then build and validate on the station when
explicitly requested. No deployment or operator action has been performed here.


Checkpoint checks: 249 stem-related tests pass; the final 19 focused regular
checks pass after adding quiet-only handling; analyzer Python suites pass,
including mono and recording-identity checks. Live CPU preparation respects
both the quiet-only setting and environment override. Controller lint/type
validation passes with no errors (1,920 warnings, including the new queue-test
fixture cast). No real-model CPU
benchmark, Docker rebuild or live stream test was performed in this pass.

### 2026-11-18 — queue mutation and timeout/restart reliability

Closed two races exposed by the new fault tests. Preparation needs now carry an
ownership revision: removing and reintroducing the same audio window cannot let
the cancelled job settle the new need or wake its old seam. A still-valid completed
window can subsequently be revalidated by the new need without forcing another
separation.

Queue snapshots now identify individual occurrences independently of reusable
recording/window keys. The runtime records only actual eligible adjacent pairs;
matching audio windows elsewhere in the queue are not permission to render a
non-adjacent pair. Source acquisition rechecks pair revision and window identity
after asynchronous filesystem reads, and returns a validity check for the render.
Replacing occurrences, reordering or changing the required source windows makes
an existing render proposal obsolete.

The regular renderer also compares fresh library timing, source-grid and admission
evidence before and after its asynchronous request. A completed clip is removed
and declined if that evidence or the pair changed. The test covers unchanged
pairs, cancelled/replaced pair ownership, a changed analysis row, and newly acquired
Sub/Beats eligibility. Confirmed worker completion releases source protection even
when its now-obsolete WAV is discarded.

Extended the simulated sidecar test with an actual HTTP timeout followed by a new
runtime instance. The durable busy marker prevents overlapping another regular
extraction; the expired original job cannot wake its old seam. After lease expiry,
one fresh extraction replaces late partial output and reaches verified readiness.
Both extraction and render busy markers now have explicit restart/expiry tests.
These are controller/protocol tests; they do not demonstrate termination of a
physically hung external analyzer or real Demucs performance. The bounded lease
limitation recorded above remains a station-validation concern.

Validation: all 22 focused regular tests and all 252 stem-related tests pass.
Controller lint/type checks pass with no errors (1,920 warnings). Python and web code were
unchanged in this pass; no Docker rebuild, live station request, deployment or
library/cache migration was performed. Continue with the remaining settings,
status/preview and broad-activation work before proposing station rollout.

### 2026-11-18 — operator preparation status

Added an admin-only `/stems/regular/status` read and a Stems settings panel. The
read projects only recording ID, head/tail and lane state from existing memory;
it does not scan caches, call the analyzer, start work, or publish paths/window
keys through the public queue. A shared Zod schema defines the response and its
web mirror. The panel polls only while mounted/authenticated and counts current
queue requests as waiting, processing, prepared, unavailable or past deadline.
A failed read hides stale counts and reports unknown readiness. An empty desired
set does not claim an older worker has stopped or that tracks are unsuitable.

The panel explicitly describes the current exact-pair audition scope: CPU,
tail-first, conditional heads and nine-track working retention. Prepared windows
are not presented as armed transitions. Non-audition tracks still use existing
settings, so those controls have not been disabled or described as globally
paused. Corrected the Sub/Beats fallback help to reflect reservation of eligible
tracks even for mixed pairs. Broad activation/settings retirement and waveform
preview migration remain outstanding before station rollout.

Validation: the 11 stem-route tests, real runtime integration test and two new
web rendering tests pass. These cover admin access, response projection, actual
ready head/tail states, loading/read failure/empty/inactive mode and the distinction
between preparation and arming. The UI mechanical detector reports no findings.
Controller lint/types pass with zero errors and the existing 1,920 warnings;
web lint/types pass without warnings.
No browser visual check, live station request, deployment, cache removal or
library migration was performed in this pass.

### 2026-11-18 — working-window live waveform previews

The existing live waveform endpoints still resolved regular sources through the
persistent cache. New regular renders now carry their own native source offsets,
style, actual renderer gains and unique render identity. Their small, prepared
100 ms waveform envelopes travel with the rendered seam. Old persistent sources
are never substituted when a new preview is missing, including the legacy raw
stem-audio endpoint. Sub/Beats keeps its existing preview path.

Envelope generation uses the existing ffmpeg/binary waveform implementation in
the CPU preparation lane, within a shared twelve-second deadline (shorter when
preparation time is nearly spent, reserving five seconds to settle audio readiness).
It does not start decoding in the sender or
on a new regular preview read. Failure leaves the verified audio usable and the
preview unavailable. Reuse validates source size/mtime, window key, bounds and
finite normalized peaks. Corrupt binary envelopes are rejected and regenerated.
No extra model or package is needed. These checks do not constitute a real
Demucs CPU workload benchmark.

Rendering snapshots already prepared envelopes under its source leases; the
existing queue/library validity checks still run after those reads. New regular
clips have unique filenames so another occurrence of the same recording pair
cannot overwrite the prior clip or reuse its browser peak cache. The operator
metadata poll carries only small timing/style information, not eight arrays.
The per-stem endpoint serves the matching saved render's arrays after checking
the current/retained pair. Source stems can retire normally. History keeps only
the immediately preceding seam's envelope snapshot through the existing bounded
sixty-second listener-buffer window, then drops it on a queue preparation tick.

The UI now predicts the actual equal-power outgoing fade and incoming delayed
fade for drums-late, rhythm-late and vocals-late, at native tempo and from the
saved absolute source offsets. It no longer labels these new patterns as an
estimated legacy drum handover. These remain predicted source contributions;
the final summed limiter is not a live meter.

Broad activation, retirement of legacy regular cache filling/settings and removal
or replacement of the old cache-based manual audition tool remain before rollout.
The live station, old cache files and library have not been changed. Browser
visual verification and an on-station trial have not been performed in this pass.

Validation: all 254 stem-related controller tests and all 23 now-playing-file
tests pass. The new real-ffmpeg fixture covers source/window identity, decoder-free
reads, preservation of the readiness margin, invalid-envelope regeneration,
source replacement and snapshots surviving source retirement. Queue tests cover
preview expiry. Route/projection tests cover native source offsets and gains,
no envelope arrays in metadata polls, no old-cache fallback, retained reads after
incoming entry and rejection of unrelated pairs. All 14 web stem-preview tests
and nine admin-query audit tests pass; the admin-query and UI mechanical audits
report no findings. Controller lint/types pass with zero errors and the existing
1,920 warnings; web lint/types pass without warnings. No browser, Docker build,
real Demucs run or live station request was made.

Next implementation gate: retire legacy regular filling/upgrade/sweep entry
points while preserving Sub/Beats, migrate the Stems controls without discarding
saved values or old files, and replace the exact-pair gate with shared regular
admission. Run legacy-setting-combination and Sub/Beats retention tests before
proposing a station candidate.

### 2026-11-18 — broader migration candidate (internally gated)

Added `SUBWAVE_REGULAR_STEMS_ROLLOUT=working` as an internal development gate for
exercising the combined migration. The default remains the existing exact-pair
audition stage. This switch is not a proposed operator cache mode and must be
removed/promoted before release. It has not been set on the station.

In the broader candidate, the existing Stem Blends opt-in controls queue-time CPU
preparation without an exact-recording allowlist. Pattern selection is stable
per ordered recording pair. All existing measured-window, Sub/Beats reservation,
quiet-only, show/DJ, deadline and rendering checks still apply. Calls without a
new regular style cannot fall back to the legacy cache renderer. The old Pick
Time toggle does not enable legacy separation or influence the working set.

Ordinary analysis disables regular cache filling/backfill regardless of its saved
cache value. An explicit legacy stems facet plan is refused before probing the
analyzer or altering analysis; other analysis remains available. A stem-only
Library scan can still authorise selected queued Sub/Beats preparation, without
creating ordinary stem files. Saved settings are retained across cold loads.

Storage audit found that the old budget sweep, replacement cleanup and automatic
orphan/selective cleanup operate on entire track folders containing both regular
windows and Sub/Beats bundles. To honour preservation, the broader candidate
holds automatic mutation of that old root: no budget eviction, replacement-dir
removal or automatic quarantine/deletion. Replacement still invalidates Sub/Beats
source evidence. Both scheduler and deletion-engine guards cover automatic purge.
Explicit operator-confirmed manual purge APIs retain their existing permission
checks; no such command was run. The new working root keeps its independent
nine-track cleanup.

This hold also retains existing Sub/Beats files; their preparation/playback and
byte-budget admission remain available. The retained old files continue to count
against the shared budget. New Sub/Beats preparation may wait when it fills;
the migration does not secretly reclaim old files to make space. This is shown
in the candidate settings. A later cleanup decision can separate bundle-owned
retirement from the retained regular files; do not re-enable whole-folder sweeps.

The Stems settings read the actual rollout state, hide held legacy controls and
automatic orphan controls in the broader candidate, explain CPU/tail-first/eight
bar preparation, and label the remaining budget for saved Sub/Beats. They retain
the old saved values and suppress false promises/confirmations about imminent
automatic deletion. One shared query owns mode/readiness polling. Doctor checks
require the working-window protocol in the broader candidate and do not suggest
filling a persistent regular cache based on historical cache coverage.

The advanced Library stems facet choice is still present but returns the explicit
on-hold explanation in this development candidate. Its presentation, final rollout
promotion/removal of the internal gate, available-disk admission and bounded
isolated end-to-end/browser validation remain before proposing station rollout.
Deploy only after checking the analyzer is idle so old in-flight legacy jobs do
not overlap the switch. No station/container/config, library or cached audio was
changed in this pass.

Validation: all 255 stem-related controller tests and 81 analysis tests pass.
The new migration integration test exercises eight cold-loaded legacy setting
combinations, confirms no legacy analyzer POSTs, retains regular and Sub/Beats
files under forced budget/replacement cleanup, refuses automatic purge and
legacy facet plans, and still releases queued Sub/Beats work from a stem scan.
The queue test also exercises broader preparation without the exact-ID list.
All 53 web settings tests, three readiness-panel tests and nine admin-query audit
tests pass. A stale pre-existing save-payload expectation was updated to include
the already-supported `subbeatsOnAirCaching` preference; saving held values and
Sub/Beats preferences is explicitly covered. Controller lint/types pass with
zero errors and the existing 1,920 warnings; web lint/types pass without warnings.
Admin-query and UI mechanical audits report no findings. No browser or station
validation was performed.

Next: add disk-space admission and retirement of obsolete keyed windows within
an active track's working folder, then test the broader candidate end to end in
isolation. Keep the rollout gate until these checks and the remaining UI migration
are complete; do not enable it on the live station from this checkpoint.

### Incremental beat-grid upgrades

Beat This! is now the required source for head/tail beat grids in normal Library Analysis, on every analyzer tier. The CPU ONNX runtime and pinned small0 model are packaged in lean, heavy, CUDA and AIO images. Failed model loads or inference fail the grid facet instead of persisting a Librosa fallback.

Existing library rows are not mass-rescanned. As any library track enters the queue's working set, Pick Time refreshes its stale or missing head/tail grid in the background, one track at a time. Until fresh shared-grid evidence is available, stem transitions stand down and the normal transition remains available. The refresh changes only beat/bar arrays and their provenance; it leaves unrelated analysis and all old cache files untouched. Failures cool down for five minutes before retry. Tracks that are never queued remain unchanged until a later scan or queue entry.

The library-facet version is not bumped, so this does not start a library-wide backfill. New/otherwise-analyzed tracks get Beat This grids through the normal scan; queued legacy rows upgrade gradually as tracks are played.

### Working storage safeguards

The working-cache owner now receives the current required window keys as well
as its nine-track membership. A track remaining in the queue no longer retains
obsolete windows indefinitely after its grid, duration or incoming partner
changes. Cleanup removes only hash-named window directories in the dedicated
working root, never links or miscellaneous files. Process leases and the bounded
worker/render busy stamps protect the entire track during an operation, including
across controller restarts; release or a subsequent reconciliation removes stale
windows after that protection expires. Already rendered seams retain independent
WAVs and captured preview envelopes. The old persistent cache is untouched.

CPU preparation checks available space before downloading, and checks again
before separation after the download. It uses the analyzer's actual staging root
and configured download cap, sums estimates when staging and working output share
a filesystem, and leaves 256 MiB per volume for station work. Window estimates
allow uncompressed stereo intermediate copies without relying on FLAC compression.
Cached-window previews are optional and skip work if space is unavailable. Render
admission separately allows the single stereo PCM_16 seam WAV. A failed or unknown
space check releases leases, logs the preparation/render failure and leaves the
ordinary transition available; it never initiates a library scan or old-cache
eviction to make room.

These are admission estimates, not reserved disk blocks. Other writers can still
consume space, and a sidecar's private temporary filesystem is not visible to the
controller. Existing preparation/render failure fallback remains necessary.

Validation: all 261 stem-related controller tests pass. After the final render
estimate and failure-path assertions, all 30 focused regular-stem tests pass
again. Coverage includes same-volume aggregation, separate-volume refusal,
unknown space, missing-parent discovery without directory creation, refusal
before download and after download with staged-file cleanup, render refusal and
lease release, and obsolete-window retirement under both process and restart
protection. Controller lint and full type-check pass with zero errors and the
same 1,920 existing warnings. No Docker build, browser test, real CPU benchmark
or station operation was performed.

Next: complete the remaining advanced Library facet presentation and exercise
the broader working candidate end to end in isolation. The internal rollout gate
remains in place; station deployment and incremental grid refresh remain later
steps.

### Library scan presentation and isolated browser validation

The manual Library scan dialog now reads the same authenticated preparation
status as Settings, only while the dialog is open. In the working candidate its
stem choice is labelled "Prepare saved Sub/Beats stems": it processes queued
Sub/Beats selections under their saved budget. The explanatory text makes clear
that regular Stem Blends are prepared from the queue and existing files remain
retained. The original combined-cache wording remains for the audition stage.
No saved setting or scan command contract changes.

Loading or failed status reads disable only the stem choice and remove it from
the effective submitted steps. A failed refetch does this even when the query
retains earlier successful mode data and the operator had already selected
stems. Other scan steps remain available. Recovery restores the selected choice.
Explicit persistent-regular-stem facet plans remain refused by the controller;
ordinary acoustic/vocal analysis and queued Sub/Beats preparation remain separate.

`web/scripts/verify-regular-stem-migration.py` exercises the actual working-mode
status endpoint, then controlled audition/loading/error responses in the browser.
It checks stem-only selection and payloads, a failed/refreshed read after selection,
unchanged settings, and desktop/mobile presentation. It intercepts the scan-start
command: it does not start analysis. Screenshots were inspected at 1200px and
390px; the existing scrollable dialog retains its layout without horizontal
page overflow. The fake Navidrome's expected error notifications are not evidence
of a working-stem failure.

The isolated controller used a fresh temporary state directory with three
synthetic library/history rows, a loopback stub analyzer reporting capabilities,
and unreachable fake Navidrome/mixer/stream endpoints. No station data or files
were copied. The new browser checks pass; the existing Library search verification
and all six query-cache verification checks pass. All nine admin-query audit tests
and the static query audit pass; the UI detector reports no findings. Temporary
services have been stopped and their generated web config changes reverted.
This validates the operator UI and its command boundary, not real Demucs timing,
rendered audio or a live mixer handoff. The wider candidate's audio path is still
covered by the existing controller/worker integration tests; a full real-audio
candidate audition remains before broad station rollout.

Final web lint and full type-check pass without warnings. On 2026-11-18 the
candidate was deployed to the proper test station from this branch. Controller,
analyzer and web were rebuilt; the existing broadcast container was left running.
The controller is healthy with `SUBWAVE_REGULAR_STEMS_ROLLOUT=working`, and the
analyzer reports regular-stem contract version 2. The existing `/media/ssd/stems`
mount remains attached; no old cache files were removed and no library scan was
started. Previous controller, analyzer and web images were retained under
`pre-regular-stems-20261118` tags for rollback.

The remaining acceptance gate is operator listening on real queued pairs, with
attention to eight-bar timing, the selected stem order, CPU preparation time,
and ordinary-transition fallback when preparation or pairing is unsuitable.
The working-mode gate is enabled only on this test station. Do not require a bulk
grid refresh or delete retained cache files as part of the audition.

### Combined PR #10 update — 18 November 2026

The Sub/Beats draft now carries the regular Stem Blend working-cache implementation
on the same shared-grid baseline, as requested, rather than splitting the work
into a second PR. The existing test-station selection gate remains in place while
the wider implementation is reviewed and auditioned.

- Sub/Beats cue preparation consumes the shared, provenance-stamped beat grid;
  its existing saved-stem preparation, cue safeguards and beat-matched renderer
  remain intact.
- Mixing Desk and on-air waveform views use playback-clock/source-cue alignment,
  and stem previews wait for confirmed mixer start before presenting an audible
  mix position. Prepared waveform peaks are reusable and source-stamped.
- Regular blends use measured native-tempo eight-bar windows and CPU-only
  pick-time extraction. A qualifying outgoing track gets a tail first; an
  incoming head is requested only for an eligible regular pair. The working
  cache retains the current track plus up to eight queued tracks.
- Sub/Beats-admitted tracks stay reserved for Sub/Beats regardless of saved
  coverage. Crossovers use an ordinary transition. Legacy regular cache filling
  and upgrades are on hold; old files remain untouched. Unsupported or late
  preparation falls back to an ordinary transition.
- The operator status and Library scan controls describe the working mode and
  keep saved Sub/Beats preparation separate. The internal regular-pair audition
  gate is not yet removed.

Final focused verification on the combined branch: controller regular-stem tests
(30), Sub/Beats tests (92), now-playing/waveform tests (25), controller lint and
TypeScript, web waveform tests (10), regular-stem status tests (3), and web lint
and TypeScript all pass. The cleanup regression now matches the cache invariant:
deleting quarantine-only data does not mark the live-cache usage snapshot stale.
The branch has not been newly deployed or broadly enabled by this PR update;
real queued-pair listening and CPU timing remain rollout evidence, not inferred
from these automated checks.
