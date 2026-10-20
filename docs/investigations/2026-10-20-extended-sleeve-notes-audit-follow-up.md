# Extended Sleeve Notes — audit implementation follow-up

20 October 2026. Implements the four reproduced defects and repairs the existing test baseline from the [contribution-practices audit](2026-10-20-extended-sleeve-notes-contribution-practices-audit.md). All earlier uncommitted station/feature work remains present. At this audit checkpoint, nothing had been committed, pushed or deployed. The subsequent PR publication checkpoint is recorded below.

## Changes

- Genius matching retains Unicode letters and script-specific marks instead of collapsing non-Latin titles and artists. Existing Latin accent tolerance and artist punctuation variants remain; empty identity keys, unrelated recordings and ambiguous matches are refused. Search, direct detail and album checks use the same identity behaviour.
- Scheduled Recycle Bin cleanup checks master enablement and the shared quiet gate before opening a database. Enabled maintenance participates in restore coordination. Disabling therefore cannot create/migrate the collection via this timer.
- Artist population, including the scheduled freshness read, participates in restore coordination. Automatic population receives the shared broadcast/interactive quiet gate. Settings changes permanently invalidate an interrupted operation, including disable followed by re-enable before its old HTTP response returns. Manual population retains its explicit operator behaviour while the feature is enabled.
- Station Brain queue selection checks master enablement again after awaited catalogue work. The following insertion is synchronous through the queue's existing blocklist/operator guards. Ordinary Library/manual queueing retains its behaviour.
- Segment generation checks its cancellation signal again after generation, so a late response cannot publish even if the feature was re-enabled after cancellation. Mixer-committed silence retains its matching voice, as before.
- The 19 failing existing tests have been repaired without removing the substantive queue or read-only compatibility assertions. Intentional disabled API policy is now tested as 409; internal historical-cache reads remain independently checked as read-only. MusicBrainz job assertions explicitly select that provider while confirming independent Genius work remains queued. The readout expectation includes its existing availability/operator fields. Enabled queue fixtures now account for encounter admission creating local attachments.
- The feature internals now open with a current runtime-policy matrix, clearly separating it from historical design notes. A test-only `let` became `const` to satisfy the web lint gate.

## Added regression coverage

- Four original failing reproductions became permanent lifecycle tests; all four failed before the fixes and pass afterward.
- Lifecycle tests also verify a late blocklist change at the real queue boundary and ordinary Library queueing while the feature is off. They exercise an unchanged older cache under disabled cleanup, cleanup during restore, population refusal during restore/busy broadcast, disable/re-enable during held population, and a fresh attempt after interruption.
- Unicode fixtures cover Japanese titles and voiced marks, Cyrillic, Arabic, accents, competing artists, recording-version differences, empty keys and album identities. Direct provider HTTP is replaced at its boundary.
- Controlled generation completes after cancellation and re-enable; the test asserts no publication or reservations.
- The actual pause-and-talk release path retains a committed Sleeve Notes voice after disable and acknowledges it once, rather than leaving the silence without speech.
- An on-disk child-process test covers shared overview requests, WAL-backed reads, equal-revision cache invalidation, worker interruption/recovery and stale patch refusal. It does not replace the existing in-memory relationship tests.
- Reconstructed v55/v56 database files preserve operator corrections, historic aired wording, feedback and queued jobs through migration, repeated migration and cold reopen. These are reconstructed historical schemas, not archived production databases.
- Missing/malformed legacy master/collection settings and both switch directions are tested through actual save and cold reload.

## Verification

The full web test suite passed: **245/245**. The original Sleeve Notes focused run passed **283/283**, including the initial four permanent reproductions. Subsequent additions were also run separately: Unicode/provider tests **8/8**, lifecycle tests **8/8**, graph process tests **3/3**, segment tests **31/31**, pause-and-talk recovery **11/11**, upgrade **1/1**, settings lifecycle **1/1**, Station Brain queue **10/10**.

The full controller run passed **4,854/4,854 tests across 486 discovered files**, with zero failures, cancellations or skips. The newly added upgrade and settings files were created after full-suite discovery and passed separately (**1/1 each**). The final lifecycle, generation and provider cases also passed their focused reruns.

All four package lint/type gates passed (controller, web, app and MCP). Controller lint reports warnings and no errors; final new-test lint and controller type checks passed. Theme and schema generation produced no mirror diff. `git diff --check` passed.

Controller tests used the repository runner and temporary state. Feature regressions replaced external HTTP with synthetic fixtures. No check used the live station database, settings or broadcast, and no paid provider calls were made. Some unrelated legacy full-suite checks attempted the default `navidrome:4533` service; those attempts failed DNS rather than contacting the configured live library. The full controller run began before the final small lifecycle/test additions; those changes have separate focused verification, rather than claiming that an earlier run covered a later edit.

## Offline scale measurement

A disposable synthetic collection contained **67,000 library tracks**, **1,000 canonical recordings** and **1,000 sample relationships**. Network access was forbidden in the benchmark. Source/claim retention used the production repository; reconciliation and overview calculation used the real child process; availability used the production lookup. Individual availability calls yielded between samples to avoid presenting an artificial 100-request synchronous burst as a normal route.

One run while other local checks were active measured:

| Operation | Result |
| --- | --- |
| Source/claim retention | median 0.80 ms; p95 1.09 ms; maximum 24.51 ms |
| Background reconciliation including child startup/publication | 1,133 ms total |
| Overview via the already-started child | 111 ms total |
| Per-track availability lookup | median 3.55 ms; p95 5.62 ms; maximum 7.52 ms |
| Idle event-loop sample | p95/maximum 16.00 ms |
| Workload event-loop sample | p95 13.29 ms; maximum 83.69 ms |

These are synthetic observations, not a latency guarantee, a live-station result or proof of playback timing. The short idle sample and concurrent local checks limit comparison. Child computation is separated from synchronous lookup measurements, but publication has not been timed independently here. The benchmark source and result remain in `/tmp/subwave-esn-synthetic-perf.mts` and `/tmp/subwave-esn-fixes-perf.log`.

## Remaining audit recommendations

The fixes do not claim to complete the entire longer-term validation programme:

- Retry-After handling and allowing cached expansion during worker-wide Genius backoff remain the previously documented provider enhancements. No request-rate or traversal-depth policy changed.
- Broader provider fallback/call-cost matrices and child hard-timeout simulation remain additional coverage beyond the new worker interruption/recovery checks.
- Representative archived v45/v52 upgrade fixtures, failed-upgrade recovery and physical restore during committed audio remain further exercises; existing WAL-safe backup/restore tests are retained.
- Browser interactions, screenshots, live-model reliability, image/runtime smoke tests and physical playback were not performed. No browser automation was available in this environment. Static web tests do not establish those behaviours.

A **controller rebuild** is needed for these runtime fixes. Rebuilds/restarts and live setting changes remain the operator's decision. The previously added manual and other existing web work need their own web rebuild if they have not already been deployed.

## PR publication checkpoint — 20 October 2026

The follow-up is being included in fork draft PR #5 with the earlier master-switch, Series cooldown, matching, airing-filter and manual changes. Navigation now shares its icon definitions; Review counts use the theme primary colour in both menus and remain visible on the closed Notes group. The Overview review-ready text aligns with Saved knowledge. The latest full web suite passed **246/246**, including the admin-query audit self-tests; web lint/type checks and the admin-query audit passed. Controller evidence and remaining validation limits above still apply. No deployment is part of PR publication. Historical handovers retain their original local/unpushed status descriptions for their respective checkpoints.
