# Extended Sleeve Notes — fresh-chat handover, 16 October 2026

Read this first. It supersedes the 13 October checkout/PR guidance. Earlier investigation notes remain useful history, but their deployment instructions, test counts and proposed features may be outdated.

## Current checkout and GitHub

- Development and station checkout: `/home/jaz666/Docker/subwave`.
- Active branch: `test-station/sleeve-notes-clean-20261014`. Its date is historical; this is the current branch.
- Latest implementation commit: `56f469ba` — bundled interface fonts. Subsequent documentation-only commits may follow.
- Upstream: `origin` → `https://github.com/perminder-klair/subwave.git`.
- Fork/PR remote: `jaz666` → `https://github.com/Jaz666/subwave.git`.
- [PR #5](https://github.com/Jaz666/subwave/pull/5): **feat: introduce Extended Sleeve Notes and the Station Brain**. Open, draft, head `feat/extended-sleeve-notes`, base `develop`.
- At this handover's read-only check, the PR head was `56f469ba9ac0e6eaadcd1e1c787e446eacb575d6`, mergeable with no conflicts. Its description introduces the complete feature and retains the screenshots.
- Feature base and latest upstream `develop` checked on 16 October: `a078b90cd8d9fe6bd3566847f6a85c5c226066de`, version **1.23.0**.
- Vanilla baseline is available as `test-station/upstream-develop-20261015` at that upstream commit. No need to switch there for ordinary feature work.

The 15 October rebase retained upstream's Track Shortlist, provider failover/sticky routing, native director silence acceptance, phase timings, voice levelling and removal of unused `speakExchange`. The feature branch contains Sleeve Notes, Station Brain and required integrations, rather than the old station-specific picker/debug experiments. The fork's `develop` includes additional onboarding documents; it was preserved, not reset.

Recovery refs: `backup/sleeve-notes-before-session-save-20261015` preserves `fc5341d3`; `backup/sleeve-notes-before-rebase-20261015` preserves the complete session checkpoint `21a8591f`. Independent patch/untracked-file recovery copies and station-local configuration checksums are in `/home/jaz666/subwave-review-notes/housekeeping-20261015/`. These do not constitute a backup of the live databases.

## Operational boundaries and deployment status

The owner runs Docker commands and rebuilds. **Do not run Docker, rebuild/restart containers or control station services on the owner's behalf.** Reversible repository work, appropriate local checks and read-only station inspection have been used throughout. Do not change live settings, research data or queues merely to test a fix. Keep `.env` contents and credentials out of tool output.

The station-specific `docker-compose.discord.yml` is intentionally untracked and locally excluded through `.git/info/exclude`; the owner's `.env` selects it. It must survive checkouts and stay out of the feature PR. Both files matched their saved checksums after the rebase and font fix. State, credentials, databases and audio were preserved.

The owner attempted the rebased Docker build and reported a web font failure. That failure has been fixed and pushed. **There is no owner confirmation in this chat that the rebuild succeeded after the font fix.** Do not confuse the passing local production build with a confirmed station deployment.

For the complete upstream update, the owner needs controller, web **and broadcast**, because upstream changed compose and `liquidsoap/radio.liq`:

```bash
cd /home/jaz666/Docker/subwave
SUBWAVE_BUILD_VERSION=1.23.0 docker compose up -d --build controller web broadcast
```

If controller/broadcast already completed and only the font follow-up remains, only web needs another rebuild. The current feature checkout is already in place. Establish what actually deployed from owner confirmation or read-only evidence before diagnosing apparently missing changes.

## Product decisions to preserve

- Track discovery/picking stays upstream's. The user recently changed the picking process and explicitly deferred story-aware discovery.
- Research uses structured MusicBrainz, Genius and Wikipedia sources. Arbitrary operator-led web research was tried and **removed at the user's request**. Do not revive it from old notes. Artist/album requests into the regular structured research queue remain supported.
- Sparks are optional source-backed material for natural DJ links, not scripts to recite. Mentioning an artist/title alone does not prove factual use. Ranking still allows rotation; a passed first-ranked Spark must not monopolise subsequent offers.
- Review is selective, avoiding an overwhelming queue of routine rejected claims. Operators can send problematic stored facts to Review.
- Heard on Air feedback records separate story and delivery judgements. It supports evaluation and review; **automatic model/pipeline tuning is not implemented**. The shelf is currently an operator/admin surface, not a public listener page.
- A native Sleeve Notes segment is implemented. Treat it as an informal exchange inside an established show, without programme/guest introductions, greetings or sign-offs. The user accepts broad musical commentary from model knowledge, such as stylistic blending/innovation. Specific biography, credits, recording events, dates, quotes and awards still need supplied evidence; earlier-play references require real confirmed plays.
- Programme (Produced Episode) policy was agreed on 16 October: eligible automatic Banter opportunities try Sleeve Notes first and fall back to ordinary Banter when unsuitable. This includes Produced Episodes, while retaining the existing Sleeve Notes segment switches, host selection, cooldown and material requirements. The planned programme feature remains unchanged. Automatic Sleeve Notes also remains available through the ordinary optional segment pool outside Produced Episodes; manual Banter remains an explicit Banter request.

## Current feature surfaces

Admin → Sleeve Notes has Overview, Stories, Heard on Air, Station Brain, Review and Settings. Overview includes On Air/Next Up summaries. Before a link is generated it can show stored/matching/available Spark counts rather than an unconditional “No Story Spark”. The expanded navigation was restored.

Station Brain includes artist/album/track drilldown, researched relationships, artist and album research coverage, structured research queue actions and supported Add to Queue actions. Layer Up retains and targets the parent selection. Current-artist targeting resolves at the artist layer. Key choices persist in browser storage; mobile panels begin collapsed. Neural Link controls include +/- steps of one. Artist rings appear at the label zoom threshold and are thicker.

MusicBrainz Series settings let operators disable supplied lists and add their own. Cached research remains browsable when collection is paused. Explicit research interruptions/budgets are “deferred”, retain billed usage and do not inflate LLM failure rates or DJ Doctor health failures. Genuine provider errors remain failures.

### Native segment behaviour

Settings live under `sleeveNotes.segment`: `enabled` defaults false, `cooldownMinutes` defaults 60 (5–1440), `cohosts` defaults true, and `personaIds` is null for all hosts or an explicit list (empty means none). The individual-name selector matches the Skills editor.

Automatic preparation requires at least two distinct usable retained stories, excludes credits, prioritises narrative material and permits at most one recognition/ranking item. A ranking alone cannot fill the automatic minimum. The segment competes in the ordinary eligible skill pool rather than taking over every slot. Existing station speech placement options still govern playback.

**Run Now** exists in Sleeve Notes Overview → On Air and main Dash → DJ Segments. Both use `POST /sleeve-notes/segment/run`. Manual execution bypasses automatic enablement, DJ assignment and cooldown gates while retaining usable-material, source/scope, withdrawal and reservation checks. One usable fact becomes a short solo observation, even on a guest show. A real on-air library track is required. Requests share an in-flight guard; UI distinguishes submitted, deferred, silent and error outcomes. Dash pads have larger card padding, equal-height rows and columns fitted to actual card width.

Generation includes the full configured Soul (up to 2000 characters), Musical Leanings when configured (up to 500) per participant, and a snapshot of the Show Brief (up to 2000). Language/pronunciation instructions come only from the host and apply to the cast; station house rules appear once. The conversational target is roughly 80–140 words with mostly short, uneven turns, one thread and substantive responses rather than repeated agreement. These are editorial targets, not proof that every model follows them.

The response remains `{reason, air, lines:[{speaker,text}]}`. Use exact persona IDs, have the host open and require every selected participant to contribute. Tone tags belong **inside the quoted text string**. Silent output has no lines. Solo output can have two host blocks within a combined 700-character bound and is combined into one clip; co-hosted output allows up to 12 contributions. Syntax failures and valid JSON/schema failures have distinct diagnostics and preserve the actual cause. Do not classify model-authored text about “auth” or “quota” as provider failures.

Segments can refer to up to two verified connections from earlier in the **station's local calendar day**, across session rolls, with the earlier presenter when recorded. Both tracks must genuinely have aired; absent historic host information stays neutral. No fabricated example names or earlier-play memories should be inserted into prompts.

### Heard on Air conversations

Research DB schema is **53**. Claim uses can carry a segment ID; `sleeve_segment_lines` stores ordered contributions with speaker IDs/names and confirmed airing timestamps. Every contribution gets group metadata, including lines without a separate matched claim. Only live-edge confirmation writes a transcript row. Dropped/unconfirmed speech is not presented as heard; repeated callbacks are idempotent and partial airings stay partial. Feedback remains attached to its original claim use.

For older segments, conservative read-only recovery uses confirmed speech in the current session or relevant archives, requiring exact ledger anchors and unambiguous grouping. It never substitutes model output for an airing or writes reconstructed evidence. Existing Beck history recovered all seven confirmed turns. Ordinary links and unrecoverable old entries keep their original excerpt.

## 16 October follow-up — Sleeve Notes before automatic Banter

The owner agreed that automatic Banter should first offer its existing slot to Sleeve Notes, including during Produced Episodes, then fall back to ordinary Banter when unsuitable. This is implemented locally through the existing segment preparation/publication path and shared backoff/timing state. Existing automatic enablement, host/co-host settings, story minimums, source/reservation checks and ledger cooldowns remain in force. Accepted boundary-deferred speech consumes the slot. Manual Banter remains Banter, and the programme's planned feature beat is unchanged. Sleeve Notes is now a fixed voice kind so its confirmed speech counts for recap and standalone quiet gaps without depending on skill registration.

Validation: all **4,467 controller tests passed**, with no failures/skips; controller lint/type checking passed with existing warnings. The new integration regression exercises a Produced Episode, successful replacement, thin/absent material, disabled switches/host selection, shared cooldown/backoff, silent/unsupported/error responses, rendering refusal and reservation release, boundary placement, manual Banter and the standalone quiet-gap clock. Model and delivery responses are simulated with isolated state; no live editorial quality claim is made.

These follow-up changes are uncommitted in the local checkout at the end of this task, and have not been pushed or deployed. The owner needs to rebuild **controller** to deploy this change; no web or broadcast source changed in this follow-up. No Docker commands or live settings/research/queue changes were performed.

## 16 October follow-up — high-priority appraisal fixes

All five high-priority items are implemented locally: research database backup/restore; non-destructive claim rebuilds; shared hard-cap research gating with durable deferral; stronger local contradiction/direction checks plus whole-segment speech assessment; and multilingual assessment/airing attribution. Read [the implementation note](2026-10-16-sleeve-notes-high-priority-fixes.md) before follow-up work: it records restore concurrency behavior, budget policy, assessment provenance, latency/token cost and factual-verification limits. Medium/low priorities remain unstarted.

Final validation: **4,488 controller tests passed**, no failures/skips; **187 web tests passed**; controller and web lint/type checks passed (existing controller warnings); admin-query audit and all nine self-tests passed; whitespace checks passed. Model/delivery behavior was simulated in isolated state; no live provider/editorial-quality or deployment claim is made.

These changes and the earlier Banter replacement remain **uncommitted, not pushed and not deployed**. This combined follow-up now requires the owner to rebuild **controller and web**; no broadcast source changed. Database schema remains **53**. No Docker commands, live settings/research/queue mutations or service operations were performed.

## Font build fix — previous code change

The owner's Docker web build hit Next 16.4's Google loader at an unchecked font URL extension match. The failing remote response was not captured; the host subsequently received ordinary WOFF2 URLs, so the exact Docker URL was not reproduced.

`web/app/layout.tsx` now uses `next/font/local`. The same 14 font families are bundled as 20 WOFF2 files (about 1.2 MB) under `web/app/fonts/`, preserving full character coverage, theme variable names, static weights and variable ranges. Original licenses are included per family. `sources.json` pins official Google Fonts commit `1d0e46c7933245c8180fe83e47917961c913bbdb` and original/bundled hashes. FontTools converted format only, outside the project. No runtime/install/build conversion dependency or patch to Next was introduced.

Font builds no longer download Google CSS/files. The original OFL notices are preserved verbatim; some upstream license files contain CRLF/trailing whitespace. Do not casually rewrite those notices to satisfy a broad whitespace sweep.

## Validation completed

After rebase: **4,466 controller tests passed**, no failures/skips; **184 web tests passed**; lint/type checks passed in controller, web, app and MCP (controller retains warnings). Production web build, generated schema/theme checks, admin-query audit and its nine self-tests passed. Browser checks covered manual controls, full/partial conversations, feedback and responsive layouts.

After the font-only fix: **187 web tests passed**, including real WOFF2 decoding/glyph coverage, asset hashes, licenses/provenance and layout asset/variable checks. Full web lint/type checking passed. Production build passed with Google font HTTP(S)/fetch requests explicitly rejected through a temporary Node preload guard. Browser checks loaded all 14 real font families, including accented text, and reran Dash controls/layout checks. No need to repeat the controller suite solely for the font change.

All isolated preview servers created for these checks were stopped. Generated `web/next-env.d.ts` changes were not retained. Existing local dependencies are installed in all four packages. Temporary fixtures/logs under `/tmp` are conveniences, not required implementation files.

Live custom-prompt and segment quality has primarily been evaluated against the owner's local llama.cpp model. Mocked provider checks do not establish equivalent live research/editorial quality on every provider. Earlier isolated Guillemots probes passed JSON/cast checks while inventing unsupported details; this remains a grounding limitation. The user liked the Beck and later Depeche Mode conversations and the more informal direction, but there is no claim of universal quality.

## Useful files and next-session starting point

Read root `CLAUDE.md` and the relevant package instructions before edits. Current detailed handovers:

- [High-priority implementation — backup/restore, claim history, research budget and speech assessment](2026-10-16-sleeve-notes-high-priority-fixes.md). Local changes are uncommitted and undeployed; this follow-up needs controller and web rebuilt.
- [Agreed appraisal priorities — high/medium before merge; low as possible post-merge follow-ups](2026-10-16-sleeve-notes-appraisal-priorities.md). High-priority work was subsequently authorised and implemented locally; medium and low items remain unstarted. See the implementation note for validation status and limits.
- [Rebase, integration and font follow-up](2026-10-15-end-of-session-rebase.md).
- [Native segment prompt, validation, context and conversations](2026-10-15-sleeve-notes-segment.md).
- [Heard on Air and feedback](2026-10-14-heard-on-air-and-feedback.md).
- [Station Brain research coverage and album requests](2026-10-14-station-brain-research-coverage.md).
- [Retired operator web research](2026-10-15-retire-operator-web-research.md).

Code entry points: `controller/src/sleeve-notes/{segment,segment-connections,segment-ledger,heard-on-air,legacy-segment-transcripts,link-selection}.ts`, `controller/src/skills/_agent.ts`, `controller/src/broadcast/queue.ts`, and `controller/src/routes/sleeve-notes.ts`. Web counterparts include `NotesPanel`, `NotesLiveSummary`, `SleeveNotesSegmentSettings`, `HeardOnAir`, `DashPanel`, and `connections/`. Font provenance and maintenance instructions are in `web/app/fonts/README.md`.

Useful checks from the repository root:

```bash
npm --prefix controller test -- sleeve-notes
npm --prefix web test
npm --prefix controller run typecheck
npm --prefix web run lint
node web/scripts/audit-admin-query.mjs
node --test web/scripts/audit-admin-query.test.mjs
npm --prefix web run build
```

The user ended development and requested housekeeping/handover. The subsequent 16 October session implemented the agreed Sleeve Notes-first automatic Banter policy (see `docs/internals/broadcast.md`). Start by confirming the current Git state and deployment status, then follow the user's next request. Future choices include evaluating conversations on air and deciding how feedback should eventually tune research/delivery. Keep track discovery deferred and operator web research retired.

## Latest owner decision: remove speech verification

Stored Sparks are trusted. Generated wording is the operator's responsibility through system prompts and Station House Rules. The second `verifySleeveNotesSpeech` call and local factual-wording publication vetoes have been removed for native segments and ordinary Spark links, in every language. Eligibility, cast/output validation, settings/roster rechecks, reservations, cooldowns, generation deadlines and confirmed-air recording remain. Local wording signals are bookkeeping only and may not detect translated or freely paraphrased usage. Historical assessment signals remain readable. See the revised [implementation record](2026-10-16-sleeve-notes-high-priority-fixes.md). Controller rebuild required; owner deploys.

## Medium priorities implemented locally

Conversation grouping and native-conversation pagination, collection-wide paged story search with a Recent filter, subject-preserving Station Brain dossier/return links, and an independent background collection pause are implemented. See [medium-priority implementation and focused validation](2026-10-16-sleeve-notes-medium-priority-fixes.md). New setting: `djBehaviour.sleeveNotesCollectionPaused`, default false; the generated web schema was regenerated. Both controller and web require owner rebuilds. No live station data or services were changed. Low-priority work remains deferred.

## TTS measurement groundwork

Added recent generation and speaking-rate measurements to Stats → Voice / TTS usage, with engine/presenter breakdowns. Successful render records include full spoken-script word count and measured WAV/MP3 audio length; recent rates use total words divided by total time across up to 20 successful renders within the existing 120-call ring. Failed/unmeasured/legacy records do not create invented speaking-rate samples; fallback generation time includes the preceding failed attempts. Counts exclude control tags and use the actual primary/rescue text. No adaptive word targets, duration caps or placement changes were implemented. Measurements reset on restart; controller and web require owner rebuilds. Ten focused measurement/duration regression tests pass; lint/type checking and admin-query checks were run. No live station changes or provider calls were made.

## Adaptive word targets implemented

Immediate Sleeve Notes and Banter now budget total spoken words using recent TTS rates and the current effective track clock, reserving crossfade, writing time, per-contribution overhead and an eight-second buffer. Scripts are checked after writing and complete rendered exchanges are checked before publication against the same play of the track. Automatic Banter fallback is also budgeted. Unknown clocks and next-track deferred speech retain existing placement and lengths. See [calculation, limits and validation](2026-10-16-adaptive-speech-budgets.md). Thirty-eight focused tests pass. Changes remain local/uncommitted and require an owner controller rebuild; no live station changes were made.

## PR publication checkpoint

The owner authorized committing and pushing the accumulated follow-ups to PR #5 (`Jaz666/subwave`, head `feat/extended-sleeve-notes`, base `develop`) without another full-suite run. The local checkout branch remains `test-station/sleeve-notes-clean-20261014`; publication uses an explicit refspec to the existing PR head. The PR description records final trusted-Spark policy, automatic Banter replacement, durability and budget fixes, medium-priority UI improvements, TTS measurements and adaptive immediate-discussion timing. Earlier “local/uncommitted” notes describe their original implementation checkpoints; use the PR head and current git status for publication state. No deployment is authorized by this publication request.

## Overview presentation rework

The owner requested an Overview rework based on the supplied screenshots after browser controls remained unavailable in this chat. The current visual style and operational controls are retained. On Air/Next Up cards stretch consistently, the expected empty DJ-line message is omitted for Next Up, and use labels describe Spark matching rather than factual verification. Research activity is a compact summary with an expandable job list. Source coverage and curated lists are nested under Research details, alongside an explanation of saved-fact versus DJ-story counts.

Recent DJ activity now groups by stored segment ID and shows each exchange once with deduplicated retained excerpts, offered Sparks, individual detection labels and source links. Full conversations and feedback remain in Heard on Air, linked from aired exchanges. The readout supplies segment identity; its latest-ten limit applies to groups rather than individual offers, avoiding incomplete Spark lists. No time/title heuristics merge unrelated links. Disabled-feature Overview reads explicitly request cached data.

Focused validation: three controller regressions (including group completeness beyond ten offers) and two rendered-web/status regressions passed, plus controller/web lint/type checking and the admin-query audit/self-tests. No full suite or live browser inspection was performed. Changes are local and uncommitted; both controller and web require owner rebuilds. No settings, feedback or broadcast actions were triggered.


## Flagged speech review (17 October, local implementation)

Heard on Air now includes every confirmed rendered-and-aired Spark offer, including links whose wording signal did not detect Spark usage. Detection remains informational. One **Flag for review** action replaces the per-Spark rating form and queues one review for the whole link or segment. Existing historical feedback remains readable; existing manual story review tools remain available.

Flags snapshot aired speech, offered Sparks, bounded source passages and station/presenter instructions current at flag time. Those instructions are not represented as the original broadcast prompt. Native segments retain all confirmed contributions; older conversations use the existing conservative archive recovery. Flagging does not withdraw a Spark.

The existing research worker processes one review only when no eligible research job is ready, using the same durable two-minute/adaptive pacing, quiet gates, collection pause and station token allowance. One structured LLM request diagnoses presentation versus Spark problems, offers draft speech, and may propose reusable generation guidance or a source-supported Spark correction. Interrupted or failed calls return to the queue; stale running leases recover after two minutes. No additional scheduler or automatic publication path was introduced.

Review → Flagged speech offers explicit resolve/dismiss, apply-guidance and apply-correction actions. Nothing is applied automatically. Corrections use the existing moderation/source checks and refuse to overwrite a Spark changed since flagging. The latest five approved guidance notes supplement subsequent Spark links, Sleeve Notes segments and reviews; Station House Rules are not rewritten. Approved notes can be removed from Resolved. Disabled-feature browsing remains read-only. Database schema 54 includes durable review jobs, findings and approvals; backups preserve them and restore running jobs as queued.

Focused review, queue, approval, backup/restore, Heard on Air, segment publication and rendered UI checks were used, with controller/web type checking and targeted lint. No full-suite run or live browser inspection. Changes remain local and require both controller and web rebuilds by the owner; no live station data, settings or broadcasts were changed.


### Heard on Air filters

Added artist/track/speech/offered-Spark search, DJ links versus Sleeve Notes segments, and all-time/24-hour/7-day/30-day filters. Filters run over retained history before pagination, keeping every confirmed offer and the transcript of a matching native segment together. Search includes stored guest contributions without Spark attribution and treats wildcard characters literally. Changing or clearing filters resets pagination. Existing cached read-only browsing is retained. Focused controller/API and rendered UI checks cover filtering and segment completeness; no live station changes.

The owner clarified that plain greetings with unused offered Sparks should be hidden by default. Heard on Air now starts with Spark usage → Use detected, with Use not detected and All aired exchanges available. Filtering applies to whole native exchanges: one detected Spark retains the full segment. This is a browsing filter only; airing records, publication policy and review eligibility are unchanged.

Review headings now use the same library-track metadata fallback as Heard on Air when an airing lacks artist/title snapshots; existing queued reviews also gain this display fallback without rewriting their saved evidence. Aired speech, offered Spark and source passage are explicitly labelled, and adapted offered wording is shown rather than silently substituting the canonical claim. Focused review and rendered UI checks cover these fixes.

Flagged-speech review now explicitly evaluates editorial usefulness separately from factual correctness, permits passing over routine identity facts, and avoids padding drafts with biography. Unchanged wording corrections and corrections attached to non-Spark findings are suppressed on generation, cached display and application. Dismissed reviews have an explicit Retry review action, which clears the old result and requeues the same frozen airing through the existing worker/gates using the current review prompt and approved guidance. No review or on-air action was triggered during implementation.


## Overview quick monitoring layout (17 October)

Overview now uses a single responsive two-column grid for On Air, Next Up, Recently Aired and Research Activity, with consistent minimum card heights. Recently Aired shows the last two confirmed exchanges with detected Spark use, matching Heard on Air's default filter and excluding unused-offer greetings. It reuses the confirmed-air endpoint and conservative conversation grouping, retains actual speaker turns, and omits research/source detail. Text is clamped to two lines per exchange; a measured overflow check exposes Read more/Read less and lets the card grow. Research Activity shows the first two available queue entries in existing priority order; Show more/Show less expands the remainder. Existing collection/pause and queue status remain visible.

Removed Recent DJ Activity and its unused view helpers. Research Details, including source coverage and curated lists, now lives under Stories → Research details (`tab=stories&storiesView=details`); old `tab=sources` links reach that view. Facts/browse queries are disabled while viewing details; the cached research readout is loaded there instead.

The top Review tab shows a contrasting count when operator input is needed: ready speech findings plus pending story reviews. Queued/running speech reviews do not raise the badge. Counts refresh with the existing status poll and Sleeve Notes query invalidation; disabled-feature status uses read-only cached counts without migrating or creating a store.

Validation: focused confirmed-air/review and rendered Overview checks, controller/web type checking and targeted lint, admin-query audit, and bounded layout scan. No browser tools were available for live viewport inspection. Changes remain local and uncommitted, require owner controller/web rebuilds, and have not changed live station settings, records or broadcasts.


## Stored-fact flags and independent withdrawal (17 October)

Stories now uses **Flag for review** for saved facts, through the existing background AI review queue and the same quiet/pacing/token gates as aired exchanges. A saved-fact flag snapshots the canonical fact, source passage and flag-time house rules, without inventing an airing or speech. Fact-only results suppress speech drafts and generation-guidance proposals. Flags are deduplicated per fact version; changed wording/evidence/source/category/topic receives a fresh snapshot, and explicitly flagging a closed fact review requeues it. No schema migration or extra worker was needed: fact jobs use the existing nullable airing reference and a `kind: fact` context.

**Withdraw from DJ use** is a separate action, using the existing feedback hold to prevent research retention from re-enabling the fact. Flagging alone never changes availability. Dismiss, resolve and retry do not restore withdrawn facts. **Stories → Withdrawn facts** (`tab=stories&storiesView=withdrawn`) provides search/category filtering, AI flagging, Restore unchanged and Delete fact. The unified Review page shows current fact availability and offers explicit Correct and restore, Restore unchanged and resolve, and Delete fact and resolve. Stale fact findings cannot restore/delete a later edited version. Deletion preserves the existing suppression keys and closes pending fact-only reviews; aired-exchange evidence remains retained. Restoring/correcting a fact also closes associated older pending manual items. Automatic recycle-bin expiry protects both operator-held and fact-flagged records from erasure. Existing recency/cooldown records are unchanged.

Older manual review items and unretained research proposals remain accessible under a collapsed section, with an AI flag action for items linked to a saved fact. The public saved-fact review route now queues AI review without implicit withdrawal. Availability writes require admin access and an enabled feature; disabled browsing remains cached/read-only.

Validation covers fact flag idempotency, absent speech, withdrawn search, explicit restore/correction, dismissal/retry preservation, research refresh protection, deletion suppression, stale findings, route permissions and rendered controls. Controller/web type checks, targeted lint, query audit and bounded layout checks were run. No full suite or live browser inspection; no live station records, settings or broadcasts changed. Controller and web rebuilds are required; changes remain local.


## Earlier review UI retired by owner decision

Removed the Earlier reviews and research proposals section and its manual editor component. Review now opens the shared AI review interface directly. The top Review badge and Overview ready count include only AI findings ready for a decision; older manual pending records no longer raise an operator notification. Historical records and existing background research/rejection handling remain intact. No legacy records were deleted or automatically restored. Controller and web rebuilds required.


## Editable proposed Spark corrections

Ready AI reviews now offer editable wording and supporting passage fields before Apply correction/Correct and restore. Local drafts survive list polling and failed saves; they are cleared after a successful review decision. Resolved or read-only reviews do not expose editing controls. The API accepts optional operator edits bound to the original proposal's claim ID, keeps the existing sentence/source checks and stale-snapshot protections, and rejects attempts to redirect a proposal to another fact. Invalid source excerpts leave the fact and ready review unchanged.

Successful application records the actual saved correction in review context, while retaining the original model proposal and frozen evidence separately. Existing claim history also records the edit. No extra LLM call or schema migration is needed. Focused API and rendered UI checks, type checks, lint, query audit and layout scan passed. Rebuild the controller before the web so edited submissions reach the updated API. No live station changes were made.


## PR refresh publication checkpoint (17 October)

The owner authorized publishing the accumulated UI/audit simplifications, confirmed-air filtering, unified fact/speech AI review, explicit withdrawal/restoration, Review notifications and editable Spark corrections to PR #5 (`Jaz666/subwave`, `feat/extended-sleeve-notes` → `develop`). Publication uses the existing local test-station branch and an explicit push refspec to the PR head. The PR description is refreshed for the final operator workflow and clearly distinguishes earlier full/build/browser checkpoints from the latest focused verification. No full test suite or build is repeated for publication. Station rebuilds/deployment remain the owner's responsibility; no live station actions are part of publication.

## 18 October — Station Brain operator queue actions and full-screen layout

Added exact-track queueing and a mood/flow choice from a selected artist or album. Both enter the existing `/dj/queue-track` operator path, preserving its duplicate/recency exemptions, studio attribution, listener-request-slot exemption and absolute never-play blocklist. Source choices remain inside the selected identity, use shared tempo/key transition ranking against the queue tail, and make no LLM call. Canonical saved identities resolve to confirmed library sources. The artist catalogue sample is bounded to twenty albums with three reads in flight.

Removed the two expanded entity/relationship browse sections in favour of layer-aware queue controls. The artist overview requires a selected artist; albums default to the artist unless an album is selected; album tracks default to the album unless a track is selected. No dropdowns are used. Arrow keys and Enter retain keyboard access to the map. The actual queued track, position and selection explanation are shown. Full-screen maps now grow to the available dialog height with a hideable details overlay inside the map body, rather than a vertically stacked artist card. Plain-English help explains the operator override rules.

Thirty-seven focused controller checks passed, covering source identity, current mood, queue-tail flow, explicit operator duplicate/recency overrides, absolute blocklist refusal, canonical identities and existing operator block queue semantics. Controller/web type checks, targeted lint (no errors), web query-ownership audit and the UI detector passed. No full suite or live-browser playback test was performed; no live tracks were queued and no settings, deployment or broadcasts changed. These changes remain local alongside the preceding UI-audit and Heard on air disclosure edits. Controller and web rebuilds are required.

Full-screen details are hidden on entry and remain hidden when the selected node changes. The operator opens them explicitly with Show details; queue controls remain in the map header.

## 18 October — planned Genius-led Station Brain traversal

Agreed plan: [Genius-led Station Brain research traversal](2026-10-18-genius-station-brain-traversal-plan.md). Decouple Genius research from MusicBrainz identity completion, traverse sample/sample-by links through confidently matched library artists (including their songs not owned locally), retain outside-library boundary evidence, and fill spare capacity with fair library seeding. Keep the current controller and shared three-requests-per-minute ceiling, prioritise broadcast work, and measure bounded processing before rollout. Connected-track picking, a separate research container, increased API frequency and the record-store wishlist remain deferred. This update documents the plan only.

First traversal-plan checkpoint: added the isolated Genius processing replay and recorded its results in the linked plan. Largest stored responses retained in 12.67 ms median / 24.02 ms maximum; graph calculation remains offloaded, while an accumulated patch publication took 78.24 ms synchronously. No production behaviour changed. Next: independent Genius identities and known-ID fetch reuse, followed by bounded traversal scheduling.

Genius fetch-reuse checkpoint: the worker now uses the latest stored Genius song ID to skip repeat searches, validates returned identity, and sends a Subwave User-Agent through the existing budgeted adapter. Six focused checks and controller type checking passed. These are local code changes requiring a controller rebuild; none was performed. Independent identities and traversal are still pending; the MusicBrainz gate has not yet been removed.

Independent encountered-track Genius research is now implemented locally (schema 55). Encounters queue Genius work without waiting for MusicBrainz. Explicit provider-local recording associations preserve source/claim IDs and operator edits when MusicBrainz later establishes its canonical attachment; matching and selection can use the independent evidence. Existing worker gates and request budgets remain. Seventy focused checks passed, plus twelve identity/connection checks after the final selection adjustment; controller type checking and targeted lint passed. No deployment or live API requests. Sample traversal, library seeding and cross-track Genius-ID deduplication remain next.

Sample traversal is now implemented locally (schema 56). The existing worker follows sample/sample-by IDs through unambiguous library artists, retains outside-library boundary evidence and uses durable twenty-relationship expansion turns. Visited IDs prevent cycles, known IDs skip search, and cached shared identities can associate with additional local copies. Encountered and album research stay ahead of the crawl. Offline expansion batches measured 0.28 ms median / 5.91 ms maximum; focused checks/type checking/lint passed. No live requests or rebuild. Fair library seeding and queue visibility remain next; see the traversal plan for details and limitations.

Queue visibility is implemented locally in Overview → Research Activity: rolling Genius usage, waiting job categories, due/deferred/running totals, oldest due-job creation age, and worker/allowance/backoff status. Existing Show more retains individual job details, now with plain-English sample task names. Uses the existing thirty-second poll and shared enforcement calculation; no API calls or live state changes. Focused rendered/backend checks, type checking and lint passed. Both controller and web rebuilds required; no deployment performed.

Fair library seeding is now implemented locally (schema 57). It rotates artists durably and queues one unexamined catalogue track at a time behind encountered/album/traversal work. It uses the same Genius gate/budget and creates no encounters, MusicBrainz jobs or LLM work. Existing encounters and their duplicate catalogue copies are excluded, so historical traversal enrolment remains separate. Offline selection measured 0.91 ms median / 2.68 ms maximum. Focused checks, type checking and lint passed; no live API calls or deployment. Controller rebuild activates seeding; web rebuild adds its plain-English queue task label.

## Research Activity simplification

Overview now separates Controller Research (source collection/connections) from LLM Research (Spark extraction/flagged-speech review). Each section shows one concise state, its queued count and the current/next job; running jobs precede ready jobs, then waiting jobs. Controller research retains only the Genius rolling-minute usage line. Overall totals, category counters, oldest-job age and duplicate explanations are removed from the compact view. Daily Genius usage moves to Stories → Research Details. Show queue lazily renders the section's jobs and exact retry times; the compact status uses a relative retry time. Readout now includes queued/running flagged-speech reviews in the LLM queue without changing scheduling or running any review.

Five rendered Overview checks passed; controller/web type checks, targeted lint and whitespace checks passed. No live browser inspection or full suite. Controller and web rebuilds required; no deployment, setting changes, API calls or broadcasts performed.

## Rendered speech waiting for airtime no longer starves research

Live inspection found zero Genius requests in the rolling minute with 71 due jobs and no provider backoff/token pause; the shared broadcast gate was closed. A rendered station ident had repeatedly waited across tracks for a vocal-safe boundary. `queue.playbackCriticalBusy()` treated that idle pending clip as active work, blocking all Sleeve Notes workers. Removed only the pending-clip condition: active queue draining, picking, intro rendering and session handoffs still block research. Deferred speech remains queued and its normal runway/staleness/delivery rules are unchanged.

Seventeen focused broadcast-gate, research-policy and handoff lifecycle checks passed. Controller type checking and targeted lint were run; no live queue/settings changes or API calls. Controller rebuild required; no deployment performed. The separate worker-wide Genius allowance wait is not changed by this fix.

Evening rate assessment: the preceding hour used 177/180 Genius requests, all successful, while discovering 216 targets. Controller snapshot 0.26% CPU / 489 MiB; no inspected lock/compute-timeout errors. Prepared a six-per-minute trial with ten-second spacing and no daily cap (owner clarified both previous ceilings were self-imposed). Shared backoff and broadcast gates remain; request wait allows search/detail to finish across the ten-second spacing. Fourteen focused backend checks passed. Controller/web rebuilds required; no deployment or live limits changed. See the latest traversal-plan checkpoint for evidence and limitations.

## 19 October — duplicate artist display nodes after Genius traversal

The owner's mobile screenshot exposed per-song provisional artist records as repeated artist nodes (live read-only counts included 31 provisional Parliament rows and 86 for Ice Cube). Unresolved references also used target song IDs as artist display IDs, producing multiple labels for the same external name.

The overview projection now prefers a unique identified artist over same-name provisional rows and folds provisional rows into an unambiguous library display group. Recording edges resolve through that display mapping, retaining and aggregating their original evidence. Unresolved external references group by normalised artist label and are explicitly marked identity-unverified; this is not an artist/recording identity merge. Distinct confirmed namesakes and ambiguous local matches remain separate, and unverified groups do not gain library status or verified counts. No stored artist, recording, claim, match or traversal job is rewritten.

Ten focused overview checks passed, covering aggregation, external reference grouping, ambiguity, distinct canonical namesakes, graph bounds and read-only behaviour. Controller type checking, targeted lint and whitespace checks passed. No live UI inspection or deployment; controller rebuild required to refresh the projection/cache.

### 19 October: Station Brain Stats & Discoveries

- Added secondary Map / Stats & Discoveries tabs using the Stories segmented navigation convention; Map remains the default and fullscreen stays map-only.
- External discoveries has Most connected (distinct library artists), Sample sources, and Sample users rankings, up to 20 each, with collapsed example connections and links to saved stories.
- Counts use enabled, current indexed recording relationships directly from known library artists to names absent from the library. Duplicate source-recording/type/target identities count once; external names are display groups, not verified identities.
- Calculations run only when requested, in the existing read-only graph child process. Results reuse its revision-based cache and in-flight request sharing; Refresh forces recalculation. No polling, provider calls, research jobs or playback changes.
- Read-only measurement on the station snapshot was approximately 0.76 seconds in-process, so production calculation was moved to the existing graph worker.

### 19 October: empty dossiers and duplicate artist search results

- Known artists, recordings and releases without enabled claims now return an empty dossier; Stories displays a plain empty-state message. Unknown identities still return 404. Read-only verification confirmed the reported recording exists with zero saved claims.
- Connection search suppresses repeated provisional artist rows before pagination, prefers identified artists, and retains distinct identified namesakes. The artist choice is grouped once rather than using repeated correlated scans.
- Added focused regression coverage for empty/missing entities and provisional/identified artist search results. No stored identities or research state were modified.

### 19 October: Overview links into Station Brain

- Artist, album and track labels in On Air / Next Up now link into Station Brain using library IDs, preserving typography and adding hover descriptions. Missing IDs leave plain text.
- Artist opens the library artist’s albums; album opens its track layer; track opens that album with the matching local track selected via `brainTrack`.
- Live summary enriches only the current and next tracks from the existing lean local metadata lookup (two added scalar ID columns). No provider calls, queue changes, or research on navigation. Metadata from an outgoing queue item is not borrowed across a playback boundary.

### 19 October: rotating Sleeve Notes on Dash

- Added a conditional Sleeve Notes card between Queue and Booth log. It appears only while Extended Sleeve Notes is enabled, retaining a fixed content height through track changes, empty results and refresh failures.
- Reads saved candidates for the server’s actual on-air track with the existing scope and identity rules; projects only display fields and stored review state. No LLM/provider calls, reservations, cooldown updates, or airtime actions. Refreshes on track changes and every 30 seconds.
- Shuffles a complete cycle before reshuffling, avoiding immediate repeat at cycle boundaries. New items append to the cycle; existing items retain order. Track changes reset the cycle.
- Reuses the skin’s `v3-blink` cursor style for a short text reveal, then waits 15 seconds before rotation. Hover or keyboard focus anywhere in the card completes the reveal and pauses rotation. Reduced motion and Lite mode show full text immediately.
- Only narrative Sparks show the saved-fact review flag; connections and credits have source / Station Brain links but no flag. Long text scrolls within the fixed content area.
- Focused render/shuffle checks and existing live-summary/library-connection checks passed; browser appearance remains to be checked after rebuild. Nothing deployed by the agent.

### 19 October: compact Dash Sleeve Notes follow-up

- Halved the fixed content height, removed footer source/exploration links, and halved reveal speed (three characters every 50ms).
- Header Station Brain link targets the current library artist using local metadata IDs, with a unique cached library-artist lookup as fallback; no network resolution.
- Replaced the left column’s two-row grid with a flex column. The additional card had occupied the expanding second grid row, leaving Booth log in an implicit third row. Booth log now takes the remaining column height directly below Sleeve Notes.
- Focused render checks updated for the smaller height, artist target and removed footer; no deployment performed.

### 19 October: dynamic Dash column alignment

- Dash columns now share two desktop grid rows through CSS subgrid: Queue + Sleeve Notes alongside Manual Voice DJ, followed by Booth log alongside the remaining controls. Manual Voice DJ stretches as the queue grows; Sleeve Notes keeps its current fixed content height.
- Below the existing 640px stacking breakpoint, each column returns to ordinary stacked layout. No JavaScript size observers or height measurements.
- Targeted TypeScript and lint checks passed. Visual confirmation awaits the station rebuild.
