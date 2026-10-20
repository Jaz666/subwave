# Extended Sleeve Notes: integration review and regression evidence

This is the review map for code that crosses from Extended Sleeve Notes into existing Subwave behaviour. Start here when reviewing the feature's effect on the station; the [feature internals](enriched-sleeve-notes.md) describe its own storage, research and operator workspace.

## Comparison and scope

Reviewed on 20 October 2026 against upstream `develop`. The initial review used upstream through `7cb507f5` against fetched `13518df5`. The subsequent Dash conflict resolution merged fork `develop` through `e7510a99`; the original checkpoint below predates that merge. Use the merge-base comparison to identify feature changes, then separately check interactions with newer upstream commits before submission. The current working tree also contains the later manual, review-prompt and styled-confirmation changes.

```sh
git diff origin/develop...HEAD -- controller/src/broadcast controller/src/llm controller/src/settings controller/src/routes/backup.ts
```

The runtime feature is opt-in. **Off does not revert every shared change in this branch.** Banter timing, TTS measurements, LLM telemetry/object handling and bundled fonts have shared effects independently of the master switch. Review those explicitly; some could be submitted separately without removing the feature's integration tests.

## Boundaries reviewers should inspect

Paths in this table are repository-relative. Controller test names refer to files in `controller/scripts/` and are runnable through the repository test runner. Tests use synthetic state; a passing test is not evidence of physical playback or live-provider quality.

| Boundary and main entry points | Required behaviour / intentional change | Automated evidence and limits |
| --- | --- | --- |
| **Ordinary track links** — `llm/internal/prompts/scripts.ts`, `llm/internal/prompts/sleeve-notes.ts`, `broadcast/dj-agent/enqueue.ts` | Selected music remains the input to enrichment. Optional research must not change the pick or require a research database when disabled. Preserve ordinary album/year facts; a Spark is optional. Release reservations when generation or insertion fails. | `verified-facts.test.ts`, `link-style.test.ts`, `sleeve-notes-spark-packet.test.ts`, `sleeve-notes-speech-tracking.test.ts`. New `sleeve-notes-link-isolation.test.ts` proves ordinary link metadata cannot create a research DB or modify a reconstructed older cache while off. Canonical-release metadata is an intentional enrichment only while enabled. |
| **Automatic Banter and skill slots** — `broadcast/scheduler.ts`, `skills/_agent.ts`, `skills/loader.ts` | Eligible automatic Banter first tries Sleeve Notes, including Produced Episodes; unavailable material, a model pass/error or refused delivery falls back. Manual Banter remains Banter. Native segments share optional skill scheduling and respect changed-weather priority, host assignment and cooldowns. Reserve the native kind against skill-name collisions. | `sleeve-notes-segment.test.ts` drives the real `runBanter` with stubbed model/voice boundaries and checks the manual path, fallback and Produced Episodes. It also checks ordinary segment-tick eligibility and slot selection. `talk-scheduler.test.ts` protects the existing plan rules. Some skill arbitration checks are helper-level, rather than a full timer-to-mixer run. |
| **Immediate speech timing, including ordinary Banter** — `broadcast/speech-budget.ts`, `broadcast/speech-timing.ts`, `broadcast/scheduler.ts`, `audio/tts-measurements.ts` | Word targets account for writing, rendering, crossfade and speaking time. Recheck actual rendered duration before publication; reject stale speech if the track changes or the same track starts a new play. Unknown clocks and next-track placement retain their existing handling. This shared timing change also applies when research is off. | `speech-budget.test.ts` now renders both voices before asserting rejection for deadline expiry, a changed track and a replay, for both `banter` and `sleeve-notes`. `tts-measurements.test.ts` checks measured audio/rates and invalid samples. Physical timing and playback remain unverified. |
| **Voice queue, host changes and committed pauses** — `broadcast/queue.ts`, `queue/intro-render.ts`, `queue/voice-io.ts` | Use the existing serialized voice/publication path. Disable drops uncommitted feature speech, but a pause already handed to the mixer retains its voice. Rendering, handoff acceptance and actual air are separate states. Host/show transitions keep their existing guards. | `sleeve-notes-broadcast-gate.test.ts`, `sleeve-notes-segment.test.ts`, `sleeve-notes-speech-tracking.test.ts`, `pause-talk-recovery.test.ts`, `intro-render.test.ts`, `coast-handover.test.ts`. The committed-pause test executes the actual release path and confirms delivery once. Real mixer crash/restart and physical audio are still acceptance work. |
| **Research priority and listener gates** — `server.ts`, `llm/agent-activity.ts`, `llm/internal/agent-factory.ts`, `broadcast/queue.ts` | Research yields to active picking, sending, intro rendering and interactive agents. An already rendered clip waiting for a boundary must not starve research. Empty-station maintenance is explicit and only applies to a confirmed empty station; it never bypasses active broadcast work. | `agent-activity.test.ts` now checks overlapping interactive operations while background work remains active, including failure cleanup. `sleeve-notes-research-policy.test.ts`, `sleeve-notes-broadcast-gate.test.ts` and `sleeve-notes-lifecycle.test.ts` check listener/busy/restore cases. The composition in `server.ts` is inspected code; this is not a full service-startup test. |
| **Shared token allowance and request/picker fallback** — `broadcast/dj-budget.ts`, `sleeve-notes/llm-researcher.ts` | Research consumes the station's shared budget and checks the hard cap before each generation. Blocked jobs remain queued without consuming attempts. Existing request exemptions, picker fallback and optional-speech gates retain their own policies. Research can run below the hard cap, including soft mode; it does not reserve a separate token pool for future DJ work. | `sleeve-notes-token-budget.test.ts`, `request-budget-gate.test.ts`, `coast-handover.test.ts`. These protect hard-cap refusal and existing request/coast behaviour, not a guarantee against two already-running calls overshooting the cap or future budget starvation. |
| **Shared LLM generation, failover and health reporting** — `llm/internal/core/failover.ts`, `core/deferred.ts`, `strategy/object.ts`, `telemetry/`, `stats.ts`, `doctor/checks-services.ts` | Explicit research scheduling interruptions are deferrals, not provider failures. Already billed usage remains recorded. Untagged cancellation and real provider errors retain failure behaviour. Structured output/recovery must continue working for existing callers. | `llm-failover*.test.ts`, `llm-deadline-hits.test.ts`, `llm-context-window.test.ts`, `sleeve-notes-wikipedia-llm.test.ts`. Tests cover real SDK paths with stubbed providers, deferrals and racing failures. Full live-provider and call-cost matrices remain outstanding. |
| **Library identity and manual play queue** — `music/library-db/tracks.ts`, `music/subsonic.ts`, `routes/dj.ts` | Extra library IDs and complete-catalogue reads support matching without downloading music or choosing unrelated replacements. Station Brain uses the existing operator queue and blocklist. Recheck master enablement after asynchronous lookup. Ordinary Library queueing continues while off. | `brain-queue.test.ts`, `sleeve-notes-lifecycle.test.ts`, `sleeve-notes-library-connections.test.ts`, `subsonic-retry-safety.test.ts`. Includes late disable, late blocklisting, artist/album confinement and ordinary queueing. Synthetic catalogue coverage does not establish behaviour on every Navidrome version. |
| **Settings, credentials and upgrades** — `schemas/settings.ts`, `settings.ts`, `settings/defaults.ts`, `settings/patch-registry.ts`, `settings/store.ts`, `routes/settings/core.ts` | Legacy/malformed values default off; partial updates survive cold reload. Collection pause remains distinct from master disable. Redacted Genius credentials must not overwrite the saved token or mutate unrelated settings. The web schema is generated from controller schemas. | `extended-sleeve-notes.test.ts`, `sleeve-notes-settings-lifecycle.test.ts`, `sleeve-notes-upgrade.test.ts`. New credential coverage checks redaction, the `set` sentinel, explicit clearing and unrelated TTS/crossfade/welcome settings. Upgrade fixtures reconstruct historical schemas; they are not archived production files. |
| **Backup, restore and child-process cache** — `backup/zip.ts`, `routes/backup.ts`, `server.ts` | Include existing research even when disabled, using a SQLite snapshot with WAL contents. Archives without research preserve the current collection. Reject invalid/future stores or conflicting work before applying media/settings. Stop/pause writers around replacement and invalidate worker caches. | `sleeve-notes-backup.test.ts`, `backup-routes.test.ts`, `backup-restore-guards.test.ts`, `sleeve-notes-connection-process.test.ts`, `sleeve-notes-lifecycle.test.ts`. Real disk/child-process tests cover stale patches, equal-revision replacement and interruption recovery. Restore during physical committed audio, failed upgrades and child hard-timeout scenarios remain gaps. |
| **Admin shell, Dash and existing settings UI** — `web/components/admin/AdminShell.tsx`, `DashPanel.tsx`, `SettingsPanel.tsx`, `settings/`, `SectionTabs.tsx` | Feature-off navigation/cards are hidden; ordinary admin navigation remains. Use the existing authenticated query cache and invalidation, theme tokens and confirmation dialog. Do not issue writes merely by opening a confirmation. | Web `dash-sleeve-notes.test.tsx`, `sleeve-notes-master-switch.test.tsx`, `notes-overview.test.tsx`, `airing-reviews.test.tsx`, plus the admin-query audit/self-tests. These are static renders/logic checks, not evidence of keyboard focus, cancel/confirm interaction or browser layout. |
| **Build and typography** — `web/app/layout.tsx`, `web/app/fonts/`, `web/DEPENDENCIES.md` | Bundled fonts avoid build-time Google requests but affect all pages, independently of research enablement. Keep attribution/license files and dependency compatibility records. | Earlier production builds were checked with font requests blocked; those checks predate the latest changes. A fresh image/build smoke test and visual comparison are required before claiming the latest state is verified. |

## Improvements made during this integration review

1. **Fixed a disabled-mode leak in ordinary link metadata.** `sleeveNotesFor()` used to call the canonical-release repository even while research was off. That opened/created its DB, and could migrate an older cache. Both disabled-state regression cases failed before the fix; gating the optional lookup leaves the ordinary library packet intact and makes both pass. A third case proves enabled canonical enrichment still works and disabling returns to library metadata without changing retained research.
2. **Removed a false-positive timing test.** The previous deadline test used `sleeve-notes` with the master switch off and returned before rendering. Adding the render-count assertion reproduced the gap (zero renders instead of two). The replacement enables the feature and checks six combinations of speech kind and deadline/track failure. No timing production change was needed.
3. **Extended shared priority tests.** Background activity can remain active without blocking itself; two overlapping interactive operations keep research blocked until both finish; failure releases only its own priority.
4. **Extended settings-boundary tests.** Saving the redacted Genius token preserves the actual credential through a cold reload, while explicit clearing works and unrelated settings remain intact.

## Reproducing the checks safely

Run controller tests through `npm test` from `controller/`. Its runner creates a temporary `STATE_DIR`; do not call individual test files directly. No verification here requires a live station, real credentials, paid model calls or playback controls.

```sh
# Feature plus its close integration checks
npm test -- sleeve-notes
npm test -- extended-sleeve-notes
npm test -- brain-queue
npm test -- speech-budget
npm test -- agent-activity
npm test -- verified-facts
npm test -- link-style

# Existing shared behaviour affected by the integration
npm test -- pause-talk
npm test -- talk-scheduler
npm test -- llm-failover
npm test -- llm-deadline-hits
npm test -- llm-context-window
npm test -- tts-measurements
npm test -- intro-render
npm test -- backup-routes
npm test -- backup-restore-guards
npm test -- coast-handover
npm test -- request-budget-gate
npm test -- subsonic-retry-safety
```

Some filters overlap; their test counts must not be summed as unique coverage. Also run the four package lint/type gates, generated schema/theme checks and the web tests/admin-query audit before the next publication. The earlier full-suite checkpoint and its limits are recorded in the [audit follow-up](../investigations/2026-10-20-extended-sleeve-notes-audit-follow-up.md).

## Verification checkpoint — 20 October 2026

The focused controller selection passed **536 tests across 66 distinct files**, with no failures. That count excludes overlapping reruns: the broad `sleeve-notes` discovery ran 44 files / 299 tests before the new link-isolation file existed, and the latter passed separately (three tests). The existing verified-facts, link-style and Spark-packet tests were rerun after the lookup guard changed. Other feature tests ran before that final guard; this is a focused checkpoint, not a later full-suite result.

Targeted lint passed with the existing five `any` warnings in the ordinary metadata helper and no errors. Controller type checking and `git diff --check` passed. The last web checkpoint passed 246 tests and the query audit; no web implementation changed during this integration review. No services were rebuilt or restarted, and no live settings, databases or broadcast controls were changed.

The two failing-before disabled-store cases and the false-positive deadline demonstration are retained as regression coverage. Tests mock model/catalogue/voice boundaries; reconstructed old-cache files and synthetic local HTTP servers do not establish production database or audio behaviour. The final implementation and test changes remain local pending publication.

## Acceptance work before upstream review

- Reconcile the feature with newer upstream commits, then rerun the full controller and web suites and required lint/mirror gates on that final state. This focused review is not a claim that the current working tree was tested against unmerged upstream code.
- On an isolated station, compare feature-off operation to upstream: normal picking and requests, links, show changes, Banter, and empty-station behaviour. Include slow/failing research while picking and speech are active. Synthetic timings do not prove an uninterrupted broadcast.
- Exercise disable/re-enable during lookup, writing, rendering, a waiting segment and committed pause; include a show handoff and restart. Confirm no unexpected speech, duplicate delivery or unfilled pause.
- Browser-check existing Settings and Dash as well as Notes, including keyboard navigation, focus return and cancelling each confirmation without a write. Confirm query state is cleared across sign-out/account changes.
- Test real older backup files and recovery from failed upgrades/restores; distinguish this from the reconstructed fixture coverage already present.
- Review live-model source support and contextual wording, particularly punctuation and relative dates. Mocked prompt tests establish the instructions and data sent, not model compliance.

## Optional Genius capture

`sleeve-notes-no-genius.test.ts` exercises a fresh collection with a saved key but capture disabled, preservation of older queued work, continued MusicBrainz/Wikipedia job admission, missing-key transport refusal, real library artist/album/track browsing with mocked catalogue responses, Wikipedia Spark selection and native-segment publication with an injected generator, and re-enable with a mocked Genius request. No Genius source is needed for library browsing or Wikipedia speech.

New Genius job admission is gated at the shared repository enqueue boundary, with separate guards for the raw album-pilot insert and library seed preparation. Turning capture off does not delete existing work or prevent use of retained research. Genius jobs that cannot run are excluded from the autopilot pending-work gate and Genius album jobs do not occupy the active article allowance. This lets Wikipedia proceed while existing Genius work waits. Missing a key still permits jobs to be queued for later setup; the worker refuses requests until configured.

The Station Brain notice and discovery empty-state tests cover off (with or without a key), enabled/missing-key, and enabled/configured states. Existing saved discoveries remain visible in every state. Research activity prioritises runnable work over paused Genius jobs and labels a paused-only queue explicitly. These are synthetic and static-render checks; a live fresh-user browser/playback run is still separate acceptance evidence.

Validation for this optional-capture change: the Sleeve Notes selection passed **309/309**, followed by **6/6** dedicated no-Genius cases after adding the saved-data preservation case (five were already in the broad selection). Full web tests passed **284/284**, including disabled/missing-key notices, saved discovery visibility and queue presentation. Targeted lint, controller/web type checks, the admin-query audit and diff whitespace checks passed. There were no live Genius calls, live-state changes or deployments.

## Wikipedia article retention — schema v58

Full Wikipedia prose is a temporary research cache. Completed scans keep it for 24 hours to allow prompt previews and initial diagnosis. The existing hourly maintenance callback, guarded by master enablement, collection pause, shared quiet checks and restore coordination, reduces up to ten eligible sources to exact supporting passages with nearby context. A completed source without retained facts can lose all substantive article text. Articles whose entire body is needed as evidence may show little or no saving.

The cleanup keeps source IDs, revision URLs, attribution and the original full-article fingerprint (`content_hash`). A non-null `wikipedia_pruned_at` explicitly means the stored `content` is now evidence/context, not the original complete article represented by that fingerprint. It leaves claims, corrections, airing records, review snapshots and provider data outside Wikipedia unchanged. Pending/incomplete/failed research, unresolved reviews or moderation, outstanding refresh intent and citations that cannot be located exactly all prevent pruning. An entity whose refresh finished need not wait for unrelated entities in the global refresh plan.

A researcher encountering cleared text schedules the ordinary Wikipedia source worker and defers without a generation or lost attempt. Refetching an unchanged revision reuses the source ID, restores full text and resets completed scan checkpoints so extraction really runs again. Refetching a newer revision uses its own source identity. The source-retention transaction also prevents duplicate NULL-revision inserts, including the Series duplication found during storage inspection; it does not delete existing duplicate rows.

Prompt preview returns an explanatory 409 for cleared articles and directs the operator to request research again. The replay utility excludes cleared sources; reviewed import tools retain their full-content fingerprint checks. The public guide explains the one-day cache window and possible refetch. Research response/scan history retention is unchanged by this policy.

SQLite makes freed overflow pages reusable; no VACUUM, forced checkpoint, live file replacement or immediate disk-size reduction is part of cleanup. Migration adds the marker/index without deleting content. The live station database was inspected read-only and was not migrated or cleaned during development.

Validation: the feature suite passed **317/317** before the last two retention cases and the completed-entity/global-plan refinement. The final dedicated retention suite covers evidence/context and correction preservation, the grace period, incomplete/failed/disabled/paused work, active reviews and moderation, global refresh plans, original-revision rehydration, resumed extraction, NULL-revision deduplication, bounded batches, another provider, preview refusal and a reconstructed v57 cold upgrade. The existing backup-route tests also passed. Controller type checks, targeted lint and manual rendering/lint passed. These synthetic checks do not establish physical playback or an immediate reduction of the live database file.

### Series sweep and source retention are separate

Series contents are still checked after 30 days. An unchanged successful snapshot updates its refresh metadata without rebuilding facts, links or the library cursor. New/changed membership (including titles or ranks), or operator list configuration changes, requests a full library sweep. The sweep walks 25 albums per quiet pass, records each completed album, then stays idle indefinitely; a restart resumes its saved cursor rather than resetting it. Existing installations finish their currently scheduled sweep once before settling.

Schema v59 adds a small per-album fingerprint and pending flag. The existing connection catalogue worker observes album title/MBID and song IDs/MBIDs during its ordinary scan; only new/changed fingerprints enqueue Series matching. This shares catalogue discovery without another daily Series walk. The Series worker reads at most 25 pending album details per quiet pass. Deleted albums leave the pending list after a successful complete catalogue sweep. Errors retry without advancing past the failed album or waking an idle full sweep; completed albums on the page do not repeat. Changes become visible when the existing catalogue scan reaches them, rather than immediately at Navidrome ingest.

Nullable-revision source duplication was a separate shared-retention defect, now prevented for new writes. Existing duplicate sources are not removed by these changes. Tests exercise the actual two workers together, unchanged refresh/restart idleness, new/changed/deleted albums, membership/rank refresh, page-error recovery and quiet/master/pause gates. No source cleanup or VACUUM is performed by the schema migration.


## Station candidate — 20 October 2026

The operator requested the Series scheduling change and a station rebuild, and confirmed their database backup before deployment. Candidate includes the previously local optional-Genius, review/context, confirmation-dialog, manual and Wikipedia cache changes as well as the Series work. Schema v59 adds album scheduling state without deleting saved facts. Automatic Wikipedia cleanup is included; existing Series duplicate removal and VACUUM are separate operations.

Checks before deployment: **323/323 Sleeve Notes tests**, **9/9 Series tests** (the four new worker cases are also in the broad selection), **284/284 web tests**, controller lint/types and web lint/types, and the admin-query audit. Final check results and deployment identity are recorded below after verification. Production services to rebuild are controller and web; broadcast/mixer and other services remain running. Rollback starts with the pre-update controller/web image tags; both schema additions are additive. Source base remains the existing fork develop merge e7510a99; newly fetched upstream commits are deliberately outside this candidate.


Deployment completed: source candidate **3862e098**, built locally and started with the station's existing three compose files, replacing only controller and web (`--no-deps`, no image pulls). Both started successfully; controller health and public `/api/health` returned healthy/200. `/manual/sleeve-notes` returned 200 and contained the new Series guidance. Hashes of the four running controller files covering schema, Series scheduling and Wikipedia retention matched the tested source. A read-only live query confirmed schema v59 and the new album scheduling table. The broadcast container ID and start time were unchanged. This is an operational health check, not an audio listening test.

Rollback images are tagged `subwave-rollback/controller:before-series-idle-20261020` and `subwave-rollback/web:before-series-idle-20261020`. Pre-update local source is preserved in the named stash `station-source-before-series-idle-20261020`; it is intentionally not reapplied because the candidate contains that work. The operator confirmed their own database backup. No manual article pruning, duplicate deletion, VACUUM or station setting changes were performed. The hourly quiet-time retention callback is now enabled in the running controller; existing Series sources remain in place. Next: observe the current Series sweep finish and settle, then assess historical duplicate cleanup separately against the backup.
