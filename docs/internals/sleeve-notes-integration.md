# Extended Sleeve Notes: integration review map

Most feature code is contained in `controller/src/sleeve-notes/` and its admin views. Review the shared boundaries below alongside the [feature internals](enriched-sleeve-notes.md). The feature is opt-in, but switching it off does not revert shared LLM, timing or telemetry changes in this branch.

## Shared boundaries

Paths are repository-relative. Test names refer to `controller/scripts/` unless prefixed with `web/`.

| Boundary | Behaviour to review | Regression coverage |
| --- | --- | --- |
| Ordinary picking and track links: `broadcast/dj-agent/enqueue.ts`, `llm/internal/prompts/scripts.ts` | Enrichment follows the selected track. A Spark is optional, may be passed, and must not alter the pick. Release reservations on failed generation/queue insertion. Disabled metadata paths must not create/migrate the research DB. | `verified-facts.test.ts`, `link-style.test.ts`, `sleeve-notes-spark-packet.test.ts`, `sleeve-notes-link-isolation.test.ts` |
| Automatic Banter and manual segments: `broadcast/scheduler.ts`, `skills/_agent.ts`, `skills/loader.ts`, `routes/dj.ts` | Eligible automatic slots can try Sleeve Notes, including Produced Episodes, then fall back. Manual Banter remains Banter. Manual feature requests retain material, host, timing and publication guards. | `sleeve-notes-segment.test.ts`, `sleeve-notes-broadcast-gate.test.ts`, `sleeve-notes-lifecycle.test.ts` |
| Queue/TTS and speech timing: `broadcast/queue.ts`, `broadcast/queue/intro-render.ts`, `broadcast/queue/voice-io.ts`, `audio/tts.ts` | Offer/render/airing are distinct. Bound speech by the actual track play and final rendered duration. Feature disable must not strand speech already committed to a mixer silence. Review shared timing changes independently of the feature flag. | `sleeve-notes-speech-tracking.test.ts`, `speech-budget.test.ts`, `tts-measurements.test.ts`, `pause-talk-recovery.test.ts` |
| Agent activity, LLM budget and telemetry: `llm/agent-activity.ts`, `broadcast/dj-budget.ts`, `llm/internal/core/failover.ts`, `llm/internal/strategy/object.ts` | Overlapping interactive work blocks research correctly. Quiet-time deferrals are not provider failures. Background work obeys the station hard cap. Structured output changes must preserve other model consumers. | `agent-activity.test.ts`, `sleeve-notes-token-budget.test.ts`, `llm-failover.test.ts`, `llm-local-parse-errors.test.ts`, `llm-deadline-hits.test.ts` |
| Settings and credentials: `schemas/settings.ts`, `settings/patch-registry.ts`, `settings/store.ts` | Master off by default; collection pause is independent. Redacted tokens survive unrelated saves; explicit clearing works. Validation/mirrors and Save/Discard use the existing settings boundary. | `extended-sleeve-notes.test.ts`, `settings-patch-schema.test.ts`, `sleeve-notes-settings-lifecycle.test.ts`, `web/tests/notes-settings.test.ts` |
| Music identity and library state: `music/library-db/tracks.ts`, `music/subsonic.ts`, `music/musicbrainz.ts` | Metadata/server changes invalidate local bindings and late responses. Catalogue matching must yield during scans/broadcast work and must not treat a failed empty response as library deletion. | `sleeve-notes-local-identity.test.ts`, `sleeve-notes-library-connections.test.ts`, `sleeve-notes-no-genius.test.ts`, `brain-queue.test.ts` |
| Backup and restore: `backup/zip.ts`, `routes/backup.ts` | Research is an optional WAL-safe archive entry. Refuse unsafe/future/corrupt restores before changing state; coordinate active research, restore queued jobs and clear display caches. | `sleeve-notes-backup.test.ts`, `sleeve-notes-upgrade.test.ts` |
| HTTP/admin integration: `routes/sleeve-notes.ts`, `routes/debug.ts`, Dash and Notes components | Auth/master gates apply to writes. Cached reads remain read-only. Correct/edit/restore/delete require explicit actions and current-version/source checks. Expensive display queries run in the read-only worker. | `sleeve-notes-cached-browsing.test.ts`, `sleeve-notes-manual-review.test.ts`, `sleeve-notes-dashboard-worker.test.ts`, `sleeve-notes-queue-actions.test.ts`, `web/tests/airing-reviews.test.tsx`, `web/tests/notes-overview.test.tsx` |
| Presentation and manual | Review the manual/sidebar/tab integration as shared UI changes, including responsive layouts and theme behaviour. | `web/tests/sleeve-notes-master-switch.test.tsx`, admin-query audit |

## Reproducing checks

Controller tests must run through `npm test`; it provides isolated temporary state. Do not run test files directly against a station. Test providers are synthetic/mocked and do not require credentials or paid calls.

```sh
cd controller
npm test -- sleeve-notes
npm test -- brain-queue
npm test -- speech-budget
npm test -- agent-activity
npm test -- verified-facts
npm test -- link-style
npm run lint
```

Also exercise the existing shared suites relevant to a proposed change: pause-talk recovery, talk scheduling, LLM failover/object parsing, backups and settings. The full controller suite is `npm test`. From `web/`, use `npm test` and `npm run lint`; from `app/` and `mcp-subwave/`, use their lint/type gates. Generated schema/theme drift checks remain the upstream CI contracts.

## Acceptance that unit tests cannot establish

Use the [tester guide](../testing/extended-sleeve-notes.md) for source builds, backup/recovery, first enable, optional Genius, normal playback and UI checks. In particular, observe the broadcast with research and multiple admin tabs active, test the actual LLM/provider configuration, and inspect the factual quality of retained stories.

Further early-review targets include bulk catalogue edits and confirmed-empty libraries, source outages/backoff, disk-full/permission recovery, changed clocks, indistinguishable replacement music servers, interrupted upgrades/restores, large collections and remaining synchronous maintenance. A catalogue scan that starts and finishes between checks cannot always be detected. Passing synthetic tests does not establish uninterrupted audio, provider coverage, model compliance or a fixed cost per track. No live destructive fault-injection result is claimed.

## Early-review corrections

The render tracker now counts outstanding promises independently of queue-item
addresses. Regression coverage includes invalidation, failed renders, replacement,
identity transfer and transfer over another active render. Banter timing limits
apply to automatic slots; skipped automatic exchanges enter the scheduler log
without being reported as speech. Feature-disable checks guard both sides of TTS
and release story reservations on rejection.

Disabled cached browsing is explicitly limited to saved-data GET views. Its
asynchronous read-only handle remains open through completion, and library-only
stories use the same boundary. Tests cover absent caches, retained snapshots,
authentication, rejected writes and unchanged on-disk data. Test directories use
the shared lifecycle helpers; HTTP fixture shutdown closes connections before
removing state. A previously reported isolated connection-reset flake has not been
reproduced in the verified full run; this is not a guarantee against future flakes.

The web production build uses upstream's default `next build`. Initial database
creation is one public schema, with a distinct application id and explicit refusal
of pre-release experiments; the reset instructions are in the tester guide.

Validation for this correction pass: 5,403 controller tests and 464 web tests pass;
controller/web/app/MCP lint and types pass; generated schema/theme mirrors show no
drift; admin-query audit passes; the default Turbopack production build succeeds.
Controller ESLint has 1,733 existing warnings, matching the reviewed upstream
baseline. The consolidated schema was compared against the previous schema: all
145 tables/indexes/triggers and the initial revision row match. These checks do
not replace the pending real-station reset, provider research and on-air checks.
