# Operator-directed web research — archived experiment, removed 15 October 2026

> Operator-led web research has been removed at the owner’s request. The following records the retired experiment and its investigations; it is not current feature documentation. Regular manual artist/album queueing, live track summaries and other independent improvements remain.

## Historical user flow

Choose an identified artist, album or track in Stories, or an identified artist on Station Brain, and select **Suggest research**. Pick recording sessions, songwriting, influences, collaborators/connections, instruments/techniques, artwork/release history, or Other. Other requires a free-text direction; preset areas accept an optional note. Supply a readable public source URL or leave it blank to use the configured Live-Facts Backend. A URL still works without search configuration.

The Overview contains operator request history, outcomes and cumulative assessment counts: searches, readable pages, unreadable sources, recorded LLM calls/reported tokens, stories added and Review nominations. Request details retain checked links and failure explanations. Only the latest 20 rows are rendered; totals cover all requests. Disabled-feature browsing is read-only and does not create or migrate the station cache.

## Research and evidence

Search discovery reuses the existing service; Tavily, Brave, SearXNG and DuckDuckGo now retain original result URLs. Search answers and snippets never enter the extraction document or claim evidence. At most three pages are considered per request. The bounded reader accepts HTML/plain text, extracts readable article text and discards navigation, scripts and forms. It validates public addresses, pins DNS per hop, checks redirects again, refuses credentials/nonstandard ports and limits redirects, bytes and time. This version does not read PDFs, paywalled or JavaScript-only articles.

Each readable source must identify the selected subject and artist. Extraction uses existing evidence IDs, deterministic source/wording checks and the existing airtime review. Claim passages must identify the requested subject or a uniquely attributed catalogue work belonging to the selected artist; song/album requests must name the work in Full too. Catalogue hints never supply factual evidence. Relative freshness claims such as latest/recent are declined. Operator directions remain untrusted intent, never evidence. There is no guarantee that every worthwhile interview will yield a Spark: the first trial deliberately favors clearly attributable passages.

Accepted claims enter the ordinary Spark pool with provider web-operator, displayed as Web research, with their original source and retrieved text. Existing suppression and feedback holds remain authoritative. Identical wording already stored from another source is not added again. Only worthwhile, specifically repairable editorial defects enter Review, capped at two per whole request. Unsupported, routine, unrelated or unreadable material is discarded instead of filling Review. Existing automatic collection never enqueues this provider.

## Scheduling, persistence and usage

Schema 48 adds operator requests and per-request source outcomes. Active duplicate requests share one job; the active queue is capped at 20. Discovery, reading, extraction and airtime review are durable steps. Extracted candidates remain private until the complete review passes. Restart recovery resumes stale running requests; failures back off, while broadcast/budget interruptions defer without admitting partial results.

The existing research tick alternates ordinary/operator work, runs only one worker operation at a time and shares quiet-time gates and durable pacing. Extraction and review are separate paced steps with individual time budgets, so a slow model can resume without repeating extraction. LLM usage is attributed through an async-scoped observer of the shared recorder: successful/failed/fallback legs and their reported tokens are counted, unrelated concurrent DJ calls are excluded, and global billing/budget accounting is unchanged.

## Validation and scope

Automated fixtures cover request validation/authentication, source URLs without search, deduplication, public-address/DNS/redirect guards, extraction cleanup, URL preservation for all four backends, source-only evidence, offerable claims, operator holds, duplicate stories, missing verdicts, selective/bounded Review, interruptions/pacing and disabled read-only access. The 07:50 Alison Moyet wrong-chart-number and 08:40 Elbow invented-interview/latest-performance examples are regressions for the new source-reading path. A real read of Elbow’s official concert announcement successfully retrieved its March 2026 date. No live LLM research or paid search was triggered for validation.

Browser checks exercised the mobile form, Other validation, search without URL, queued history, direct-URL fallback, read-only controls and overflow. Temporary preview routes and their development server were removed. Controller/web type checks, lint and relevant suites were run; no Docker commands or station rebuild were performed.

The existing on-air now-playing-dig/web-search Skills still use their current snippet-based generation path; this change preserves URLs for them but does not silently migrate their broadcast behavior. Applying source-page verification to those Skills, considering regular-pipeline web discovery after operator assessment, and implementing the dedicated Sleeve Notes DJ Segment remain follow-up work.


### Overview and navigation cleanup

The Overview now opens with a compact enabled/paused status, usable-story count and link to pending Review. Settings and refresh tools are reached through Manage research. A visible Research activity panel brings operator requests and grouped background jobs together; operator rows name their current step and show the request note and pages read. Completed requests and usage statistics are collapsed, while failed requests remain visible. Recent Sparks/DJ lines and provider diagnostics remain accessible in collapsed sections. Missing Genius credentials are called out only when the feature and provider are enabled.

Restored the Notes sidebar submenu with Overview, Stories, Heard on air, Station Brain, Review and Settings, using the existing automatic expansion and navigation behavior.

Validation: 175 web tests pass, web TypeScript and changed-file ESLint pass. Browser fixture checked the full admin page at 1440px and 375px: visible operator/background activity, final-review progress, collapsed history/details, expanded submenu, no horizontal overflow or page errors. No station rebuild performed.


### Manual withdrawal of saved facts

Saved fact cards in Recent facts, saved-story context and Browse library now have Send to Review. The authenticated command immediately disables the fact and applies the existing persistent hold, keeping its source/evidence attached to a pending operator Review item. Repeated clicks reuse the item. Operator requests do not expire after 30 days. Research retention cannot enable the held claim; explicit approval clears the hold. Deleting a Review item linked to an existing claim now also marks that claim deleted and preserves the link for audit. Deleted claims cannot be sent back to Review. The Review source filter includes Web research and MusicBrainz, and manual items have a dedicated reason label. Cards refresh collection queries after success and hide the action while collection is disabled.

Validation: 184 Sleeve Notes tests pass, including route authentication, disabled-mode rejection, unaired withdrawal, duplicate submission, evidence preservation, retention/expiry holds, approval and deletion. Browser fixtures checked desktop/mobile submission, collection refresh, success feedback, disabled read-only browsing and no overflow/page errors. No live fact was changed directly; the operator can withdraw the Floyd fact after rebuilding controller and web.


### Operator research rework after the Pink Floyd trial

The trial showed three distinct failures: the Abbey Road page reader selected its first related-news `<article>` card instead of the actual studio-documents report; Production Advice navigation and sidebar promotions entered the research text; and the Nick Mason sample-library claim dropped the later recreation's purpose/uncertainty and implied an achieved result. This update addresses new requests; it does not rewrite or rerun completed station research.

- The bounded reader parses the HTML tree, removes navigation/sidebar/footer/related-news blocks and scores substantive article bodies instead of trusting the first article tag. A real read of the two trial URLs now finds Abbey Road's original Pink Floyd studio documents and the main Production Advice post without its menus/promotions. URL/DNS/redirect/size/time guards remain in place. `htmlparser2`, already a dependency of the text converter, is now declared directly.
- Operator extraction uses short paragraphs as citation units, falling back to sentences for long paragraphs. It still accepts only exact contiguous evidence under 900 characters. This keeps names and following pronouns together without adding facts or loosening material-support thresholds.
- Extraction instructions explicitly preserve original versus later events, attribution, purpose and uncertainty. Later recreations must be framed as later attempts; original sessions, reissues and retrospective accounts must not be conflated. Notes narrow the requested topic and are never evidence.
- Artist-level receipts may identify a known song/album instead of repeating the artist. Only uniquely attributed catalogue work titles are eligible; shared titles are excluded. Long work titles can omit leading “The”, while artist names remain intact. The page must still identify the selected artist, the receipt and Full must identify the work, and exact evidence checks plus mandatory review still apply.
- The final operator review receives the bounded full saved article, requested area/note and exact citations. Surrounding text may expose contradictions or lost context, but may not supply uncited factual details. This adds input tokens to review; the same extraction/review steps and pacing apply, with no extra model stage.
- A deterministic guard catches the trial's specific purpose-to-achievement error even when the model returns ready. A worthwhile repair can enter the existing capped Review queue; it cannot be admitted as a Spark. Correctly framed later recreation stories can still be retained with matching-album scope.
- Checked sources now report candidate-review outcomes and counts in their existing details. Debug outcomes are completed through the researcher's observer instead of leaving operator extractions indefinitely pending.

The request still reads at most three pages, extracts at most four candidates per page and nominates at most two repairable Review items in total. Regular MusicBrainz/Genius/Wikipedia research and on-air web-search Skills retain their existing paths. No migration, web rebuild, live model call or paid search was needed for this rework; rebuild controller and submit a fresh request for the next station trial.

Validation includes regression fixtures for main article versus related-news selection, DIV-based menus/sidebar cleanup, artist-free work receipts, shared-title ambiguity, the misleading Floyd-style result despite model approval, and a corrected matching-album recreation story. Mock provider transports exercise paragraph citations and full-context review through OpenAI-compatible, Ollama and OpenAI paths without external model traffic. Ordinary research is checked to retain its existing review context.

Final verification: 194 Sleeve Notes tests pass. After the final catalogue identity refinements, all 27 operator research/provider-path tests pass again. Controller TypeScript, changed-file ESLint and whitespace checks pass. Real article reads used the public trial pages only; no station jobs or saved claims were changed.


### Live Overview summaries and Brain step buttons

Overview now displays On air and Next up side by side on desktop and stacked on mobile, ahead of Research activity. Each shows the track, artist, album, exact attached Story Spark, source/context links, speech status and an expandable DJ line. Both refresh every five seconds only while Overview is mounted. Empty and unavailable states are explicit; stale data is labelled if a refresh fails.

A new authenticated GET `/sleeve-notes/live-summary` joins the current/next queue item's own `sleeveClaimUseId` to its ledger row and local track ID. It never matches by title or selects/reserves a Spark. On air uses the actual now-playing metadata, withholding the queue item's speech when their IDs disagree at a transition. The rendered speech text takes precedence over the queue draft. A read-only cache handle preserves disabled/absent-cache behavior without migration or station-cache creation. Public feeds remain unchanged. This requires a controller rebuild as well as web.

The Station Brain Neural links highlighted slider now has accessible minus/plus buttons that adjust the displayed setting by exactly one, stop at 1/the available total and use the same persisted browser setting. The initial large default is clamped to the available total before decrementing. The wrapper is no longer a label containing multiple interactive controls. Registered the existing Brain coverage query helper with the admin query audit.

Validation: 198 Sleeve Notes tests pass, including exact reservation identity, repeated-play isolation, rendered text, transition mismatch, missing/wrong reservations, empty states and read-only cache access. All 175 web tests and nine query-audit tests pass; query ownership audit, controller/web types and changed-file lint pass. Full admin browser fixtures exercised live/empty summaries, collapsed speech, desktop/mobile layouts, +/- behavior, limits and saved preferences with no page errors or horizontal overflow. The temporary dev server was stopped; no station rebuild was performed.


### Controller responsiveness incident

After the operator rework, the owner reported controller lockups and intermittent web connectivity. Read-only inspection found the controller using most of one CPU core with a second Pink Floyd request deferred in its source-reading phase. The new work-identity lookup performed a correlated global album-credit exclusion for each catalogue row before narrowing to the selected artist. It ran synchronously before the worker's deadline timer was installed, so it could block HTTP, broadcast timers and cancellation handling.

A bounded read-only replay of that query against the station catalogue hit a 600 ms progress deadline. Its query plan showed repeated scans of all album credits inside a correlated subquery. The replacement groups track and album ownership once, preserving cross-artist and unknown-credit exclusions. On the actual station data (8,916 album-credit rows), three read-only runs returned 16 Pink Floyd work titles in 26–31 ms. Identity-only validation and discovery/page-reading steps now skip catalogue work lookup entirely; extraction/review opt in.

Added an isolated in-memory scale regression with 6,000 albums and 100 artists. A parent-process deadline catches a synchronous child lookup stall, unlike an event-loop timeout inside the blocked process. Shared song/album titles and unknown credits remain excluded. All 28 operator research/provider/performance tests pass, with controller type and changed-file lint checks. No station job was edited or cancelled, and no Docker commands or service restart were performed. A controller rebuild is required to replace the running faulty code; recovery should then be confirmed on the live station.


### Stored Spark availability before link generation

When On air or Next up has no attached Spark, its summary now shows how many stored candidates match that track and how many are available for consideration. The backend reuses the actual candidate loader (identity, album/song scope, source settings, enabled claims, series and connection checks) and the same novelty/cooldown/reservation filter used by selection. The count does not sort/select a winner, reserve a use, spend a rotation turn, invoke research or call an LLM. Counts describe the candidate pool; final DJ use still depends on link timing and the normal generation decisions. Once a real Spark is attached, it replaces the availability summary.

The shared eligibility filter was extracted without changing selection priority/rotation. UI handles singular/plural counts, zero matching stories, all candidates on cooldown/reserved, paused collection and unknown track identity. No background research is implied by an unknown/empty count.

Validation: all 200 Sleeve Notes tests and 175 web tests pass. New integration coverage checks matching album scope, wrong-album exclusion, withdrawn claims, artist cooldowns, a pending/released reservation and available recording-level stories. Availability is exercised through a read-only cache handle with byte-for-byte DB equality and no new use rows. A bounded read-only station-data check returned 18 matching/available candidates in 81 ms cold and 49 ms warm. Browser fixtures cover counts, cooldown/paused/zero states, offered-Spark precedence and desktop/mobile layout; type, lint and admin query ownership checks pass. Controller and web rebuilds are required; the development preview server was stopped and no station settings or facts were changed.

### Operator research corrections: source identity and missing scope titles

Operator extraction now has an optional workIdentity contract: an exact work title, album/track kind, and up to three contiguous source passage IDs identifying that work as the selected artist's. This separate ownership citation can come from another part of the saved article, allowing an artist-led request to investigate an album that is absent from the local research catalogue. It never supplies missing facts in the claim's own citation. The controller reconstructs both citations from passage IDs, checks the ownership citation against the saved article, and requires artist/work names there plus the work title in both Full and Evidence. Mandatory final review receives the ownership citation and full saved article and must reject mere co-mentions, comparisons and another artist's works. Operator notes and search snippets cannot establish ownership.

Approved artist-level work stories can recover an omitted matching title from a single supported catalogue title or the checked source identity. Explicit contradictory titles, multiple matching titles and titles absent from Full/Evidence remain ineligible. Source-identified work stories receive matching album/track scope even if the reviewer returns a broad ready verdict. They cannot become general artist Sparks solely through a broad category choice. Existing original-session/later-recreation, purpose, uncertainty and factual-evidence checks remain in force.

Source details now retain extraction counts, evidence/subject screening counts and the bounded final rejection reasons. Debug outcomes include non-repairable review rejections as well as repair nominations; only useful repairs enter the existing two-item-per-request Review allowance. This adds no research stage, web-search call, migration or catalogue scan. Ordinary research retains its existing output schema and review context.

Validation: 214 Sleeve Notes tests pass, including 34 operator/provider/performance cases. New fixtures cover uncatalogued albums, separate ownership citations, missing scope titles, broad ready verdicts, fabricated/noncontiguous citations, missing factual evidence, another artist's album and ambiguous/contradictory titles. Mock transport tests cover OpenAI-compatible, Ollama and OpenAI. Controller TypeScript, changed-file lint, whitespace and admin-query audit plus its nine tests pass. No live research jobs, saved facts or station services were modified. Rebuild controller and submit a fresh operator request; completed requests are not automatically rerun.

### Follow-up station trials: article reader and discovery fallback

Read-only inspection of the latest Floyd request (`26341a02-0cfc-4f3b-9cfd-a1d916fbcedb`) showed three pages read, five LLM calls and one retained tape-loop story. Abbey Road's one approved candidate was only the album completion date, phrased as “The album”; it still failed exact scope matching. The remaining candidates failed evidence/subject checks. Extraction now puts the instruction to name a supported work in Full and prefer musical/recording observations over bare completion dates early in the operator instructions. The checks were not relaxed to force more retained stories.

The Zeppelin request (`53b0dd67-ca7a-4fc8-b28f-6e87c4390705`) was attached to Led Zeppelin — Physical Graffiti, with Stairway to Heaven as its note. All three sources failed before extraction: Far Out and Uncut reported too little readable text, and The Sun exceeded the 512 KiB HTML limit. Local replays of freshly retrieved public HTML identified destructive layout-class filtering: short-sidebar / has-sidebar / layout--sidebar and a body-level tdc-footer-template class removed the real story. Structural article/page containers now survive those decorations, while actual sidebars, navigation and footer elements are still removed. The transport cap is now 2 MiB; saved readable text remains bounded at 16,000 characters, with existing public-address/redirect checks and deadlines.

Discovery now retains up to six distinct candidate URLs from the existing single search. Unreadable results fall through to later URLs; at most three readable pages proceed under the existing research budget. A supplied source URL remains a single-source request. The form clarifies that a note narrows the selected subject rather than replacing it. A Stairway request should start at the artist or track instead of a different album. No saved request was retargeted or retried automatically.

Replay extraction returned 10,639 / 16,000 / 11,577 readable characters from the three Zeppelin pages, all mentioning Stairway. This checks reader recovery, not whether any particular claim will pass factual/editorial review. All 217 Sleeve Notes tests and 175 web tests pass; 37 operator/provider/performance tests pass after the final prompt change. Both TypeScript checks, changed-file lint, whitespace checks and the admin-query audit plus nine tests pass. Rebuild controller and web, then submit fresh requests; no station services, research jobs or facts were changed during investigation.
