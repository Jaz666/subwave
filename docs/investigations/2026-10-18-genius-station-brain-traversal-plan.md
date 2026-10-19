# Genius-led Station Brain research traversal

Status: original agreed plan and subsequent implementation checkpoints, 18 October 2026. The latest rate-trial checkpoint supersedes the original three-per-minute/daily-cap policy.

## Objective and boundaries

Expand Station Brain coverage using spare Genius request capacity without waiting for MusicBrainz identity resolution. Keep research within the existing controller, reuse its background connection-compute process, and yield to broadcast work. A separate research container is deferred unless measurements demonstrate a need.

The shared budget remains **three actual Genius HTTP requests per rolling minute and 4,320 per rolling day**, across connections and album research, including retries. These are installation-chosen safeguards, not verified Genius quotas. The previously discussed 5,000/day figure belonged to Subscription Genius, an unrelated service. Do not increase fetch frequency as part of this work.

Connected-track discovery/picking, queue insertion and mandatory connection speech are deferred until this research improvement is operating. Existing operator queue actions are unchanged.

## Traversal policy

1. Give encountered-track research first priority. Share capacity fairly with album research so a persistent traversal backlog cannot starve it.
2. Follow only Genius `samples` and `sampled_in` relationships. Both directions are eligible for exploration, while preserving the actual sampler/original direction in stored evidence and display.
3. Fetch a discovered song's details when its artist is confidently matched to an artist in the local library. Owning that particular song is not required to continue the branch.
4. Match discovered songs separately to exact library entries. Only confirmed local tracks are available to existing library actions; an artist match alone never makes a song queueable.
5. For an artist absent from the library, retain the returned artist/song identity, Genius IDs/URL and relationship evidence, but do not fetch further details for that branch.
6. Stop at a dead end, an outside-library artist, an already researched song or an already scheduled song. Persist visited/work state by Genius song ID to prevent cycles, repeated fetches and duplicate jobs across restarts. Cache hits should not terminate other unexplored branches of the same graph.
7. When higher-priority work and traversal are exhausted, seed research from unexamined library tracks, rotating between artists rather than exhausting one large catalogue first.

Covers, shared writer and shared producer relationships do not expand the crawl. Existing collection of these credits/relationships may continue. No lyric scraping or raw lyric storage is introduced.

## Existing implementation and required changes

`genius.ts` already projects sample relationships with target Genius IDs, titles and artists. Its current track fetch always performs search followed by song detail. `library-connections.ts` already matches stored relationships to the local catalogue without network requests, using known identity or exact title/artist, and leaves uncertain versions unresolved.

The MusicBrainz dependency is currently upstream: `retainCanonicalMusicBrainzMatchInDatabase` queues Genius jobs and `recordingForGenius` requires a matched recording. Introduce the smallest provider-independent identity/attachment path needed for Genius research. Do not label a Genius-only match as MusicBrainz-confirmed, invent MBIDs or merge recordings/artists merely because their display names coincide. Later MusicBrainz enrichment must preserve Genius evidence, operator edits, local associations and job deduplication.

Add a direct song-detail fetch for known Genius IDs. Use search only for initial library seeds lacking a confirmed Genius identity, retaining the existing conservative artist/title checks. Avoid repeatedly searching known no-matches; use an explicit retry/refresh policy. Decide exact refresh intervals during implementation, rather than creating an indefinite automatic retry loop.

Use the existing local connection catalogue and cached library artist identities to establish traversal boundaries. Match actual artists rather than substrings; preserve live/remix/version distinctions and leave ambiguous artist or recording matches unresolved. Do not query MusicBrainz to resolve traversal uncertainty. Do not perform a full catalogue scan for every discovered edge.

## Controller performance and yielding

Reuse the existing durable research queue and shared Genius budget. Keep one Genius job in flight; do not introduce parallel crawling or another scheduler. Process bounded work per turn and check collection pause, feature enablement and the existing broadcast/interactive-work gate before requests, between processing batches and before expensive reconciliation. An asynchronous network wait does not itself block the controller, but response parsing, loops and synchronous SQLite operations can.

Keep writes in short transactions with no awaited network work inside them. Persist the next work position so yielding or restarting resumes safely. Batch/coalesce connection reconciliation rather than rebuilding the entire graph after every returned relationship. Retain read-only calculation in the existing child process, revision-checked publication of changed rows and bounded map caching. Avoid synchronous unbounded parsing, matching or job insertion on the controller thread.

Retain exponential backoff and the common request ledger. Honour valid `Retry-After` responses and add an identifiable Subwave User-Agent. Treat these as client behaviour choices; do not document unverified numeric allowances or terms as official Genius policy.

Preserve existing backup/restore coordination, disable/pause behaviour and recovery of interrupted work. No additional containers, ports, credentials or operator setup are required.

## Implementation sequence

1. **Baseline and processing budget:** measure existing Genius response projection, claim retention, traversal scheduling and connection publication; distinguish network wait from controller-thread work. Use stored responses and a disposable database for accelerated replay, with external fetches disabled. Record database contention, controller responsiveness, memory and graph-compute duration. Choose bounded batch sizes from measurements.
2. **Independent identities and fetch reuse:** support Genius-only research subjects/local associations, direct song-ID fetching, cached no-match handling and safe later enrichment. Keep existing MusicBrainz-led research working.
3. **Durable sample traversal:** enqueue eligible known-library-artist targets, retain boundary evidence, prevent duplicates/cycles and resume across pause/restart. Keep exact-track library matching independent of artist traversal eligibility.
4. **Fair catalogue seeding:** rotate unexamined library tracks/artists into spare capacity, behind encountered work, with album-work fairness and no unbounded queue materialisation.
5. **Visibility and controlled rollout:** expose request usage, ready versus deferred jobs, oldest ready-job age and meaningful failure/backoff state through existing research/status surfaces. Distinguish broadcast-gate waiting and retry delays from actual capacity pressure. Roll out at the unchanged request ceiling and observe real station behaviour before considering further throughput.

A growing queue justifies a later limit review only when ready work persistently waits while the available request budget is being used. A backlog caused by broadcast activity, upstream dependencies or slow local processing does not establish a need for more API traffic.

## Focused acceptance checks

- A local seed without a MusicBrainz identity can acquire a Genius identity and connections with zero MusicBrainz requests.
- Known Genius targets use song detail directly; cached/visited targets and overlapping branches do not spend duplicate requests.
- A → B → A terminates, while a known artist's missing-library song can lead onward to another eligible artist/song.
- An unknown-library artist stops traversal but its boundary evidence is retained; ambiguous names and alternate versions are not silently accepted.
- All Genius capabilities and retries share the existing rolling limits and backoff; album work makes progress under sustained traversal.
- Collection pause and broadcast priority prevent further background steps promptly; interrupted work resumes without losing evidence or duplicating jobs.
- Existing matching, moderation, operator queueing, backup/restore and MusicBrainz enrichment remain intact.
- Isolated cached-response replay demonstrates bounded controller-thread processing and acceptable database-publication duration at the intended workload. No live broadcasts, queue actions or accelerated external requests are used for verification.

## Deferred uses and evidence

Retained outside-library connections can later support an operator “record store wishlist”: rank absent artists by distinct sample relationships and distinct connected library artists, show the songs/directions/evidence, and avoid inflated counts from duplicate album copies. No wishlist UI or ranking is included now.

The read-only inspection found 85 cross-artist sample pairs after limited research coverage. At the later pipeline inspection there were no queued Genius jobs, so lack of eligible work was a current constraint, not evidence of sustained quota exhaustion. Graph calculation is already offloaded, but full connection reconciliation still reads the catalogue and accumulated graph. Current telemetry does not establish a safe higher processing rate; resource snapshots are not a load test.

## First implementation checkpoint — offline baseline

Added `controller/scripts/sleeve-notes-genius-processing.bench.ts`. Run from `controller/` with `npx tsx scripts/sleeve-notes-genius-processing.bench.ts /path/to/sleeve-notes.db`. It opens the input read-only, takes a SQLite online backup into a temporary directory, points configuration there before importing station modules, disables parent-process fetch, and removes the disposable database afterwards. The existing calculation child only reads that temporary database. No production behaviour or request limits change.

The replay selects the 30 largest retained Genius recording projections and stamps fresh retrieval times to exercise new source/claim insertion. On the 18 October snapshot (32,361 claims, 15,261 edges, 66,886 indexed tracks), the largest projection was 20,540 bytes with up to 102 relationships. Results on this host:

| Operation | Median | 95th percentile | Maximum |
| --- | ---: | ---: | ---: |
| Stored projection JSON parsing (30) | 0.083 ms | 0.122 ms | 0.132 ms |
| Synchronous source/claim retention (30) | 12.67 ms | 20.26 ms | 24.02 ms |
| Unchanged background reconciliation, including first child startup (3) | 966.62 ms | 1,357.09 ms | 1,357.09 ms |

Separately, building the accumulated patch took 993.68 ms in the isolated benchmark process, and synchronous publication took 78.24 ms for 1,998 edge upserts and 76 changed match groups. Production already calculates the patch in its child process; the deliberate in-process calculation here only makes publication separately measurable. The accumulated replay batch is not a normal single-response publication. RSS growth from this replay includes that deliberately in-process graph calculation and must not be reported as production controller memory growth.

These results support retaining the existing offloaded computation and coalescing reconciliation. Publication is the clearest measured synchronous step to watch as coverage grows. They do not yet establish a safe maximum batch size: traversal scheduling has not been implemented or measured, raw HTTP projection is not replayed, and live latency, concurrent database activity and broadcast yielding are not simulated. Extend the same offline replay when traversal exists; do not infer a higher safe API rate from these numbers.

Verification: the replay completed against a disposable snapshot; controller type checking passed. No full suite, extra API traffic, live queue actions, settings changes or deployment were performed. Independent Genius identities and traversal remain the next implementation stage.

## Known-ID fetch checkpoint

Implemented direct `GeniusProvider.fetchSong` with numeric ID validation and returned ID/title/artist checks. The regular search/detail path delegates its detail request to the same method. `recordingForGenius` reads the latest retained Genius recording identity, tolerates malformed JSON/IDs, and the worker reuses a valid ID through its existing budgeted fetch. A mismatch does not trigger an implicit replacement search. All Genius adapter requests now carry an identifiable Subwave User-Agent.

Six focused adapter/repository checks passed, including single-request direct lookup, no-search mismatch handling, latest cached identity reuse and malformed-cache fallback. Controller type checking passed. Existing MusicBrainz eligibility is deliberately still in place: this checkpoint implements fetch reuse, not independent identities or traversal. No schema change, live request, deployment or API-budget change was made. The next checkpoint must establish provider-independent associations and safe later canonical enrichment without losing evidence or operator edits.

## Independent encountered-track identity checkpoint

Encounter admission now queues an idempotent Genius `local-track` connections job alongside MusicBrainz matching, rather than waiting for the canonical response. The same existing worker, quiet gate and shared request ledger execute it. Existing canonical jobs remain supported. Already retained Genius identities on local/canonical subjects avoid a second independent lookup; canonical resolution does not enqueue duplicate work when independent work is pending or complete.

Schema 55 adds `sleeve_genius_local_tracks`, an explicit local-track-to-research-recording association. Independent research uses recordings marked `unmatched` with no invented MBID, and does not change the canonical local attachment. The returned Genius song must still pass the adapter's title/artist identity checks. Metadata changes invalidate the provisional local association; a track changed during a fetch is requeued instead of retaining stale evidence.

Later MusicBrainz matching retains its own canonical identity and attachment. Genius source/claim IDs and operator decisions remain on the original research identity and remain reachable through the explicit local association; this avoids a destructive merge of pre-existing canonical records. Local connection matching recognises both associations, prefers canonical recording identity when available, and accepts an explicitly associated Genius identity without treating it as conflicting metadata. Link selection includes Genius recording claims through that association, including after canonical enrichment. Older disabled caches without the new table remain readable without migration.

The encountered-track path is implemented; catalogue seeding, cross-track Genius-ID deduplication, sample traversal and album fairness are still pending. No historical backlog is bulk-enqueued by this migration, and no refresh interval or API increase is introduced. Independent artist records are provider-local placeholders, not MusicBrainz-confirmed artist matches; traversal must resolve library-artist eligibility separately.

Verification: 70 focused adapter, repository, connection, canonical, migration, backup/restore, album, segment and retired-source checks passed. After the final selection change, the 12 relevant identity/connection checks passed again. Controller type checking and targeted lint passed. No full suite or live API calls; no rebuild, deployment or broadcast actions. Controller rebuild required to activate.

## Sample traversal checkpoint

Schema 56 adds a durable frontier keyed by Genius song ID, with a source-document reference and relationship cursor. New or reused encountered-track results register expansion through the existing Genius job queue. Each expansion turn examines at most twenty stored relationships. Only `samples` and `sampled_in` targets with exactly one matching cached library artist are scheduled. Exact song ownership is not required; unknown or ambiguous artists stop that branch, while the original relationship evidence remains retained. Expansion waits for initial library-artist population rather than treating an unpopulated index as a dead end.

Known IDs use direct detail requests. Visited or scheduled IDs are not scheduled again, preventing cycles and overlapping-branch duplication. A unique cached song identity can be associated with another local track without duplicating source/claim identity or repointing its canonical MusicBrainz attachment; ambiguous same-name identities are not reused by name. Missing-library songs remain unqueueable. Branch artist membership is checked again before fetching, and paused/interactively busy stations yield through the existing worker gate. Cursors and jobs survive database reopen/backup/restore.

Worker ordering is encountered local tracks, existing canonical track jobs, album research, cached sample expansion, then sample-detail traversal. This keeps the crawl behind encountered work and album research. All network requests still share the existing rolling limits, timeout and failure backoff. There is no parallel fetcher or additional scheduler. Existing saved research is enrolled as it is encountered/reused; this migration does not bulk-register the historical catalogue or seed unexplored tracks.

The isolated replay now measures registration and expansion using only the saved artist catalogue. For the thirty largest saved projections on this host: registration median 0.60 ms / maximum 2.69 ms; 111 expansion turns median 0.28 ms / 95th percentile 2.95 ms / maximum 5.91 ms. Source/claim retention remained 12.61 ms median / 23.93 ms maximum. The accumulated graph patch still took 97.20 ms to publish synchronously after roughly thirty replayed responses; this is not a normal one-response publication and remains the step to monitor. No additional API traffic was generated. These are offline timings, not measured broadcast latency.

Verification: 29 focused adapter, identity, migration, backup and connection checks passed; after final changes, all five traversal checks passed, including a real-worker quiet-gate/no-network check and reopening the database mid-expansion. Controller type checking, targeted lint and whitespace checks passed. No full suite, live requests or deployment. Controller rebuild required.

Remaining: fair library seeding, clearer queue/age visibility, explicit cached-no-match/refresh policy, and Retry-After support. Connected-track picking, increased request frequency and a separate container remain deferred.

## Queue visibility checkpoint

Overview → Research Activity now includes rolling Genius request usage (minute and 24-hour windows), waiting track/album/sample job counts, ready/deferred/running totals, and the creation age of the oldest currently due job. The wording explicitly says when that job was queued; it does not claim the entire age was spent eligible to run. Existing Show more exposes the remaining individual research jobs and scheduled retry times; sample fetching and cached expansion have plain-English task labels.

The current worker supplies its quiet/running snapshot. Readout distinguishes provider off, missing credentials, collection/token pause, yielding to broadcast/interactive work, request allowance, error backoff, active work and future retries. Cached expansion jobs count as ready work but do not alone imply a need for request allowance. Counts refresh through the existing thirty-second readout query, with no new polling surface. The budget display and actual reservation share one read-only allowance calculation inside the existing atomic reservation transaction, keeping rolling windows/backoff consistent. Reading usage does not reserve requests or mutate jobs. Disabled cached browsing remains read-only and omits live worker metrics.

Verification: five rendered Overview checks and fourteen focused Genius checks passed, followed by three queue/allowance checks including the daily ceiling with an empty minute window. Controller/web type checks and targeted lint passed; no full suite, live browser inspection, API requests or deployment. Controller and web rebuilds required. Fair library seeding and refresh/Retry-After policy remain pending.

## Fair library seeding checkpoint

Schema 57 adds separate catalogue seed associations and a durable artist cursor. When no encountered, canonical, album or sample work is ready, the existing Genius worker resumes a due seed or selects one unexamined cached library track. Selection rotates through unambiguous artist names in stable order, wraps at the end and examines at most ten artists per turn. Only one seed job may be queued, running or deferred at a time. Both initial artist population and a completed track-catalogue sweep are required.

Seeding does not call encounter admission: it creates no play history, canonical attachment, MusicBrainz job, article research or LLM request. Seed research uses the existing Genius adapter, shared request ledger, quiet gate, pause handling and retry path. Results enter the existing sample traversal. Seed associations also support connection matching and source-backed link selection without inventing MusicBrainz confirmation; cached shared identities can be reused safely. A disappeared or changed catalogue track invalidates its seed identity before retention.

Tracks already encountered, including other catalogue copies with the same exact artist/title key, are excluded. Already seeded identities and known/scheduled Genius frontier identities are also excluded. Completed/no-match seeds are not selected repeatedly; explicit refresh/no-match retry policy remains separate. Historical research is not automatically enrolled for traversal by this change. The queue labels a seed as “Research an unexamined library track”; its waiting count is included under Track lookups.

The offline benchmark now measures seed selection on a disposable catalogue snapshot. Twenty selections queued twenty seeds, with median 0.91 ms, 95th percentile 1.18 ms and maximum 2.68 ms on this host. The benchmark completes those synthetic jobs only in the disposable copy, fetching nothing. These are selection timings, not external fetch or live broadcast measurements.

Verification: thirty-three focused seeding, traversal, identity, queue, connection, migration and backup checks passed. Five final seeding checks passed after adding explicit historical-copy exclusion coverage. Checks include durable rotation, single-seed backlog, missing catalogue guards, source eligibility, catalogue removal, worker yielding/priority, and two mocked Genius requests through the shared ledger. Controller/web type checking, targeted lint and whitespace checks passed. No full suite, live API requests, rebuild or deployment. Controller rebuild required for seeding; web rebuild includes the friendly seed task label.

Remaining: bounded historical traversal enrolment, explicit refresh/no-match retry policy and Retry-After handling. Connected-track picking, higher fetch frequency, the wishlist and a separate research container remain deferred.

## Six-per-minute trial — 18 October, evening

The owner clarified that both previous limits were installation choices based on unrelated API information, and authorised assessment/change following sustained backlog growth. At 21:34 BST the preceding hour showed 177 Genius requests (98% of the old 180/hour ceiling), all HTTP 200; 177 sample lookups completed and 216 new traversal targets were queued. The controller CPU snapshot was 0.26% with 489 MiB container memory. Inspected logs showed no database locks or connection-calculation timeouts; Navidrome scanning deferred catalogue reconciliation. These snapshots and earlier offline processing timings support a cautious trial, not a measured guarantee under resumed broadcast load.

The prepared policy is six requests per rolling minute with a minimum ten-second interval between reservations, shared across capabilities and retries. The unsupported daily cap is removed; last-24-hour usage remains visible as a count without a quota denominator. Failure backoff and broadcast priority are unchanged. The worker's short request-wait allowance rises to twelve seconds so a search/detail lookup can wait out ten-second spacing without repeatedly abandoning the detail request and restarting search. No schema change is needed.

Fourteen focused allowance, seeding and traversal checks passed, including ten-second spacing, removal of the old daily block, and a real worker search/detail sequence using mocked network responses. Overview rendering, controller/web type checks and targeted lint are used for verification. No full suite or live rate change: controller rebuild activates the policy; web rebuild removes the daily denominator. No rebuild/restart was performed. Compare completed lookups, discovered targets, failures/backoff and controller responsiveness after activation before further rate changes.
