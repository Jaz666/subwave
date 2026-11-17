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

Implementation order is 1 → 2 → 3 → 4 → 5 → 6, with tests added alongside each change. Keep the regular Stem Blends change reviewable separately from the existing Sub/Beats draft PR, while sharing the agreed grid and analyzer contracts.

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
