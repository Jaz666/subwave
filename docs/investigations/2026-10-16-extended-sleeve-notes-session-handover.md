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
