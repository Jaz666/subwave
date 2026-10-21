# Extended Sleeve Notes — handover, 19 October 2026

Read this first. This supersedes the checkout/status introduction in the 16 October handover. That document’s appended checkpoints and the 18 October traversal plan retain useful implementation detail.

## Repository, branches and publication

- Workspace: `/home/jaz666/Docker/subwave`; this is both the development and station checkout. `/home/jaz666/subwave` no longer exists; its old remote is stale.
- Active branch: `test-station/sleeve-notes-clean-20261014`.
- Upstream `origin`: `https://github.com/perminder-klair/subwave.git`; latest fetched `develop`: `7cb507f517d7483c25c75918d1659804daddc357`.
- Fork `jaz666`: `https://github.com/Jaz666/subwave.git`.
- Feature PR: https://github.com/Jaz666/subwave/pull/5 ; head `feat/extended-sleeve-notes`, base `develop`.
- Last pushed feature/station commit: `5b85af21` (19 October). `c6924e19` checkpointed all earlier local feature work; `b98ffcd0` merged upstream develop; `5b85af21` added regression coverage/documentation for the merge.
- Local `develop` was fast-forwarded to fork `jaz666/develop` at `29bd104d`, which already includes upstream `7cb507f5`. Fork-only documentation/history was preserved.
- **There are substantial uncommitted changes after `5b85af21`. Preserve them all.** They include the master switch, series cooldown, artist variant matching, airing filters and UI follow-ups listed below. These changes are not yet in PR #5.
- Recovery refs: `backup/station-before-upstream-20261019`, `backup/station-checkpoint-before-upstream-20261019`, `backup/develop-before-upstream-20261019`.
- Separate unrelated worktree: `/tmp/subwave-pr-1965`, branch `codex/pr-1965-conflict`, last pushed `1e15a8b5`. Do not mix its work with Sleeve Notes.

## Working rules and deployment

Read root/controller/web AGENTS.md and CLAUDE.md as applicable, plus `docs/internals/enriched-sleeve-notes.md`; queue/speech changes also require `docs/internals/broadcast.md`. UI follows `.design-sync/conventions.md`: existing newsprint/hi-fi design, sharp corners, shared components, plain-English explanations.

Keep edits minimal, relevant files only, no speculative abstractions, and checks focused. No subagents unless explicitly requested. Use absolute paths for edits: relative `controller/...` paths repeatedly failed when cwd was already `controller/`.

The user rebuilds/restarts the station. **Do not deploy, change live settings or trigger broadcasts without explicit authorization.** Some changes have evidently been rebuilt by the user (Run-D.M.C. matching was confirmed working), but do not assume all current working-tree changes are deployed. Upstream’s October update includes broadcast/Liquidsoap changes, so the full upstream update needs controller, web and broadcast rebuilt.

`.env`, `docker-compose.discord.yml`, state/databases and credentials must remain untouched and out of commits/output. Station-specific compose is locally excluded. Never dump settings/environment or authentication headers. Read-only DB inspection is authorised. Specific live historical backfill queue commands were explicitly authorised and run during this session; that is not blanket authorization for arbitrary state changes.

Controller tests that may touch settings **must run through** `npx tsx scripts/run-tests.ts <filter>` (fresh temporary STATE_DIR). Direct upstream test invocation attempted station settings access and hit permissions; no live settings changed. Some self-contained older tests set their own temporary STATE_DIR. Do not run full suites by default.

No browser automation was available here; UI changes have static render/source/type/lint checks and user screenshots, not live browser verification.

## Current user decisions

- Entire feature is niche/opt-in, hidden until enabled in **Settings → DJ Behaviour**.
- Master switch is all-or-nothing: off hides feature UI and stops its activity, retaining data/jobs for re-enable. No cached browsing/manual firing bypass while off.
- Stored Sparks are trusted. Do not restore factual-policing LLM verification; user controls editorial wording through prompts/house rules.
- Automatic Sleeve Notes gets first chance in eligible Banter slots when enough material exists, including Produced Episodes; normal Banter is fallback. Explicit manual Banter remains Banter.
- Queue insertion / connected-track discovery candidate source is shelved. Only 86 cross-artist library sample track pairs (82 distinct artist pairings) were found versus the earlier 85, in a roughly 67k-track library.
- Shared-writer/producer external rankings are also deferred until data is richer. Existing external rankings remain Most connected, Sample sources and Sample users.
- MusicBrainz is canonical for confirmed artist identities. MB-free traversal uses the library artist name. Artist spelling fallback must not relax recording title/version matching.

## Implemented and already pushed by 5b85af21

- Genius independent local-track identities and cached source reuse, sample-only traversal (`samples` / `sampled_in`), known-ID direct detail lookup, durable visited frontier/cursor.
- Traversal follows only uniquely known library artists; songs outside the library can be researched but never become queueable merely through discovery. Unknown/ambiguous artist stops that branch.
- Fair seeding: one outstanding `library-seed`; alphabetical artist rotation, one unexamined alphabetical track per artist per pass, wrapping with a persistent cursor. Skips encountered/seeded/known exact artist-title copies. Lowest priority after encountered work, album jobs, cached expansion and sample traversal. Branches can therefore interrupt progression through seed artists.
- Genius rate: **six requests per minute, at least ten seconds apart; no daily ceiling**. This is station policy, not a verified Genius contractual limit. Earlier 3/min and 4,320/day limits were user-imposed from mistaken third-party information. Usage is still measured daily. Retry-After support remains pending; exponential backoff exists.
- Research remains in controller, with expensive graph matching/projections in the existing read-only child worker. Rendered speech merely waiting at a boundary no longer blocks research; active rendering/picking/sending/handoff still does.
- Simplified Controller Research / LLM Research Overview readout.
- Station Brain layer-aware manual queue actions, operator recency override consistent with Library queueing, fullscreen map layout/details controls, duplicate provisional artist display grouping.
- Station Brain secondary tabs: Map default, Stats & Discoveries on demand. Rankings use saved facts directly connecting library artists to external names; Most connected counts distinct library artists. Reuse existing background graph worker, revision-based cache, explicit Refresh, no periodic statistics work/provider calls. Initial in-process measurement ~0.76s justified child execution.
- Overview Saved knowledge counts split Stories / Connections / Credits, filtered links. Artist/album/track links in On Air and Next Up go to Station Brain using library IDs; track opens album layer selected via `brainTrack`.
- Known entities without saved claims return empty dossiers. Search suppresses provisional artist duplicates before limiting, retaining distinct confirmed identities.
- Dash rotating Sleeve Notes card between Queue and Booth Log: shuffled full cycles, 15s reading time after reveal, hover/focus pauses and completes reveal, saved-Spark-only review flag, no flags on connections/credits. No reservations or cooldown consumption merely from viewing.

## Uncommitted changes to preserve

### Master switch

Files: `AdminShell.tsx`, `DashPanel.tsx`, `NotesPanel.tsx`, settings `DjBehaviourSection.tsx` / `registry.ts`; controller routes, `server.ts`, `segment.ts`, `queue.ts`; regression tests.

- Real master switch moved into DJ Behaviour outside Advanced, with description and warning: paid **LLM Provider**, roughly **2,000 extra tokens per track played** for background research; usage varies and reviews/segments add more. Research without listeners depends on station settings. Data retained off.
- Uses shared settings query (`SettingsData.values.djBehaviour`, not top-level) for sidebar/command targets and Dash controls. Off hides Notes, Dash card, manual segment button. Direct Notes page gives only enable/settings guidance.
- Controller middleware rejects feature operations with 409 while disabled, except `/status` and `/dash-stories` for gating. Direct brain queue selection is also gated. Pure cached DB helper access still exists internally.
- Shared quiet gate includes master enablement. Segment preparation/generation honours master even manually; generation aborts on disable. Queue gates late/deferred publication and drops waiting uncommitted segments on settings publication.
- **Mixer-committed speech remains an exception**: a committed pause-and-talk silence must retain its voice to avoid dead air. Do not remove the existing `dropPendingVoice` commitment guard. Already committed/airing audio finishes safely.
- Focused checks: 30 segment, 10 coverage/API, 2 broadcast-gate and 1 master-copy render checks passed; types passed. Controller lint had existing warnings, no errors.

### Six-hour per-series cooldown

`link-selection.ts`, selection/series-management tests.

- A MusicBrainz series cools down station-wide for six hours after a confirmed aired Spark with detected usage. Applies across artists/tracks to ordinary links, automatic segments and availability counts.
- Other series/narrative stories remain eligible under normal guards. Offered/unused/dropped Sparks do not start this cooldown. Manual segment runs retain the established operator override of aired-story cooldowns.
- Reads historical use → retained claim/source joins, keyed to series source URL. No migration/backfill needed.
- 11 selection + 5 series-management checks passed; types/lint passed.

### Artist variants across Genius

`library-connections.ts`, `genius.ts`, `genius-traversal.ts`, `external-discoveries.ts`, related tests.

- Run-DMC was incorrectly external despite library `Run‐D.M.C.` (Unicode dash). User confirmed the initial discovery fix worked after their rebuild.
- Shared artist-only dot/space/Unicode-dash fold, library-name resolver with ambiguous identities failing closed. MusicBrainz identified records retain their names; new provisional traversal records use library spelling, and old provisional traversal reads prefer unique library spelling.
- Genius search/detail and album artist validation accept spelling variants; search refuses ambiguous matching song IDs. Cached song/frontier reuse and library matching use artist rules; track titles retain prior strict version/remix/live handling.
- Original provider evidence is retained unchanged. No identity merge or additional MusicBrainz calls. Derived match basis is `exact-title-and-artist-variant` where applicable.
- Rebuild starts connection worker with lastFactsRevision=-1, so next enabled/unpaused quiet pass recalculates the index locally in the background. Old branches previously stopped by spelling mismatch do not automatically re-expand.
- 23 Genius + 11 library-connection + 1 discovery checks passed; later traversal-specific repeat (6) passed after canonical read adjustment; types/lint passed.

### Airings missing from default views

`heard-on-air.ts`, `HeardOnAir.tsx`, `NotesRecentlyAired.tsx`, related tests.

- On 19 October, nine confirmed native segments had complete transcript rows and rendered/airtime ledger records; four had zero detected wording matches. Strict default filter hid them.
- New `usage=sleeve-notes` default = **all confirmed Sleeve Notes segments plus links with detected Spark use**. Normal greetings with unused offers remain excluded. Strict Use detected / Use not detected and All aired exchanges remain selectable.
- No historical records/detection results changed. Existing segments become visible after rebuild; no backfill needed. Overview’s two most recent exchanges use the same new default.
- 11 backend + 13 web focused checks, types and lint passed. Some old disabled-read test expectations were updated to the new master-switch 409 policy.

### UI follow-ups

- Dash Sleeve Notes text matches Booth Log: 11px, relaxed line height. Content height currently `h-[82px]`; user chose to keep it, with internal scroll for rare long facts (no Read more control).
- Footer Source and Explore links removed. Header Station Brain link targets current on-air library artist.
- Reveal speed halved to three characters / 50ms. Cursor keeps blinking after reveal and during rotation pause; hidden for reduced-motion/Lite mode.
- Queue + Sleeve Notes / Manual Voice DJ share desktop rows via subgrid. CSS `[data-dash-layout]:has([data-card="sleeve-notes"])` activates shared rows only when card is present; off restores Booth Log directly beneath Queue. Mobile stacking boundary is 640px.
- Latest small change: Overview On Air / Next Up header minimums now `min-h-[59px] sm:min-h-[53px]` to align Run Segment header borders. Lint/whitespace checked; user has not yet confirmed the final 2px adjustment.

## Live historical backfill and progress

`controller/scripts/sleeve-notes-genius-backfill.mjs` queues at most 25 older saved roots with sample targets belonging to known library artists. It makes no API requests itself; the worker handles descendants under normal limits.

User explicitly authorised successive batches; agent ran three batches of 25, then a final invocation with the in-memory batch limit removed queued **all 50 remaining eligible roots**. Script on disk remains capped at 25. At final invocation there were 50 expansion jobs plus one queued and one running sample-traversal job. Do not assume the current queue without fresh inspection.

Earlier read-only measurement before those batches: 8,097 saved Genius songs, frontier 5,676; 2,421 older songs unenrolled, of which 128 had eligible sample paths, reaching 212 unique first-hop targets (202 new details). Counts changed as normal traversal progressed, hence the batch total need not equal 128 exactly.

User reports backlog cleared and unexamined-track seeding has stayed caught up for several hours during broadcasting. Leave rate and depth alone unless fresh evidence justifies change.

## Outstanding / deferred

- No new feature request is pending. Latest user request is this handover.
- Many working-tree fixes still need a commit/push when requested; do not claim PR includes them. No full suite has been run.
- Beta discussion: user tested research with OpenAI Cloud API. Still worthwhile to test provider failures, upgrades/restores, varied libraries/hardware, spending defaults and disabled-state behavior. No beta rollout authorised.
- Retry-After handling and automatic historical enrolment/refresh policy remain pending. Worker-wide provider `notBefore` can pause cached expansion during backoff; not fixed.
- Previously stopped alias branches can be revisited through an explicit cached re-expansion plan, not a provider re-fetch by default.
- Shared writer/producer rankings, connected-track candidate source, record-store wishlist and separate research container are deferred.

## Useful references

- `docs/investigations/2026-10-16-extended-sleeve-notes-session-handover.md` — historical decisions + checkpoints.
- `docs/investigations/2026-10-18-genius-station-brain-traversal-plan.md` — traversal plan and checkpoints.
- `docs/internals/enriched-sleeve-notes.md` — feature internals, updated to current master/cooldown/naming policy.
- Read-only station DB: `/home/jaz666/Docker/subwave/state/sleeve-notes.db`, SQLite URI `file:...?...mode=ro`. Never open writable for inspection.
- Standalone temporary benchmark: `controller/scripts/sleeve-notes-genius-processing.bench.ts` copies DB and disables network; no need to rerun without a performance question.
