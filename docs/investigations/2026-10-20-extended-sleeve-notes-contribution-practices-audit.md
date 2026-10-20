# Extended Sleeve Notes — contribution-practices audit

Implementation update: the four reproduced defects and the failing-test baseline
have been addressed. See the [implementation follow-up](2026-10-20-extended-sleeve-notes-audit-follow-up.md)
for changes, verification and remaining recommendations. The original audit
observations below are retained as the before-state evidence.

Date: 20 October 2026.

Reviewed against [CONTRIBUTION_PRACTICES.md](https://github.com/Jaz666/subwave/blob/docs/contribution-practices/docs/CONTRIBUTION_PRACTICES.md), including its compatibility, real-entry-point, isolation, cancellation, migration and evidence guidance. This is an audit, not an implementation or release approval.

## Scope and baseline

- Checkout: `/home/jaz666/Docker/subwave`, branch `test-station/sleeve-notes-clean-20261014`.
- Committed feature baseline: `5b85af21`; the audit includes the subsequent uncommitted feature changes and manual guide.
- Upstream develop: `7cb507f517d7483c25c75918d1659804daddc357`. A read-only remote check confirmed this was still the upstream head during the audit.
- Inspected research admission and scheduling, MusicBrainz/Wikipedia/Genius workers, matching/traversal/seeding, source retention and moderation, selection/cooldowns, segment generation and queue publication, actual-air records, backups/restores, graph processing/caching, admin UI and the corresponding tests.
- The remote guide references STARTHERE.md and HANDOFF.md; neither exists at this checkout's root. Local CLAUDE/AGENTS instructions, CONTRIBUTING.md, feature internals, broadcast notes and the session handover supplied the checkout context.
- Controller tests ran through the repository runner with temporary state. Automated HTTP used synthetic fixtures. No live settings, station database, library, queue or broadcast was changed. No paid provider requests were made.
- A separate archived copy of the committed feature was used for comparison, with installed dependencies linked in. The same existing test commands and the four temporary reproductions ran there. This is a comparison with the last committed feature, not an enabled-feature comparison with upstream, which does not contain the feature.

## Verification results

| Check | Committed feature `5b85af21` | Current working tree |
| --- | --- | --- |
| Controller `npm test -- sleeve-notes` | 272 tests: 268 pass, 4 fail | 279 tests: 270 pass, 9 fail |
| Controller `npm test -- brain-queue` | 10 pass | 10 fail |
| Web `npm test -- sleeve-notes` | Not rerun | 7 pass |
| Web `npm test -- notes-overview` | Not rerun | 6 pass |
| Web `npm test -- airing-reviews` | Not rerun | 7 pass |
| Web `npm test -- dash-sleeve` | Not rerun | 2 pass |
| Controller `npm test -- pause-talk` | Not rerun | 17 pass |
| Controller `npm test -- speech-budget` | Not rerun | 5 pass |
| Four targeted audit reproductions, assertions describing desired behaviour | All four fail | All four fail |
| `git diff --check` | Not applicable | Pass |

There are **19 failing existing controller tests**, compared with four at the committed baseline: **15 additional failures**. Passing focused checks from the handover do not establish that the current feature test set passes.

Full package suites, all four lint/type gates, a production image build, browser interaction tests, native-client checks, live-model evaluations and physical playback were not run in this audit. The audit made no application-code changes; these checks remain necessary as appropriate before publication.

## Reproduced problems

### 1. P1 — Genius can accept the wrong non-Latin recording

**Code:** `controller/src/sleeve-notes/genius.ts:38-44`, `84-99`, `152-160`; the same normalizer is used in album matching.

`normal()` removes everything outside ASCII letters and numbers. Distinct Japanese titles therefore both become an empty string. The artist path also feeds names through this normalizer before the newer artist-only variant fold.

**Reproduction:** request title `春`, artist `Band`; provide one Genius search hit for title `夏`, artist `Band`, song ID `99`. `selectGeniusSearchHit()` returns `99` instead of refusing the unrelated recording. The direct-detail validation compares the same normalized titles, so it does not provide an independent safeguard.

**Impact:** unrelated credits, connections or background can be attached to a library track. Distinct non-Latin artist names can also collapse. This is an identity error before editorial wording is considered.

**Improve:** preserve Unicode letters/numbers when normalizing identity, refuse empty identity keys, and keep artist spelling tolerance separate from recording/version matching. Check every caller rather than changing the search helper alone.

**Tests:** search and direct song detail through the real provider adapter, plus retained local association; positive and negative Japanese, Cyrillic, Arabic, mixed-script and accented fixtures; multiple competing hits; missing names; Run-D.M.C. variants; live/remix/acoustic distinctions. Test album matching with the same identity cases. Keep the existing strict version protections.

### 2. P1 — Hourly cleanup bypasses the disabled-state contract

**Code:** `controller/src/sleeve-notes/research-worker.ts:1149-1156`; `controller/src/sleeve-notes/moderation.ts:150-188`.

`startResearchWorker()` always installs an hourly `expireRecycleBin()` callback. The callback checks neither the master switch nor the shared research/restore gate. `expireRecycleBin()` opens the writable database and can permanently expire pending material and associated history.

**Reproduction:** disable Extended Sleeve Notes, remove the research DB in temporary test state, start the worker with a non-quiet gate, and invoke the captured hourly callback. A new schema-57 research database is created despite the feature being off. The existing expiry implementation also permits deletion when eligible rows exist; deletion while disabled was established by code inspection, not a separate timed fixture.

**Impact:** disabling the feature does not suspend all its processing. An absent or older cache can be created/migrated, and eligible material can be expired while the operator cannot access the hidden workspace.

**Improve:** gate scheduled maintenance explicitly on the agreed feature policy and participate in the existing restore guard. Keep explicit moderation actions distinct from scheduled maintenance.

**Tests:** exercise the actual registered timer with no database, an older schema, expired pending material and held/flagged material. Verify disabled ticks leave files and rows unchanged, enabled expiry still works, and restore prevents maintenance from reopening or mutating the collection during the swap.

### 3. P1 — Artist-index population is outside restore coordination

**Code:** `controller/src/sleeve-notes/brain-library.ts:14-58`; startup call in `controller/src/server.ts:384`; restore tracking in `controller/src/sleeve-notes/db.ts:46-55`.

The startup/daily artist population path awaits library HTTP and then opens and replaces the cached artist index. It does not register with `runResearchDatabaseWork()`. Its startup timer checks enablement/pause, but does not receive the shared playback/interactive quiet gate, and there is no final enablement/generation check before publication.

**Reproduction:** hold the `getArtists` response in a controlled promise, start `populateBrainArtists()`, and call `acquireResearchRestore()` while that request is outstanding. Restore is permitted. In contrast, the existing backup test correctly expects restore to refuse tracked research work.

**Impact:** old in-flight index work can publish into the replacement database after a restore; disabling collection while the request is outstanding does not prevent the final publication. The successful acquisition of the restore lock was reproduced; a full zip-restore/stale-index overwrite was not executed.

**Improve:** include the whole asynchronous population operation in existing restore coordination, apply background scheduling policy, and reject results that no longer belong to the current feature/state generation.

**Tests:** drive the real startup population path through held catalogue responses; attempt restore, disable, pause or invalidate the catalogue before resolving; verify that old results cannot overwrite restored/current data. Preserve the existing incomplete-index and scan-in-progress safeguards.

### 4. P2 — Disabling during a Station Brain queue request still inserts a track

**Code:** `controller/src/routes/dj.ts:951-968`; asynchronous selection in `controller/src/sleeve-notes/brain-queue.ts`.

The master switch is checked before `await selectBrainQueueTrack()`, but not again before `queue.push()`.

**Reproduction:** POST a library-track selection through `/dj/queue-track`, hold the catalogue's `getSong` response, disable the feature, then release the response. The route returns **200** and the real queue contains the selected track. The desired refusal/empty queue assertions fail.

**Improve:** revalidate the feature's permission at the final insertion boundary for Station Brain selections. Preserve ordinary Library/manual queue behaviour, blocklist enforcement and the intentional operator recency override.

**Tests:** a controlled promise through the actual route, including disable/re-enable and a blocklist change while catalogue work is outstanding. Assert the final track identity and queue contents, not just response shape.

All four reproductions also fail on `5b85af21`: these are outstanding feature defects, not four newly introduced regressions in the uncommitted patch. The stronger current master-switch policy makes the disabled-state discrepancies especially visible.

## Existing tests that need repair before relying on the suite

### 5. P1 — The current verification record is not a passing feature baseline

- **Ten Station Brain queue tests** now stop at the master-switch 409. Their setup enables TTS-related configuration but never enables Extended Sleeve Notes. The committed revision passed all ten because it did not yet enforce that gate. Enable the feature explicitly for the supported-behaviour tests, and add separate off-state tests. Preserve the original queue assertions.
- **Four disabled cached-browsing tests** in `sleeve-notes-cached-browsing.test.ts` and `sleeve-notes-brain-album.test.ts` still expect HTTP 200. This conflicts with the intentional all-or-nothing master switch. Record the intentional change to 409 while retaining independent read-only cache/backup compatibility tests where internal cached reads remain supported.
- **One retired-route test** expects 404 but encounters the new master-switch 409 first. Exercise the removed endpoints while enabled to prove they remain absent; separately document the disabled middleware result.
- **Three admission tests already failed at the committed baseline.** They assume encounter admission creates only a MusicBrainz job, although it now also queues an independent local Genius connection job. Select the intended provider/capability when testing MusicBrainz retry/outage rules and separately assert that Genius admission remains independent. One test currently chooses the first job without naming its provider.
- **One readout test already failed at the committed baseline.** Expected rows omit the now-returned `enabled` and `operatorState` fields. Review the intended API projection and update the explicit expected contract without weakening the evidence/private-payload assertions.

Do not simply replace every expected status or remove whole-row assertions. Establish an enabled behaviour matrix and intentional disabled-policy matrix, then run the complete affected packages before a push. The committed feature itself was not a clean test baseline.

## Areas requiring stronger tests or measurements

These are identified coverage/evidence gaps, not additional demonstrated production bugs.

### 6. P1 — Test disabling across the full speech lifecycle, including mixer commitment

The segment suite covers generation, reservations, deferred/drop callbacks, actual-air confirmation and manual overrides. The new master test disables before generation; the new broadcast-gate test uses an uncommitted pending clip. The general pause-and-talk suites pass, but their fixtures use other speech kinds and do not establish the Sleeve Notes disable exception.

Add a controlled-clock matrix for disable during generation, during TTS, immediately before deferred publication, while waiting uncommitted, after the mixer has committed its silence, and during the actual exchange. Verify no late uncommitted publication, no leaked reservations/cooldowns and no duplicate completion callbacks. For committed silence, verify the matching voice remains and airs once; protect the existing `dropPendingVoice()` commitment guard. Restore/restart between preparation and air should also be an explicit scenario.

This should cover both the native segment and ordinary spoken links carrying a Spark. Do not reintroduce factual-wording vetoes: the agreed contract trusts stored Sparks and uses wording detection for bookkeeping.

### 7. P2 — Verify provider backoff and failure costs at the real worker boundary

**Code:** `genius.ts` request/error projection, `genius-worker.ts` `notBefore` and job selection, provider reservation helpers in `research-repository.ts`.

The current provider error stores HTTP status without Retry-After metadata. Exponential backoff exists, but response-specified Retry-After is not honoured. A worker-level `notBefore` also returns before selecting cached expansion, so a request wait can prevent purely local progress. Both limitations were already documented in the handover.

Add HTTP-boundary fixtures for numeric/date Retry-After, invalid headers, 429/503, timeout, invalid JSON, 401/403 and restart during backoff. Count real attempted requests and budget reservations across search/detail/album fallback. Ensure a failed provider does not multiply calls or turn a temporary failure into a false no-match. Exercise cached expansion while network work is deferred, retaining the agreed six-per-minute/ten-second policy and existing research depth.

For LLM research, extend the existing token-cap and provider-output checks to primary/fallback recovery call counts and prompt/output consistency after interrupted work. Keep live-model latency and prose quality evaluations separate from fixture results.

### 8. P2 — Exercise the real graph child process and stale publication

**Code:** `connection-compute.ts`, `connection-compute-worker.ts`, `connection-library-worker.ts`, `library-connections.ts:331`.

Most relationship tests operate directly on an in-memory database. That takes the synchronous branch rather than proving IPC, on-disk WAL snapshots, child failure or shared in-flight reads. Production has revision-checked publication and a bounded cache; preserve those protections.

Add on-disk integration tests for a facts revision changing while calculation is in progress, child exit/timeout followed by recovery, simultaneous overview/discovery requests, cache reuse/invalidation and restore to different data with the same numeric revision. Include catalogue removal and ambiguous artist changes before publication. Assert the final published graph/matches, not only the patch builder's return value.

### 9. P2 — Upgrade and restore need representative historical fixtures

**Code:** `db.ts` migrations and `settings.ts:668-711`; tests in `sleeve-notes-db.test.ts`, `sleeve-notes-backup.test.ts`, `sleeve-notes-segment.test.ts` and `sleeve-notes-medium-priorities.test.ts`.

There is meaningful existing coverage: the experimental replacement migration, a reconstructed v42 speech upgrade, WAL-safe export, older/no-research archives, invalid/future backups and running-job recovery. That is stronger than a fresh-schema-only test.

Expand with small fixtures representing supported historical schemas and settings, especially v45/v52/v55/v56 to v57. Preserve real claims, source identities, operator corrections/deletions, air history, feedback, frontier/cursor and queued work through migration and cold reopen. Test repeated migration and failure partway through an upgrade in a disposable copy. Check absent/malformed master, collection, Genius and segment fields through save plus cold load, in both switch directions, rather than relying only on normalizers. Ensure a disabled cold start does not migrate the research cache through maintenance or population side paths.

### 10. P2 — Static UI renders do not cover operator interactions

**Tests:** `web/tests/sleeve-notes-master-switch.test.tsx`, `dash-sleeve-notes.test.tsx`, `notes-overview.test.tsx`, `airing-reviews.test.tsx`.

The 22 focused web assertions pass, but they primarily render server markup or exercise pure helpers. Effects and real clicks do not run in `renderToStaticMarkup()`.

Use an isolated browser/controller to test master enable/save/navigation and disable with populated caches; direct Notes links while off; collection pause/resume; finding the settings control through search; review flag, editable correction, withdrawal and failed-save/retry; Station Brain layer selection and final queued identity. Confirm an older/missing response field produces safe UI.

For the Dash card, test the full reveal/15-second cycle, hover and keyboard pause, changed track/items, empty shelf, Lite/reduced motion and failed flag requests. Check keyboard access to map details and narrow layouts. Confirm merely browsing/revealing does not reserve or consume a Spark. Screenshots can supplement these checks but do not replace state-transition tests.

### 11. P2 — Measure main-controller responsiveness at library scale

**Code:** synchronous selection/availability in `link-selection.ts`, `live-summary.ts`, source retention/traversal publication and `library-connections.ts`; existing offline benchmark `sleeve-notes-genius-processing.bench.ts`.

The benchmark already uses production retention, seeding and background reconciliation with network disabled. It is useful evidence, but does not demonstrate that normal queue/broadcast work stays responsive during all research and UI operations.

Use a disposable representative catalogue to measure synchronous query count, publication transaction time and event-loop delay while ordinary queue/health operations continue. Include large source relationships, long use history, cold versus cached Overview/availability, matching patch publication and stats refresh. Compare against the same dataset with the feature disabled. Report the distinction between child calculation, main-process publication and end-to-end latency. Do not put brittle wall-clock thresholds in ordinary unit tests or run this against the broadcasting station without authorization.

### 12. P2 — Make the policy and evidence record consistent

`docs/internals/enriched-sleeve-notes.md` retains superseded design/status passages, including pre-replacement statements and historical plans alongside later checkpoints. The route file also still describes disabled cached browsing even though the master middleware now blocks it. These can mislead a contributor about the current contract.

Create a compact current-policy/entry-point/test matrix and label historical decisions clearly. Cover master off versus collection pause; automatic versus manual; emitted versus confirmed-air; detected versus paraphrased use; confirmed identities versus local provisional records; external discovery versus playable library music. Record the feature base and uncommitted state, and keep the eventual PR's validation claims aligned with the final revision actually tested.

No broad refactoring or new validation framework is needed to address these findings. Preserve the existing shared policy modules and trusted-Spark decision, and separate fixes into coherent changes.

## Suggested order

1. Restore a reliable enabled/off-state test baseline, preserving the existing compatibility assertions.
2. Fix Unicode identity and the maintenance/population lifecycle holes; add the reproductions as permanent regressions alongside those fixes.
3. Close the queue disable race and add the committed-silence lifecycle matrix.
4. Add provider/child-process/upgrade integration coverage and isolated browser interactions.
5. Collect representative responsiveness evidence, run complete affected-package suites and required gates, then update review documentation before publication.

## Temporary evidence

Logs are under `/tmp/subwave-sleeve-notes-audit-*.log`. The four desired-behaviour reproductions are preserved at `/tmp/subwave-esn-contribution-repro.test.ts`; their relative imports assume placement under `controller/scripts/`. They were temporarily registered, run through `npm test -- audit-esn-contribution-repro`, and removed from the checkout. Their failures are intentional evidence of the four findings, not additions to the permanent suite.
