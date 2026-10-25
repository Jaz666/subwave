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


## Historical duplicate cleanup — 20 October 2026

After the operator confirmed their backup and requested cleanup, **20,526 unreferenced MusicBrainz Series source documents** were deleted. All **2,263 referenced Series sources** remain; a final grouping by source identity/revision/hash found **zero duplicate groups**. Eligibility required equal entity/provider/URL/revision/hash, content kind, actual content, attribution and pruning marker, with another identical source retained. No existing reference was redirected.

A consistent SQLite copy was rehearsed first. Every non-source table was compared before/after and remained byte-for-byte equivalent at the row-value level; retained source identities/hashes and foreign-key checks were unchanged. Repeated cleanup was a no-op. Additional copy checks covered 250/500-row batches and refusal of a stale audit after a concurrent writer committed. The initial audit searched every other table's text, including JSON/history/raw responses. A faster audit over declared foreign keys and source/JSON/response columns returned exactly the same protected records and candidates.

Live work used the controller container's existing write access (the host connection was read-only), without changing file permissions or restarting services. Deletions committed in batches of at most 250 rows, generally around two seconds. Audits ran outside the write lock; a `data_version` check under the lock rejected stale results and caused a fresh audit after background writes. Interrupted/deferred attempts rolled back their current transaction; completed batches remained valid and resumable. Final totals include all committed batches.

The deleted content itself was **6,338,930 bytes**; including freed table/index pages, **4,740 pages / 18.52 MiB** were reusable at the final check. Ongoing station writes may consume those pages. The database file was not compacted and need not shrink. Final read-only `quick_check` returned `ok`, `foreign_key_check` returned no violations, and station health returned HTTP 200. Facts, supporting evidence on retained sources, corrections, connections and airing/history records were preserved. No recurring duplicate-cleanup job or product code was added; the deployed source-retention fix prevents new instances of this NULL-revision duplication defect.


## Saved knowledge: library connections — 20 October 2026

Overview labels its relationship total **Library connections**. Following the 21 October navigation adjustment, Library connections and Credits both open Station Brain; Stories opens its saved-facts view. The synthetic `library-connections` Stories filter remains available through the category selector. The count requests that same paged endpoint with `limit=1` and uses its `total`; there is no independently maintained count. Existing `connectionClaims` and the ordinary `musical-connections` filter keep their all-saved semantics. Stats & Discoveries exposes that wider count as **All saved relationships**, with a link and an explanation of outside recordings and evidence from either direction.

The shared SQL selection admits only enabled musical-connection claims with an unchanged evidence snapshot, a matched recording edge and both endpoints in the current library catalogue. Source membership uses canonical attachments, Genius local/seed associations or a matching recording MBID. Existing target matching supplies the strict recording/version and ambiguity policy. MBIDs or shared local recording associations collapse album copies; inverse `samples`/`sampled_in` and `cover_of`/`covered_by` descriptions normalise to the same direction. Sample and cover relationships remain distinct, as do genuinely opposite directed relationships. One stable representative claim is displayed per relationship; user corrections and all other saved evidence remain intact. Withdrawn facts, stale/ambiguous matches, missing endpoints, self-links and writer/producer edges cannot inflate this count.

The query runs through the existing read-only connection child process, so grouping cannot block the broadcast event loop. Summary/status polling retains its previous cheap counters. No schema migration, provider request, data deletion or change to DJ selection is needed. The route remains behind the master switch, including `cached=1`; turning the feature off does not create or modify a cache through this filter. The manual explains both counts.

Checks cover representative pagination/search, inverse and duplicate facts, album copies, outside source and target recordings, credits, stale evidence, withdrawal, ambiguity and library removal. The real child test reads a file-backed cache, yields to the parent event loop and observes later catalogue changes without rewriting that file. HTTP checks compare the count/page result and confirm the disabled-route no-create/no-change boundary. Web rendering checks cover the headline label/filter and the all-saved discovery link.

Validation: **326/326 Sleeve Notes tests**, **285/285 web tests**, controller type check and targeted lint, full web lint/types, admin-query audit and diff whitespace checks passed. Source is prepared on `codex/series-idle-20261020` and fast-forwarded into the station checkout for the operator rebuild. The running controller/web containers and live data are unchanged by this UI/count work; rebuilding both services is the next acceptance step.


## Tester preflight sense check — 21 October 2026

Review-only checkpoint at source `5a9d2bb0`. No production code, station configuration, live data or services were changed. Two gaps were reproduced against synthetic state; these should be fixed before inviting testers:

1. **Changed local identity retains an old match.** `admitLocalEncounterInDatabase` updates title, artist, album and incoming MBID without invalidating `recording_id`/`match_state`. Its match-job upsert only requeues failed/cancelled work, leaving an already completed job complete. Reproduction changed title, artist and MBID for an existing local ID: the attachment remained `matched` to its old recording. Selection trusts that attachment and can still retrieve the old artist/recording facts. Rematch meaningful metadata changes and reconcile Genius/Series associations too. A music-server change deserves explicit coverage: the Settings handler clears ordinary Navidrome/picker caches, but no Sleeve Notes library identity reset is wired there. The same-ID metadata scenario is reproduced; a complete server-switch scenario is not yet tested.
2. **Superseded Wikipedia bodies escape cleanup.** Pruning requires a completed `sleeve_wikipedia_scan_progress` row that still names the source. Refresh archives/deletes the old checkpoint, and the new checkpoint identifies the replacement source. Reproduction kept a supported fact on revision 1, then moved the completed scan checkpoint to revision 2: revision 1 remained unpruned despite its age and no pending work. Retain durable source-completion evidence or make safe cleanup independent of the mutable current-job checkpoint. Preserve citations, corrections and history.

Three further acceptance/documentation gaps need an explicit position:

- **Storage over time.** The hourly callback processes at most ten article sources (240/day before quiet/pause gates). It is not an immediate one-day expiry guarantee under a backlog. Article cleanup does not bound encounter/provider/scan diagnostic history. Decide which diagnostic data can expire, retain operator corrections and required airing evidence, and measure growth rather than imply a fixed database ceiling.
- **Tester installation and rollback.** Supply exact source checkout/build instructions, a complete state/profile backup and restore route, and a clear distinction between switching the feature off and reverting shared timing/LLM changes. Stock published images cannot be assumed to contain an unmerged draft branch.
- **Final combined-state acceptance.** Reconcile the final PR branch with current upstream develop, rerun required gates on that combined state, and perform an isolated station/browser/audio pass covering slow/failed research, disable/re-enable, controller restart and real backup/restore. Existing synthetic tests do not establish these live outcomes.

Focused reproduction evidence: the temporary test file reused the nine article-retention tests and added the two intended-behaviour assertions above plus a corrupt-cache ordinary-link fallback check. **10 passed; the two new gap reproductions failed as described.** The corrupt optional database still allowed ordinary album/year metadata, as intended. Reproduction source and output are retained locally at `/tmp/subwave-preflight-audit-20261021.test.ts` and `/tmp/subwave-preflight-sense-check-20261021.log`; to rerun, copy the test into `controller/scripts/` and use `npm test -- sleeve-notes-preflight-audit`. The temporary failing test was removed from discovery after the review. No broad suites were rerun for this sense check.


## Preflight fixes — 21 October 2026

The two reproduced gaps are now addressed in the source candidate. A shared local-identity check runs for encounters and catalogue updates. Meaningful metadata/MBID changes invalidate canonical, Genius seed/local, Series and resolved local bindings, reset local matching jobs and discard stale MusicBrainz/Genius responses. Cosmetic case/whitespace changes and omitted optional metadata do not restart completed research. Facts, source evidence, operator correction history and other recordings' research remain intact.

Schema v60 adds a source-completion timestamp and a hashed music-server/account identity. Completion is written atomically with a successful Wikipedia scan and survives checkpoint replacement; refetch clears it until a fresh scan succeeds. Upgrade backfill uses only intact completed checkpoints. Existing orphaned revisions without proof are deliberately not retroactively pruned. The normal age, pending-work, review and evidence guards remain in force.

The server/account fingerprint is checked on the feature's writable database path; cached read-only access bypasses it. A changed source resets local catalogue/artist/graph bindings and cancels local-track work, retaining reusable knowledge and histories. Password rotation does not invalidate matches. An existing cache without a fingerprint adopts the currently configured source on its first writable open; it cannot reconstruct a historical server change made before this upgrade. Awaited catalogue/artist/matching responses also check their source before publication. The initial database open now closes a failed migration handle rather than caching a partially initialised connection.

The [tester guide](../testing/extended-sleeve-notes.md) documents source builds, backup/WAL handling, optional sources, station/browser/audio checks, storage limits and rollback. Diagnostics and operator histories are preserved; this candidate does not introduce an automatic history-deletion policy. It explicitly documents the ten-articles/hour ceiling and the fact that internal free space need not shrink the file. Final upstream reconciliation and real station/audio acceptance remain publication work, not claims established by these synthetic tests.

Validation on the completed candidate: `npm test -- sleeve-notes` passed **337/337**, including nine local-identity/source-change regressions, eleven article-retention tests, and the existing migration, backup, Station Brain and feature tests. Controller type checking passed; controller lint completed with zero errors (1,744 warnings). Focused lint of the edited manual component passed. These checks used isolated synthetic state, not the running station. The integration checkout, live database and services remain unchanged. Next: reconcile the publication branch with current upstream develop, run the required combined-state checks, then complete the isolated live acceptance checklist in the tester guide before publication.


## Accidental operator misuse review — 21 October 2026

Read-only behavioural audit of candidate `be5fb84c`, using isolated temporary state. No production fixes or station changes were made during this review. The scope is ordinary operator surprises, rather than hostile public API use.

### Reproduced gaps

- **Removing an incorrect recording tag does not invalidate its match.** An authoritative catalogue update with unchanged title/artist/album and a null MusicBrainz recording ID leaves the attachment matched to its former recording. `invalidateChangedLocalIdentity` treats null as unspecified, and encounter upserts preserve the old ID with COALESCE. Ordinary playback intentionally omits MBID, so globally treating every null as a removal would create repeated rematching. Distinguish authoritative catalogue metadata from partial playback metadata; preserve the latter's existing behaviour. Test removal of artist/album metadata as well, and verify the bad match is not immediately reinstated from the old stored ID.
- **The retained existing-claim editing API accepts a stale correction.** Two sequential valid edits to the same claim are both accepted with no expected revision/precondition. A delayed old save can overwrite a newer correction. The route parses only edit fields. Current airing-review decisions independently compare their stored snapshot with current facts and already reject changed stories; do not describe this as a demonstrated flaw in that screen. Harden the retained editing route if keeping it, and audit other admin clients before deciding its exposure.
- **That editing API can resurrect a deleted fact.** Delete a fact, then submit a valid stale approval/edit through `moderateExistingClaim`: the UPDATE sets enabled=1 and operator_state=approved. The function checks existence but does not reject deleted state. This reproduces through the service used by the admin editing route; the current airing-review flow rejects deleted facts. Ordinary availability restore also explicitly rejects deleted facts. Require an explicit supported recovery operation or reject the stale edit.

Evidence: `/tmp/subwave-operator-audit-20261021.test.ts` and `/tmp/subwave-operator-audit-20261021.log`. The temporary suite reused nine passing identity regressions and added three intended-behaviour assertions: **9 passed, 3 failed**, each exposing one gap above. To reproduce, copy the test into `controller/scripts/sleeve-notes-operator-audit.test.ts` and run `npm test -- sleeve-notes-operator-audit`, then remove it from normal discovery. Earlier invalid synthetic wording/evidence was corrected before the recorded result; the final failures are missing invalidation/guards, not schema validation failures.

### High-value acceptance scenarios, not yet established defects

| Operator action or environment | Risk to exercise | Acceptance requirement |
| --- | --- | --- |
| Bulk retag/move/delete while a paginated catalogue sweep is in progress | Offset pagination can skip albums when the alphabetically sorted catalogue changes between requests. Scan-status checks only observe their sample times. | A changing/partial sweep must not publish wrong local relationships; convergence after a stable sweep must be shown. Test temporary empty pages after a nonempty page, not just the already-covered empty first page. |
| Remove every album, or temporarily lose all library access | The existing safety guard refuses an empty sweep when an old cache exists. This protects transient failures but also means a legitimately empty library cannot clear the cache through that sweep. | Show stale/unknown status rather than present old library membership as verified; define a safe way to confirm legitimate emptiness. Do not remove the transient-empty protection casually. |
| Fill the state volume, change mount ownership, or interrupt a write/backup | Optional research must not block or crash ordinary radio; silent admission failures can make the queue look inexplicably idle. Backup/restore has its own shared-state risks. | Use a disposable limited-volume installation. Verify audible playback, recovery after space/permissions return, and an actionable operator error. Never fill the live station volume as a test. |
| Import a large library and repeatedly press research/refresh in multiple tabs | Duplicate intent, starvation of automatic work, unexpected paid usage, and a backlog mistaken for failure. | Show bounded/deduplicated intent and meaningful waiting reasons; prove ordinary DJ work keeps priority. Use a fake provider/model to count actual requests before any paid test. |
| Change model, context capacity or research prompt while a scan is partially complete | Mixed extraction policies or a permanently failing chunk when a smaller model is selected. | Verify the defined resume/restart policy, no lost operator decisions, useful retry/error status, and no uncontrolled retry spending. |
| Sleep/resume the host or correct its clock backwards/forwards | Persistent next-run/cooldown/retention dates may appear stuck or suddenly eligible. | Fake-clock tests should exercise waiting/recovery and article safety; do not change the station clock. |
| Restore an older backup, or copy a music server to the same URL/account with reused IDs | An older archive can omit the research DB and deliberately leave current research untouched; source fingerprinting cannot detect a replaced server behind an unchanged address/account by itself. | Make retained state visible; test reused IDs with changed metadata, and document the limits when IDs and tags are identical but audio changes. |

Prioritise authoritative metadata removal and the deleted-fact editing guard, then conflict protection for retained editing clients. The catalogue/empty-library scenarios are the next most useful operator acceptance tests. This review does not establish live audio, storage-failure or real Navidrome concurrency outcomes.


## Operator misuse hardening — 21 October 2026

Implemented after the accidental-use audit:

- Authoritative catalogue and explicit Station Brain seed updates compare against cached catalogue tags, including removal. Partial playback encounters still preserve unspecified fields. A catalogue MBID removal clears the attachment's old MBID as well as its match and derived bindings, preventing the next partial encounter from restoring that bad identifier. Automatically inferred attachment MBIDs are not treated as proof that a tag existed: repeated scans of unchanged tagless tracks must preserve their completed matches. Removing the artist also invalidates before an unindexable row is skipped. A tag removal predating the first cached catalogue observation cannot be proven from the overloaded attachment field alone; do not promise detection of that historical case.
- Retired the unused direct `POST /sleeve-notes/claims/:id/approved` and `/deleted` API actions with HTTP 410 and a direction to use the review workflow. Current web clients use withdrawal/restoration and snapshot-checked review decisions, so no active UI was removed. This closes the stale direct-save surface without introducing a second editor/version protocol. `moderateExistingClaim` also rejects already deleted facts for internal callers. Trusted internal edits continue to use their existing transaction/snapshot checks. This does not make arbitrary sequential calls to that internal function an optimistic-concurrency API.
- Catalogue workers recheck master/pause/broadcast/source gates after awaited reads and before publishing. A Navidrome scan observed after an album fetch discards that response and resets the sweep cursor; unknown scan status cannot authorise removal of unseen cached tracks at sweep completion. Existing first-page-empty protection remains. Scan-status checks are local music-server calls; this adds no Wikipedia, MusicBrainz or LLM requests.

Regression coverage exercises real tag removal versus inferred tagless identity, artist removal, explicit Station Brain seed removal, retired direct-edit HTTP responses and unchanged stored state, internal deleted-fact rejection, interruption during both listing and album fetch, mid-fetch Navidrome scanning, and unknown scan state at destructive reconciliation. The existing feature suite also covers idempotent explicit research/retry windows, model-profile calibration, disabled/pause gates, backup restoration and real read-only background cache reads.

Deliberately retained acceptance work: a genuinely empty library still cannot clear an old catalogue via an empty sweep (the same response can indicate temporary loss of access); a safe emptiness-confirmation/status design needs a separate change. A scan that starts and finishes entirely between checks, or server-side pagination changes with no visible scan state, cannot be ruled out by these guards. Real Navidrome convergence must be tested with bulk changes. Disk-full/permissions recovery, changed-clock behaviour, and restored or replaced servers with identical IDs/tags still require disposable-installation tests. No live fault injection, automatic history deletion, speculative timer rewrite or DB reset was performed. These are explicit limits, not passed checks.

Final verification: `npm test -- sleeve-notes` passed **348/348** on the final source; controller `tsc --noEmit` and focused ESLint over all changed controller/test files passed without output. No web source changed. Development worktree: `/home/jaz666/codex/subwave-series-idle-20261020`, branch `codex/series-idle-20261020`. Integration checkout, live DB/settings and services remain untouched. Next publication gate remains reconciliation with upstream develop and combined-state validation, followed by the disposable station/browser/audio acceptance checklist.


## PR #5 and station update — 21 October 2026

User authorised deployment and updating fork draft PR #5. Source candidate **`e5ebbd7a`** merges fork `develop` at `caabaf4c` (upstream through `aaaea562`). The only content conflict was the Dash imports: Sleeve Notes imports remain alongside the updated Never Play/targeted-skip helpers. Both `codex/series-idle-20261020` and PR head `feat/extended-sleeve-notes` were fast-forwarded; PR stays a draft and GitHub reports it mergeable. No upstream PR was opened or review request sent.

Combined-state evidence:

- Full controller suite: **5,389/5,389**, 523 files, using `npm test -- --jobs 2` and isolated state. No failures/skips. Some legacy background paths attempted the default unresolved Navidrome hostname and logged DNS/retry errors; this is not evidence of real provider connectivity. The focused Sleeve Notes run also passed 348/348.
- Full web suite: **305/305**. All four package lint/type gates passed (controller, web, native app and standalone MCP); controller lint reported 1,762 warnings and zero errors. Theme/schema regeneration matched staged source, and controller/web schema dependency ranges matched.
- Focused upstream integration checks passed for jingles (73), skip (30), mixer seams (7), package scripts (2), test headers (4), temporary-directory cleanup (3), isolated state (10), generated schemas (20), and MCP (21). These overlap the full suite and are not added to its count.
- Controller/web/broadcast production image builds all passed. The initial controller/web build at `4659f299` was superseded before any restart; only the merged candidate was deployed.

Operational state: integration checkout `/home/jaz666/Docker/subwave`, branch `test-station/sleeve-notes-clean-20261014`, fast-forwarded from `5a9d2bb0` through `e5ebbd7a`. Recreated only broadcast, controller and web with the existing `docker-compose.yml`, `docker-compose.analyzer-gpu.yml` and private Discord override; no env/compose/settings edits, stack down, volume removal or manual broadcast action. Broadcast/controller report healthy and web is running. `/api/health` reports `on-air`; the stream audio probe measured **−15.3 dB**. Research DB reports schema **60**, the durable completion column and one adopted source namespace.

The repository deployment health script returned nonzero solely because its substring log scan matched `error-*.js` in a Caddy INFO access record with HTTP 200. Endpoint/audio checks succeeded, and no controller/broadcast error was reported by that scan. This is a probe false positive, not a clean script exit or a silent stream. No full live content-quality, browser or recovery trial is claimed.

Rollback material retained privately in station state: online SQLite snapshot `sleeve-notes-before-v60-20261021.db` (schema 59, 575,442,944 bytes, `quick_check=ok`), plus image tags `subwave-controller:rollback-20261021-pre-v60`, `subwave-web:rollback-20261021-pre-v60` and `subwave-broadcast:rollback-20261021-pre-v60`. Prior controller image `7985a6aa2601`, web `761d2579325e`, broadcast `cb388b790c7d`; deployed controller `956d1a3f3172`, web `cb7ebb4c875c`, broadcast `55a7509adc05`. Any rollback must stop the DB writer before restoring the matched snapshot/code/images; do not copy over a live database. The snapshot is not committed. Refer to the tester guide for the full backup/WAL/restore procedure.

Next: user evaluates the deployed station, then complete the remaining live browser/audio/recovery and failure-environment checks before upstream submission. Subsequent documentation-only commits do not require another image rebuild.


### Review screenshot preparation — 21 October 2026

Candidate `39ca5a61` places Manage withdrawn facts at the right of a wrapping, spaced review-status toolbar. Seven existing review UI tests and focused ESLint passed; the UI mechanical detector reported no findings. Web production build/type checking passed and only web was recreated on the integration station. Controller/broadcast retained their existing start times. Health remains on-air and a six-second stream probe measured −15.5 dB. Code was pushed to both the development branch and fork PR #5; the description was not edited. On the next description revision, lead with opt-in/off-by-default operation and autonomous play-driven research, pacing/resumption and DJ selection without routine operator queue management or per-story approval. Refresh the outdated PR images before upstream submission; manual screenshots remain deferred.


### Overview queue controls — 21 October 2026

Overview → Research activity now exposes Send to top and Cancel job only inside expanded Show queue sections, including a single-job queue. The normal collapsed view stays compact. Promotion orders eligible work within its worker, across supported task kinds, without clearing source backoff, run-after delays, first/next-play requirements, master/pause gates or the shared LLM budget/pacing. Promoted rows are labelled. Promotions are consumed at the start of the requested attempt; a deferred/failed attempt can be promoted again.

Cancellation is a transaction on queued work, clears pending rescan intent and promotion, and retains source text, facts, checkpoints, attempts and correction history. Cancelling a queued review dismisses it without changing fact availability. Running jobs cannot be promoted or cancelled: buttons disable and the API rechecks current state, returning 409 if a stale click targets a now-running or finished job. The styled cancellation confirmation explains that automatic research can be queued again. Cancellation does not mean a permanent per-subject exclusion or an in-flight provider abort.

Schema v61 adds a small durable promotion table and a last-slot-kind field on research pacing. Under contention, ordinary LLM reviews and research alternate available slots, rather than waiting for either entire queue to drain or starving research behind failed reviews. Explicit promotions take precedence. Both kinds still reserve the existing shared slot and obey its safeguards. The additive migration tolerates a partially applied new column/table. Readout batches promotion metadata instead of adding a query per queued row.

Validation: final controller Sleeve Notes suite **353/353**, full web suite **306/306**, controller/web lint and type checks, admin-query audit and its nine tests passed. UI mechanical detection reported no findings. Regression checks cover durable promotion/reopen, retry-gated selection, consumed promotions, current-state rejection, cancelled refresh markers, saved fact/source/checkpoint/history preservation, review dismissal, authenticated/disabled/invalid API requests, promotion readout, scheduler fairness in a new worker instance, and collapsed-only controls/running disabled states. The reconstructed v38 fixture now includes its historical pacing table. Initial failures exposed a duplicate synthetic subject key and incomplete historical fixture; both were corrected before the final full feature run.

Per user instruction, this update is source-only: no container build/restart, live DB migration, settings change or manual queue operation. Copy the committed candidate into `/home/jaz666/Docker/subwave` by fast-forward for the user's controller/web rebuild. Live runtime remains the previously deployed v60 code until that rebuild. PR #5 code is updated; its description remains unchanged, retaining the requirement to lead the next description revision with opt-in/autonomous operation. Next: user rebuilds controller/web, checks health and tries the expanded queue controls; running-call cancellation remains deliberately unsupported.


### Historical-event wording in track links — 21 October 2026

Added one instruction to the normal generateLink/linkPrompt rules: preserve supplied facts’ time framing, retain past-tense wording and explicit dates for past events, and do not recast history as a recent development. It uses the supplied wording/date, without relying on the current date or adding a separate model call. The announce-only path, saved facts and review model remain unchanged. Focused checks: Story Spark packet 7/7, link-style 19/19, focused ESLint and controller type checking passed. These verify prompt assembly and the existing link paths, not guaranteed model compliance; no full-suite or paid/live-model evaluation was repeated for this one-line edit. Update fork PR #5 code and description, retaining the operator’s new screenshot links and leading with opt-in/off-by-default autonomous operation. Source-only handoff: copy the committed source to the integration checkout, leave container rebuilding to the user; no live DB/settings or queued reviews were changed.

### Dashboard reads and controller responsiveness — 21 October 2026

Investigation of the 13:30 BST cron warning found controller-wide HTTP timeouts, and regular Sleeve Notes readout responses around 1.8–1.9 seconds. This does not establish the cause of the longer stall: host CPU/disk contention and other controller work remain possible contributors. Provider request elapsed time is not evidence of synchronous controller blocking.

Overview readout (including research queue phase calculations, review/promotions metadata and Genius queue totals), live-summary candidate counts and Heard on Air database reads now use the existing read-only connection-compute child. The child opens a read-only WAL snapshot, performs the calculation and serializes its result. Queue decisions, reservations, corrections, feedback and final action validation remain on the controller using current state. Legacy transcript recovery still reads session archives in the controller; this change moves its database shelf calculation, not archive JSON processing. Other dossier/explorer endpoints and write-side work are outside this change.

Display calculations share in-flight requests and a bounded four-entry cache with a three-second lifetime. The key includes request inputs, DB path and the calling connection's total-change counter: writes on that connection invalidate immediately. Separate read-only connections (including live-summary and disabled cached browsing), external writes and time-dependent cooldown/phase changes may take up to three seconds to appear. Cached JSON is parsed per response before attaching dynamic information, so one request cannot mutate another's stored display result. Restore clears these caches and rejects pending worker reads. Disabled browsing retains its no-create/no-migrate contract; absent stores use an ephemeral in-memory schema. The display cache is never used for broadcast eligibility or action authorization.

Artist totals now count source documents and enabled claims independently, avoiding multiplication of source rows by claim rows. Against the existing offline pre-v60 station backup, old and new query results were identical. Three runs each gave old sample timings 59/66/677 ms (median 66 ms) and new sample timings 27/28/29 ms (median 28 ms). Cache state and concurrent host load affect these figures; they are query timings, not an end-to-end responsiveness guarantee.

Worker calculations taking at least two seconds log their operation and duration. Existing hourly quiet-time housekeeping now logs controller execution time when it takes at least one second. Housekeeping still performs synchronous, guarded writes; article pruning's ten-row limit does not bound its eligibility scan time. Its selection/publication needs a separate measured change if these warnings implicate it; no retention or evidence safety guards have been weakened here. This candidate requires a controller rebuild only, owned by the operator. No live data, settings, queue, containers or schema are changed by preparing it.

Verification: the complete Sleeve Notes selection passed **358/358 across 51 files** at the initial implementation checkpoint. Final payload narrowing (only the metadata/reservation/script fields used by live-summary cross IPC) then passed all **5 dashboard worker tests**, including exclusion of unrelated queue callbacks. Heard on Air and queue-action HTTP regression tests were rerun after adding explicit worker teardown to their fixtures. Full controller lint/types passed (existing 1,762 warnings, zero errors); final changed-file lint and type checks were also run. No web code changed, and no full repository or live playback/load test is claimed. The new worker tests cover independent source/fact counts, direct/worker result parity, unchanged database bytes, shared calculations, responsive timers, own-write invalidation, external-write expiry, restore cache clearing, missing-file refusal and recovery.

Source is prepared on `codex/series-idle-20261020` and copied by fast-forward into the integration checkout for the operator's controller-only rebuild; fork draft PR #5 receives the same source. Running containers remain untouched. Next acceptance: rebuild controller only, check health, then observe normal playback while Overview and Heard on Air are open; correlate any recurrence with the new operation timing warnings. The original minute-long stall remains unattributed.

### Sleeve Notes settings use Save or Discard — 21 October 2026

Notes Settings now stages background collection, empty-station research, segment options/host DJs, Genius collection/token replacement or clearing, and Wikipedia limits/prompt edits. A shared pending-changes bar follows the main Settings layout, counts changed controls and offers Save/Discard. Segment fields use the page's validated form rather than saving independently. Switching Notes tabs retains the draft; clean forms hydrate from saved settings without replacing dirty edits. A successful save re-baselines submitted values (including when the shared settings mutation reports a committed write with a failed refresh); rejected writes retain the draft. Save payloads contain changed controls only. Blank token input preserves the saved secret; clearing and restoring the default prompt remain pending until Save. Saved-success copy hides once another draft is started; save errors remain visible near the toolbar.

MusicBrainz Lists has a separate matching bar because its settings live in the research store, not the station settings document. Enabled/ranked switches, family controls and re-enabling an existing list stage changes. Saving applies each changed list through the existing authenticated API; if a later list fails, committed entries leave the draft and remaining entries stay available for retry. There is no cross-list transaction guarantee. Checking/adding a list and confirmed removal remain explicit operations, as do prompt preview and Wikipedia refresh maintenance. The manual explains the new save step.

Verification: full web suite **310/310** passed, including four new tests for changed-only patches, independent counts, hidden token preservation/replacement/clearing, default-prompt restoration and validation. Changed-file ESLint and web type checking passed. A separate local development web server with intercepted/mock API responses exercised actual rendered controls: no writes while editing, general and list Discard, segment/DJ selections, deferred token clearing, failed-save retry, changed-only requests, invalid limits, default prompt, partial list-save recovery and retaining drafts across Notes tabs. Desktop (1280px) and mobile (375px) screenshots were inspected; no horizontal overflow or browser exceptions. The UI detector reported no findings. The broad destructive forms verification script was not run; no real station API writes or container operations were performed.

Candidate is source-only, prepared in the development worktree and fast-forwarded into `/home/jaz666/Docker/subwave`, with fork draft PR #5 updated. Next: operator rebuilds web only and confirms Save/Discard with their station. Controller code/schema and live data remain unchanged by this update.

### Review with no AI replacement: manual correction — 21 October 2026

A ready review could contain a diagnosis but a null `sparkCorrection` (including a proposal suppressed as unchanged or improperly targeted). Both its editor and Apply action previously required that AI proposal. Ready, writable reviews now explicitly say when no replacement was supplied and offer Edit saved fact, or individual Spark choices for a multi-Spark exchange. The editor starts from the frozen reviewed wording/evidence, supports cancellation without writes and requires a change before offering an enabled save. Existing AI proposals remain editable. Active facts use Save correction and resolve; withdrawn facts retain the explicit Correct and restore action. Resolved reviews display the actual saved correction even when the model originally proposed none.

The existing authenticated decision endpoint accepts an explicit manual correction without an AI proposal. It still requires a ready result, restricts the target to the review's frozen Sparks, rejects changed/deleted facts and validates wording and its exact supporting excerpt through the existing moderation path. Where the model did propose a correction, edits remain bound to its proposed target. The correction is stored in review context and normal moderation history; unsupported edits leave the review and availability unchanged. No new route, schema migration, automatic edit or additional LLM call was added.

The reported review also treated an explicitly dated announcement as missing a connection to the current date. Review instructions now distinguish historical announcement context from current membership, say that a day/month/year already anchors an event, and require actual structured replacement text for an evidence-supported repair. If no safe replacement is supported, the model should choose unclear and explain the limitation. These are prompt instructions, not a guarantee of model compliance. Existing ready reviews receive the manual-edit option without rerunning; their stored model findings are not rewritten.

Validation: **8 manual-review controller tests**, **17 airing-review controller tests**, and **8 web review tests** passed. Changed-file controller/web ESLint and both type checks passed. New authenticated API coverage tests an absent proposal, missing edit, unrelated target, invalid source/wording, concurrent later edits, preserved withdrawal on failure, explicit restoration and recorded applied correction. UI tests cover the no-proposal entry point, read-only mode and resolved manual corrections. A separate local web server with mocked API responses reproduced the reported dated announcement and verified opening/cancelling the editor without writes, disabled unchanged save, retained draft on rejection and exact saved payload on success. Desktop/mobile screenshots were inspected with no horizontal overflow or browser exceptions; the UI detector reported no findings. No full-suite or real-model evaluation was repeated, and live reviews/facts/queues were untouched.

Source-only candidate is committed on the development branch, updates fork PR #5 and is fast-forwarded into the station checkout. Next: operator rebuilds controller and web, then opens the existing ready review and chooses Edit saved fact if desired. The agent has not rebuilt or restarted station containers.

### Upstream v1.26.0 reconciliation — 21 October 2026

Fetched upstream and fork before preparing the upstream testing draft. Latest upstream `develop` is `a72ce323`; release `v1.26.0` points to `c78ab95a` and was published at 13:03 UTC. Every runtime fix listed in that release was already included through our earlier `aaaea562` baseline. The newly fetched difference is 11 release-only files: changelog, release manifest, root/CLI/controller/web package and lockfile version metadata, and CLI_VERSION. Parsed comparisons confirm dependencies and package scripts are unchanged.

Merged fork `develop` at `bfe67edb`, including current upstream develop and the release tag, without conflicts (`6b09fc24`). Ancestry checks prove both are included. Focused package-script checks passed 2/2 and test-header checks passed 4/4; diff whitespace checks passed. No runtime source was changed by this reconciliation, so no full suites, builds or station operations were repeated. Source update is published to the feature branches and copied into the station checkout; running images remain under operator control.

Upstream publication still requires removing fork-internal handovers, station-specific evidence and disposable test/research material from the submission, while retaining user documentation and useful regression coverage. Keep these internal integration records on the fork; they are not intended for the upstream draft. Do not interpret the release merge as completing that cleanup or opening an upstream PR.

### Upstream testing draft published — 21 October 2026

Opened https://github.com/perminder-klair/subwave/pull/2033 as a draft against upstream develop with title “[Draft] Extended Sleeve Notes — station testing and early review”. The published head is `Jaz666:feat/extended-sleeve-notes-testing`, commit `7253b415`, from `/home/jaz666/codex/subwave-upstream-review-20261021`. It is a clean single feature commit on upstream `a72ce323` (v1.26.0 included), not the development branch's experiment history. Future upstream fixes belong on that clean branch/worktree; do not merge fork handovers back into it.

The submission removes 49 fork/internal documents and one-off scripts, restores upstream CLAUDE.md, removes five disposable script aliases, replaces historical design/integration notes with concise contributor guides, and updates the tester checkout instructions. Useful regression tests, the manual, tester guide and all three finished PR screenshots remain. Runtime/web source matches the tested development branch; font license text only had whitespace/line-ending normalization. The upstream diff is 271 files, 29,348 added and 509 removed lines, down from 35,079 added lines in the original feature diff. Internal operational records remain on this fork and are absent from the upstream commit history.

Clean-branch validation passed: 360 Sleeve Notes controller tests; 311 full web tests; 44 shared-boundary checks (brain queue, speech budget, Agent activity, verified facts, link style); controller/web/app/MCP lint and types; admin-query audit; generated schema/theme no-drift; retained documentation links and whitespace checks. Controller lint has the existing 1,762 warnings and zero errors. The full controller suite and a new live-model/provider matrix were not repeated. No containers, live data or settings changed. The station remains at `d6a98fb2`; its existing fork draft PR #5 remains available as the development record. No maintainer/bot review was requested on the user's behalf.

Next: testers can use `gh pr checkout 2033 --repo perminder-klair/subwave` from an upstream clone, or the clean fork branch in the published tester guide. Any reported fixes must be made and verified in the clean upstream worktree, preserving its documentation/tooling cleanup.


### Batched connection matching — 21 October 2026

Upstream draft #2033 now contains `248b4be8`: full connection-index calculations run initially in quiet time, then at most once per five-minute scheduling interval when relevant revisions change, rather than potentially on every 30-second catalogue tick. The interval is reserved before computation, including rejected stale snapshots; failures retain ten-minute backoff. Unchanged revisions do no matching work, and busy/disabled/paused gates still apply. Pending changes are picked up on the next allowed pass. The deadline is in memory and resets on controller restart; there is no DB migration. Catalogue scanning and normal research pacing are unchanged. Counts, Station Brain matches and connection Sparks can lag research until the next successful pass.

Verified 24 library-connection checks and 3 real-worker process checks, targeted ESLint, controller type checking and whitespace checks. Tests cover continuous updates within the interval, publishing the accumulated facts, quiet/enable gates, unchanged revisions, stale snapshots and failed-attempt backoff. This reduces matching attempt frequency by about 90% under continuous changes; per-attempt duration is not improved or guaranteed. The existing offline backup reproduced a warm full no-op calculation around six seconds; no live state was changed by that measurement.

The two controller/test files are mirrored byte-for-byte into this development branch for a fast-forward station handoff. Clean upstream contributor docs remain in the separate submission branch; fork-internal records stay here. Update fork PR #5 and station source, leave rebuilding controller to the operator. Next: observe that `Slow read matches` appears no more often than the new interval while research continues; a slower individual calculation can still produce that warning.


### Local upstream theme candidate — 21 October 2026

At the operator's request, prepared a local-only integration of upstream develop `2704113e` (seven skin/theme commits) on the clean submission branch, merge commit `6311e5ce`. Resolved the sole conflict by restoring upstream `web/app/layout.tsx` exactly, removing the separately bundled fonts and their dedicated test. Sleeve Notes needs no additional fonts. Builds again use upstream next/font/google, which requires Google Fonts access during the build; browsers receive self-hosted assets. Removed obsolete font references from the clean contributor map.

Verified all 327 web tests, 12 controller theme-token tests, web lint/types, targeted controller ESLint and controller types, generated theme-token no-drift, and whitespace checks. Runtime changes mirrored byte-for-byte here, including deletions (font-license whitespace differences were handled by deleting the retired font directory). No production build or visual acceptance is claimed.

Station handoff: fast-forward the station source from `834a07a9` to this local candidate; rebuild web and controller to exercise the new themes and their controller token registry. Previous source rollback is `834a07a9`; no database/settings migration is introduced by this integration. No pushes or PR updates are authorised until station testing. Containers, settings and databases remain untouched. Next: operator rebuild, then check Appearance, Phosphor/Riso, Notes and Station Brain on desktop/mobile; confirm font downloads succeed during build.


### v1.27.0 station integration — 22 October 2026

Prepared on `codex/station-v127-20261022` in `/home/jaz666/codex/subwave-station-v127-20261022`, starting from station `8f76a374` so all current Sub/Shows work is preserved. Applied the release delta from upstream `2704113e` to tag `v1.27.0` (`1e4e584e`), including release metadata. Clean submission branch has local merge `b5bf9b7d`; the dashboard import conflict retains both Sleeve Notes imports and upstream SkipChoices/never-play imports. The fork-only CLAUDE session preamble is retained. No push or PR description change.

Verification: 456 web tests pass; queue-transition-label 12, persona-bundle 20 and transition-mixer-seams 7 pass. Settings-patch-schema passes 71/73; both failures concern existing Sub/Shows integration (raw Zod error wording and omitted subShows in the schema-key expectation), also reproduced using the pre-release test file against this station candidate. These failures are not claimed fixed. Controller type-check passes; theme-token regeneration has no drift. Web ESLint found one existing class-order error in TemplateShowsPanel, corrected without behaviour changes; web type-check passes. No production build or live acceptance performed.

Station handoff: fast-forward station source to this local candidate; previous source rollback `8f76a374`. Operator rebuilds controller/web using the existing compose overlays, then checks health, playback, Sub/Shows, Sleeve Notes and the new Appearance/Skip controls. No containers, live settings or state were modified.


### Station Brain theme refinement — 22 October 2026

Reused upstream theme-rgb colour reading, OKLab mixing and theme watching for the map. Relationship hues retain separate identities and are adjusted to at least 3:1 against the map background on all shipped themes; the in-map key and coverage rings share the same palette. Floating controls use booth glass tokens with a translucent surface and sheen, without live backdrop blur over the moving graph. Lite/reduced-motion surfaces are opaque. Layout, Map controls and Key can fold on desktop, with independent preferences saved per browser; mobile expansion remains independent and starts closed. Updated the manual.

Verification: 17 connections tests pass, including all eight built-in theme palettes; targeted ESLint and web type-check pass. Isolated browser fixture renders the actual BrainCanvas component with synthetic data: desktop/mobile checks cover remembered folding after reload, independent mobile expansion, live Phosphor/Riso theme changes, no horizontal overflow or browser errors, and reduced-motion controls. Inspected desktop/mobile screenshots. Mechanical UI detector returned no findings. No live station data or containers were touched. Source is handed to the station for operator web rebuild; previous source rollback is 4fd6b515. Keep local pending station acceptance.

### Early-review correction candidate — 22 October 2026

Clean upstream worktree `/home/jaz666/codex/subwave-upstream-review-20261021`
contains local commit `9684f128`, addressing all three blockers and the bounded
cleanup from Kanrei's review at b579ca45. Nothing has been pushed. The separate
station candidate is `/home/jaz666/codex/subwave-review-fixes-20261022`, branch
`codex/review-fixes-20261022`, based on current station `963bf785`. Scheduler import
resolution retains `prepareUpcomingGeneratedShows` and all Sub/Shows behaviour;
private historical documentation remains on the fork.

Fixes: outstanding intro renders track promises independently of invalidation and
transfer; automatic Banter alone gets the speech budget and logs skipped speech;
disabled single-voice Sleeve Notes releases reservations before/after TTS; saved
read-only GET views use an explicit master-switch allowlist, and asynchronous
cached reads hold their readonly DB until completion. Library-only story browsing
now uses that same boundary. Restore upstream `next build` and remove the extra
AdminShell settings poll. Shared integration functions are formatted; Sleeve Notes
tests use the common directory lifecycle helpers and fixture HTTP shutdown closes
connections. All 29 added explicit-any warnings are removed (controller warnings
now 1733, matching upstream). Settings-registry counts are corrected.

Schema: consolidate the 61 experimental revisions into one initial public schema
v1, marked with application id SWN1 to distinguish it from experimental v1. All 145
tables/indexes/triggers and the initial revision row match the previous final
schema. Initialisation is transactional. Experimental and future databases are
refused unchanged; they are not erased or upgraded automatically. Public tester
docs describe a controlled reset of ONLY sleeve-notes.db and its companions, with
the controller stopped, plus rollback using the old source and complete old DB set.
No live reset, source deployment, build, container restart or state change has been
performed. Station source remains 963bf785. Do not fast-forward the candidate into
the station until ready to coordinate the accepted reset and rebuild.

Verified on the clean submission branch: full controller suite 5403/5403; web
464/464; all four packages lint/types; generated schema/theme mirrors no drift;
admin-query audit; default Turbopack production build. Targeted post-cleanup speech
label tests 17/17 and brain queue 10/10 also pass. The build required an actual local
web/node_modules directory: Turbopack refuses the external dependency symlink used
by earlier dev checkouts. No product workaround remains. The previously reported
ECONNRESET was not reproduced; no blanket retries were added. Station candidate controller/web type checks pass and all 32 segment tests pass.
The 59 mirrored source paths differ only in scheduler and AdminShell, retaining
the existing generated-show preparation and Sub/Shows navigation respectively.
The existing two Sub/Shows settings-test issues are outside this upstream change.

Next: operator accepts a backed-up research-only reset; stop controller, move the
old sidecar/WAL/SHM together outside state, fast-forward the reviewed station
candidate, rebuild controller and web, and observe first collection, ordinary
links/manual Banter, host changes, saved-data reads while disabled, optional Genius,
and review queue recovery. Previous rollback source remains 963bf785 with its saved
experimental database. Keep this operational record out of the upstream PR.

Station handoff correction: the operator backed up/reset research and rebuilt on
22 October, but the integration checkout still pointed at 963bf785. Read-only
inspection confirmed healthy on-air containers running schema 61 without the new
promise tracker or schema.sql, and the old build had recreated sleeve-notes.db.
The station source has now fast-forwarded to candidate 96dadf40. Containers were
not stopped/rebuilt and no research files were moved by the agent. A second
controller-stopped sidecar move and controller/web rebuild is required before
schema-1 acceptance can begin. The station's earlier backup remains its rollback.

Post-rebuild verification: controller and web are running and `/api/health` reports
on-air. Running controller hashes for db.ts, intro-render.ts and scheduler.ts match
the prepared station source. schema.sql is present; the fresh sidecar reports
user_version 1 and application_id 0x53574e31 (SWN1). At inspection it contained zero
saved facts and no research jobs, appropriate before first artist admission. The
recent controller log shows a successful background MusicBrainz series refresh.
Fresh artist/Wikipedia collection after confirmed plays and live review/Banter
acceptance remain to observe. No credentials, settings or live data were changed
by these read-only checks; upstream fixes remain local and unpushed.

### Artist identity and research diagnostics — 22 October 2026

Mirrored clean upstream candidate c59b41d9 into this station branch. All 22 changed
controller/web paths match except server.ts's pre-existing Sub/Shows session
recovery ordering, which is preserved. Station controller/web type checks and the
four identity tests pass. The live station has not been rebuilt or its data edited.
After this source handoff the operator rebuilds controller and web; schema 1 upgrades
to 2 by adding indexes only. No further research reset is required. Previous station
source is 78ae17ef; retain the usual compatible backup for rollback.

Genius artist identity is shared across traversal, seeding and encountered songs.
The common catalogue worker repairs five duplicate names at most per five-minute
quiet interval, using a rotating cursor so protected names cannot starve later
ones. Repair also runs with Genius capture off. It reassigns only provisional
Genius children with no direct artist-level research, preserves recording ids,
facts and evidence, and never merges distinct canonical identities or ambiguous
library artists. Historical empty artist rows remain for references. Browse and
dossier local-match labels use actual library associations or the existing
unambiguous cached-library identity.

Overview now explains the actual worker gate, records last successful source and
research timestamps, names the next scheduled retry and flags unexplained six-hour
stalls with ready work. Storage inspection is explicit and read-only, in the child
process, with file/WAL/reusable space, source text sizes and derived-index size.
The previous manual snapshot is browser-local; no extra periodic scan is added.
Focused CI covers shared boundaries and progress messages. The clean contributor
review map contains the upstream compatibility checklist and the operator's
reported first multi-host segment within an hour of a fresh collection.

Verified: 365 feature checks and 466 web tests; intro-render 6, library connections
23, traversal 7 and no-Genius 6; controller/web lint/types, mirrors, admin-query audit,
workflow YAML parsing and default Turbopack build. Existing controller warnings stay
1733. Isolated desktop/mobile fixtures verify explicit-only requests, table/scroll
behaviour, Phosphor/Riso, no page overflow or browser errors; UI detector is clear.
An isolated snapshot of current research showed seven visible 2Pac rows become one,
while keeping all 1022 recordings, 5294 facts and 658 sources, with zero foreign-key
errors. This was an offline copy; no live repair has yet been observed.

The build emitted a verified upstream Next.js 16.4.0 dependency advisory; the normal
retry passed. Next.js 16.4.1 is patched per GHSA-2464-fhr4-w9xw. Dependencies were kept
unchanged in this feature candidate; handle the security update separately. Nothing
has been pushed to either draft PR in this pass. Next: operator rebuild, verify
schema 2, inspect progress/storage and confirm duplicate consolidation after a
quiet catalogue turn, then publish the accepted feature/review fixes.


## Outgoing segment handover ownership

A station check on 22 October found an outgoing-host Sleeve Notes exchange airing
following the incoming show's handover and hourly check. Background research did
resume, confirming that the earlier permanent-pause repair worked independently.

Prepared Sleeve Notes briefs now retain the commissioning show/host epoch through
writing, rendering, deferred delivery and the final speech-file publication check.
Both manual and automatic requests stand down once a handoff has claimed the
boundary. A same-presenter show change also invalidates the old editorial context.
Cancelled publication does not hold the voice serialiser for the unplayed clip's
duration or create aired bookkeeping; unsuccessful segments release unused fact
reservations. Already-published audio and committed pause-and-talk delivery retain
their existing ownership. Ordinary manual Banter and other manual speech keep their
established overrides.

Regression coverage is in `sleeve-notes-handover.test.ts`, including real speech-file
waiting, late writing/TTS, same-host show changes and deferred exchanges. The
focused boundary workflow includes this suite. A new on-air handover check is still
required after rebuilding the controller; synthetic checks do not establish the
live audio outcome.

Validation: the feature suite passed 369 checks during development. After the
final ownership/policy refinements, all 6 handover regressions and 32 segment
checks pass. Shared voice (122), host-speech (17), handoff (87) and talk-placement
(4) checks pass. Controller types and focused lint pass with one pre-existing
explicit-any warning in the untouched capability-selection line. No live LLM
calls or container changes were made; a new on-air acceptance result is pending.

Station source handoff — 23 October: prepared on
`codex/sleeve-notes-handover-20261023`, based on station `bd1d1efa`, preserving the
independent Sub/Shows changes. The clean upstream candidate is `d87ecc85`.
The six new regressions and controller type check also pass in this station
candidate. Fast-forward the integration checkout to this branch for an operator
controller-only rebuild; the prior source rollback is `bd1d1efa`. No schema,
settings or live research data changes are required. Containers remain unchanged.
Keep these commits local until station acceptance and an explicit publication
request. Next: repeat the near-handover request, confirm unused outgoing speech
stands down, and verify research resumes.


## Library relationship source recognition

The Library Connections summary still counts each directed sample/cover relationship
once, with both recordings in the current library. Traversed Genius recordings can
be local without a played-track attachment. Previously the target matcher recognised
them, while the summary's source-side SQL required an explicit attachment or MBID.

The existing background matcher now resolves a source through the same artist,
exact-title, recording-identity and duplicate-copy guards used for targets. A
nullable source local-track reference is published in the revision-checked derived
edge patch. Public schemas 1 and 2 upgrade transactionally to 3; deletion/metadata
invalidation clears the reference through an indexed foreign key. The summary uses
these cached matches without another provider call or matching pass. Disabled
pre-upgrade cached browsing retains the older query without modifying the store.

Verification: 375 feature checks passed, with final matching, upgrade and identity
checks covering unplayed sources, inverse/copy deduplication, conflicting recording
identities, live-version retags, external endpoints, deletion and old-schema cached
reads. Controller types and focused lint pass. An isolated station snapshot changed
from 1 to 137 unique library relationships while preserving facts, recordings and
sources, with no foreign-key errors. This was an offline copy; live collection and
container rebuilding remain under operator control. The count refreshes after the
next successful quiet-time background match and normal Overview refresh.


Station source candidate — 23 October: this change follows b518004c on
codex/sleeve-notes-handover-20261023. Public-schema migration adds one derived
source reference/index without deleting saved facts. Operator rebuilds controller
only; no live database changes or container operations were performed by the
agent. Keep a compatible pre-upgrade backup with b518004c for rollback; source
alone cannot downgrade schema 3. Next: allow a quiet matcher pass and confirm
Library Connections rises while external recordings stay excluded. Code remains
local pending explicit PR publication.


### Light-theme Station Brain readability trial — 23 October

Mirrored clean candidate 28818ab8 after advancing this station development branch
to 002b77ab, preserving the independent compact show-planning trial. Light-map hues
now meet 3:1 after ordinary link transparency, darkened towards neutral black so
coloured theme ink cannot collapse distinct relationships into one hue. Connected
nodes retain a minimum screen size; unexplored artists are subdued, selected labels
are opaque and light-map paths stronger. Layout and research/data semantics stay
unchanged; soft glows remain on dark maps only.

Verified 17 web connection/theme checks, web types and focused lint. Browser fixtures
cover 5,575 nodes, Classic Light/Riso/Phosphor, selection opacity, mobile overflow,
reduced motion and no browser errors. Also inspected a 6,000-node offline station
graph; mechanical UI detection is clear. No live database or container changes.
Station source handoff is for a user-run web-only rebuild; source rollback is
002b77ab. Keep local until the operator has evaluated the lighter themes. No PR
push or description change is authorised by this trial.


### Station upstream integration — 24 October

Candidate branch `codex/station-upstream-20261024` starts at station `f8aac960`
and merges upstream develop through `9c2b54d0` (the twelve commits after
`2d720937`). The source delta matches that twelve-commit batch; older upstream
skin changes were already present as station copies. Keep station-only Sub/Shows,
Look Ahead and confirmed-air notebook behaviour intact. Shared speech resolution
retains the Sleeve Notes publication guard/cancellation contract alongside the
upstream optional jingle overlay and marker-aware voice lock.

Controller types pass. The isolated full controller run has 5,564 passes and
13 failures; all thirteen reproduce on an isolated copy of the prior station
source. They belong to existing scheduling, discussion, generated-show, picker
and settings checks and are left for their owning development work. No new
controller failure is introduced by this integration. All 501 web tests and web types pass. Generated schema/theme mirrors have
no drift; the admin-query audit and focused lint on shared speech/router files
pass. No production image build or live audio test
is performed by the agent.

Station handoff: fast-forward the integration checkout only after the checks.
The source rollback reference is `f8aac960`; keep a compatible database backup
for runtime rollback because upstream adds library lyric tables (schema 31).
Do not reset the Sleeve Notes database. Containers, live settings and state
remain unchanged until the operator rebuilds controller, web and broadcast.
The broadcast restart reconnects the stream. Upstream enables the Lyrics panel
and LRCLIB fallback by default, preserving explicitly saved off switches;
over-music IDs remain opt-in. Next: operator rebuild and check station health,
lyrics, file-format display and normal speech. No PR changes are part of this
station integration.


### Explicit Wikipedia URL fallback — 25 October

Joan as Police Woman's MusicBrainz artist links to Wikidata Q84953682, which
has no English sitelink; the biography is attached to Joan Wasser's Q447338.
The same MusicBrainz API response contains an explicit English Wikipedia
relationship. The source client now uses that relationship when the preferred
Wikidata item/sitelink is absent, for artists and release groups alike. It
accepts only HTTP(S) English article URLs without credentials, query strings,
fragments or malformed titles, and resolves article redirects to a revisioned
canonical source. Temporary provider failures retain normal retry/backoff.

Verification: all 33 Wikipedia checks pass, including real-client HTTP fixtures
for both identities, missing items/sitelinks, primary-route precedence, redirect
resolution, malformed links and transient failure. New regressions fail against
the prior client. Focused lint passes. The controller type check reports only
two existing errors in `scripts/show-discovery-policy.test.ts`; the same errors
are reproduced with the prior client and left for the owning development work.

Station source candidate: `codex/wikipedia-url-fallback-20261025`, based on
`5fd6bc4b` (source rollback). Integrate by fast-forward after verification; the
operator then rebuilds controller only and manually queues the artist. No
schema migration, database edit, queue operation or container rebuild is done
by the agent. Keep this candidate local; update upstream PR #2033 only after
station acceptance. Next gate: biography collection followed by LLM extraction
and saved source-backed artist facts.


### Review sections and local coverage verification — 25 October

The Review surface now separates Flagged reviews from Research gaps. Existing
Needs review/Resolved/Dismissed filters remain inside Flagged reviews, and
correction drafts survive switching sections. The factual-review badge is
unchanged; the research-gap count is separate.

The first gap implementation is a derived local read, not an external source
verification or a persisted moderation finding. It reconciles the cached library
artist index, matched recording credits, same-name identities, saved artist
Wikipedia sources and active story facts (including trusted Genius local links).
Credits/connections, withdrawn/deleted facts and feedback holds do not inflate
story counts. Stored facts are not a guarantee of immediate air eligibility.
Failed duplicates are suppressed when the actual recordings use researched
identities; same-name splits with affected recordings remain partial coverage.
Composer/performer bridges remain distinct from same-name identity failures.
Normal unplayed artists, pending jobs, completed empty research and operator
cancellation do not become missing-source alerts. No identity records merge.

GET /sleeve-notes/research-gaps uses the existing read-only child process and
a five-minute display snapshot; POST /sleeve-notes/research-gaps/verify forces
a fresh local check through the same worker. Both require admin authentication.
Feature-off GET uses the existing cached-read context without creating/upgrading
the database; verification and queue actions remain disabled. Retry uses the
existing Station Brain research route, preserving pacing and broadcast gates.
No new database schema, provider requests or automatic job admissions result
from verification. Source/identity overrides, dismissal and external verification
remain subsequent work; the UI exposes only implemented actions.

Candidate: codex/research-gaps-review-20261025, based on station e28ecc32.
Keep local for operator testing; no PR update or container rebuild is included.
Next station gate: rebuild controller and web, inspect both Review sections and
recheck known duplicate, partial and unresearched examples.

Implementation commit: `964a5741`. Verification: 13 research-gap tests, six
shared-worker tests, ten existing coverage/retry tests and all 501 web tests
passed. Focused controller/web lint, web typecheck, generated schema mirror,
admin-query audit and UI detector passed. Controller typecheck reports only the
two independently reproduced pre-existing discovery-policy test errors at
`scripts/show-discovery-policy.test.ts:29–30`. Browser checks passed for filters,
correct retry identity, failed verification retaining results, correction drafts
surviving tab switches, feature-off controls, and mobile/desktop Riso/Phosphor.
The read-only station snapshot completed in about half a second at 4,668 indexed
artists. No database/queue writes, provider requests, production builds or
container operations were performed during verification.

Station integration route: fast-forward the clean station checkout from
`e28ecc32` to this candidate including this evidence commit. Source rollback is
`e28ecc32`; runtime still uses the preceding images until the operator rebuilds
controller and web. PR #2033 and remote branches remain unchanged: this candidate
is intentionally local pending station acceptance. Next: rebuild controller and
web in `/home/jaz666/Docker/subwave`, check health, then inspect both Review tabs
and known duplicate/partial/unresearched examples. External verification,
identity/source overrides and dismissal are not implemented in this phase.
