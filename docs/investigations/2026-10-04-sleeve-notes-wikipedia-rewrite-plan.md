# Sleeve Notes Wikipedia rewrite plan — 4 October 2026

**Status: deployed; live artist pilot in progress.** The owner reset the station database and rebuilt/restarted the controller on 4 October. Early live measurements now confirm that the 20-fact chunk prompt completes within the station's time budget when llama.cpp has adequate VRAM. Read the [4 October live handover](2026-10-04-sleeve-notes-wikipedia-live-handover.md) for current measurements and tomorrow's review. This replaces the Wikipedia extraction, ranking, and checking direction recorded in the [3 October live quality handover](2026-10-03-sleeve-notes-live-quality-handover.md). MusicBrainz series, Genius connections and biographies, DJ selection, and operator moderation remain separate paths.

## Decision

Read each encountered artist's Wikipedia article once per source revision and ask the local model a simple DJ question: select useful facts for an introduction to that artist. Apply the same method to eligible album articles after the artist path has been calibrated, with an album-specific subject in the prompt. Keep an article's natural sections and divide only when needed to fit the model's context and the station's time budget. Parse the resulting list in code, remove duplicates, and admit only sufficiently grounded facts to the existing Sleeve Notes claim store.

The number of facts is an **outcome**, not an eight-item target. There is no second article-wide rank call and no ordinary claim-by-claim `sleeveNotesCheck` pass. A long article may require several independent extraction calls. Each call has a bounded input, output, and wall-time allowance; research yields immediately when the station needs the model. The DJ still decides whether a stored claim fits a particular link.

The initial pilot must establish that the simplified path is factually safe. One uncached Hole API result made a material chronology error despite a short, useful-looking list. A pleasant list is therefore insufficient evidence for unattended airtime. If deterministic checks and a small human audit cannot reach the acceptance threshold below, add a **targeted** model check for uncertain items and measure its cost. Do not quietly restore the old full-pipeline cost.

## Why this change

The old section workflow extracted candidates, ranked them and checked them through structured model calls. Pearl Jam used 11 calls and about 258 seconds of model time for one article. It also filled the Recycle Bin with rejected research candidates; the overnight bin count reached 534. The later play-driven experiment reduced work on infrequently played artists but capped output at eight, kept a separate check call, and still split articles into many small pieces. Hole's first full-article index timed out after 75 seconds.

In the owner's llama.cpp Web UI, the short prompt below produced eight usable-looking Hole facts from a roughly 9,277-token article paste. A direct `/v1/chat/completions` trial on the same local model returned a similar list in roughly 18–24 seconds when sent the article as one message. These are exploratory measurements, not a quality or latency guarantee. The Web UI presented a long paste as a `Pasted` attachment inside the user message; using the same wrapper in the API produced the closest formatting match. The API can set `cache_prompt: false` for an independent call. Cached versus uncached runs need not have identical output, so the pilot should record the actual request settings.

The current Wikipedia `explaintext=1` fetch also lost a prose block quote relevant to Hole's name. Use the rendered article at a pinned revision and extract prose deterministically; the source choice matters as much as the prompt. [MediaWiki's revision HTML endpoint](https://www.mediawiki.org/wiki/API:REST_API/Reference/en) provides a revision-specific rendered source. The [page contents API](https://www.mediawiki.org/wiki/API:Get_the_contents_of_a_page) is an alternative if the REST route is unavailable.

## Proposed flow

```text
first artist encounter
  -> MusicBrainz / Wikidata / English Wikipedia identity resolution
  -> fetch and cache revision-pinned rendered article
  -> extract headings, paragraphs and prose block quotes in ordinary code
  -> plan context-bounded chunks and queue them durably

each quiet research slot
  -> one free-text llama.cpp call for one chunk
  -> parse numbered facts and retain raw response
  -> deduplicate and screen against the source
  -> publish grounded claims; quarantine uncertain output internally
  -> save cursor, timing and counts; yield to on-air work

all chunks complete for the revision
  -> mark artist research complete
  -> allow the existing Wikipedia album eligibility rule
```

The first encounter starts the one-time scan. Later quiet slots resume it without requiring another play of that artist. This deliberately changes the current `playsConsumed` rule for Wikipedia extraction: one play earns the article scan, while pacing and fair scheduling limit how much model time that artist can take at once. Frequent plays still make claims more useful, but a long article should not wait for 28 encounters to finish. Give each artist at most one chunk per turn through the ready research queue. Keep the existing quiet gate, interruption behavior and two-minute research start spacing as initial controls; tune them from observed station impact. On cancellation, retry the same chunk without publishing a partial final list or duplicating completed claims. The live link path never waits for research.

Artist completion means all eligible chunks for that source revision have been processed or explicitly marked failed, **not** that a quota of claims passed. Wikipedia album jobs continue to wait for artist completion and the applicable album encounter, then use the same one-call-per-chunk method. Keep the already agreed short Genius album biography exception. Article revision changes create new work deliberately; do not re-fetch or reprocess the same revision on each play. During an artist-only pilot, keep album Wikipedia claims out of the new comparison and count any bin arrivals from the old album path separately; the rewrite is not complete until both Wikipedia paths use the new method.

## Source preparation and chunking

1. Retain the existing MusicBrainz → Wikidata → English Wikipedia identity chain and store the resolved page, revision ID, URL, retrieval time, attribution and content hash. Prefer revision-pinned rendered HTML. Convert it to a versioned, cached prose representation in ordinary code.
2. Keep the introductory paragraphs, headings, paragraphs, and prose block quotes in reading order. Remove navigation, infoboxes, citation markers, reference/bibliography lists, edit controls, tables and catalogue-style appendices. Do not flatten a quoted passage into an unattributed fact. Preserve enough location metadata to find its source paragraph later.
3. Divide at article section boundaries, then paragraph boundaries, then sentence boundaries only when necessary. Include the article title and section path in every chunk. Do not split or silently truncate a factual passage. Overlap only a small amount when a boundary would lose context, and deduplicate overlap results later.
4. Plan by **tokens**, not the current 6,000-character rule. Initial target: at most about 10,000 input tokens after title, wrapper and instructions, subject to the actual 12,288-token context, a roughly 1,000-token output reserve and a safety margin. Read actual token counts from the local server and lower the target if context shifting occurs. Treat these figures as pilot settings, not fixed product limits. The first implementation uses a 41,000-character cap calibrated against the measured Hole paste (about 9,300 prompt tokens); it logs actual usage after each call, so unusually dense chunks can be made smaller.
5. A long article such as [The Beatles](https://en.wikipedia.org/wiki/The_Beatles) must be split. The current article's main narrative is over one 12,288-token context. A section-aware plan should need a few substantial calls rather than the current 28 roughly 6,000-character parts. Inspect the planned section boundaries and token totals before allowing live work.

The rendered source may contain material absent from the current plain extract, but it also contains more markup and non-prose text. Store a `source_format_version` so previously cached plain-text documents are not mistaken for complete rendered sources. Rate-limit Wikipedia requests, use a descriptive user agent and bounded retries, and preserve the exact revision for audit.

## One extraction call per chunk

Use the same chat endpoint and model as the successful direct experiment. For an artist article, send a system message close to the owner's original prompt:

> You are a DJ for a music radio station. Read the supplied Wikipedia text and select the best facts you could use on air to enrich an introductory link to a track by this artist.

The album version substitutes "album" and its artist for the subject while keeping the instruction equally short. The user message contains the article title, section path, and chunk as a `Pasted` style file block. Ask for a numbered list of independent facts, one or two sentences each. Omit a requested fact count. A short output instruction may rule out scripts, prefaces and conclusions, but keep it minimal; the parser must tolerate a bold heading or preface because the model has already produced both formats. Do not ask the model for category, topic, rank, exact excerpts, claim IDs, airtime scripts, or a tool/JSON object in this call.

Use `cache_prompt: false` for the local llama.cpp request during the pilot. Set sampling and repeat penalty **for this call** rather than inheriting the station's global `repeatPenalty: 1.15` unnoticed; record the full effective settings. The Web UI's default server values are a starting comparison, not an assumed optimum. Keep llama.cpp-only options inside the provider adapter so hosted model requests remain valid. Use the existing LLM call telemetry with a distinct Wikipedia extraction kind; do not label this call `sleeveNotesRank`, because it no longer ranks a candidate pool. Log input/output tokens, prompt evaluation and generation time, deadline/abort reason, parsed count, accepted count and uncertain count.

Begin the pilot with a maximum around 500–700 generated tokens and a target near 25–30 seconds per chunk, adjustable after observing the real model. A time cap is a backstop, not a promise: if the call hits it or ends mid-item, keep only complete list items, save the raw response and retry or queue the unfinished chunk under an explicit policy. Avoid automatic rapid retries that compete with picking and TTS. One item is not worth restarting an otherwise successful article scan repeatedly.

## From list item to usable claim

The direct model output needs less editorial machinery but still needs a factual gate. For each complete numbered item:

- Normalize formatting without changing the proposition. Reject empty items, scripts, advice, broad filler and obvious nonfacts in code. Treat optional bold labels as formatting, not as trusted categories.
- Deduplicate exact and near-identical propositions across chunks and prior revisions. Preserve the raw item, source revision and chunk/paragraph locator for audit. Do not derive identity solely from a model-created topic or list position.
- Match factual names, quoted phrases, dates and numbers against the relevant source paragraphs. A failed match is an **uncertain** item, not an automatically approved one. Matching is a screen, not a proof of causal or chronological accuracy; the Hole chronology error is a known counterexample.
- Keep a stable, collision-resistant item fingerprint and a separate readable topic. Map accepted artist facts into the existing claim contract and category/scope rules with deterministic defaults where possible. A generic topic shared by all items must not collide with the current `(entity, category, topic, source)` uniqueness rule. If that rule cannot safely represent the new items, add a narrow schema migration.
- Publish a fact for automatic DJ use only after the pilot has shown that this gate is reliable enough. Until then, keep it in an internal staging state or pilot database. An optional targeted model review can be reserved for items whose support remains ambiguous; measure its rate and cost before enabling it by default.

No source-extraction parse failure, unsupported raw candidate or uncertain fact goes into the **user-facing Recycle Bin**. That bin is for previously accepted claims that operators may want to recover, including the existing three distinct live DJ quality rejections. Preserve operator-approved edits, deletions and tombstones. Keep the Genius writing/production-credit exception: the DJ may use those as fallback sparks, and rejecting one does not recycle it. Do not repopulate the bin from an old rejection archive.

## Durable state and migration

Add a small Wikipedia scan record, keyed by source document and extraction version, with ordered chunks, state/cursor, attempts, timestamps and request metadata. Store raw responses and parsed items in staging with source locators, fingerprints and acceptance states. The existing `sleeve_source_documents` and `sleeve_claims` remain the canonical source and on-air stores. Advance a chunk and insert accepted claims in one transaction so interruption or restart is idempotent. Bound raw-response retention and expose failures as operator diagnostics rather than silent queue growth.

Migrate or retire the Wikipedia-specific fields in `sleeve_research_progress` (`candidate_sections_json`, ranked IDs, check cursor and consumed plays) only after the new worker reads/writes its own state. Existing in-flight jobs must either finish under the old code or be explicitly reset to the new scan version. Preserve already approved and operator-curated claims; do not wipe the live station database as part of normal rollout. A disposable pilot database is appropriate for replay comparisons. If a selective live replay is later chosen, show its affected counts and moderation impact first.

The Overview collection box should distinguish chunks eligible for the next quiet slot, running work, delayed retries, failed work and album jobs waiting on artist completion. It should show article progress such as `2 of 3 chunks` and accepted/uncertain counts, not imply that every queued job needs another artist play. A compact explanation in the UI can say that research continues quietly after an artist's first play.

## Implementation sequence

1. **Baseline and fixtures:** Save the exact article revisions and representative direct API request/response pairs for Hole, St. Vincent, The Beatles, one short artist and an album. Score factual support, airtime usefulness, duplicates, latency and tokens by hand. Record the current pipeline's per-article calls and new Recycle Bin arrivals for comparison.
2. **Source and chunks:** Add rendered revision fetching, deterministic prose extraction and token-aware section planning. Inspect that Hole's quote survives and that The Beatles stays within context with sensible section boundaries.
3. **Simple model path:** Add the free-text call, local llama.cpp request options, tolerant list parser, telemetry and time limits. Keep it behind an explicit pilot switch; no live claim publication yet.
4. **Acceptance and storage:** Add staging, deduplication, source matching, stable identity and transactional promotion. Manually review the pilot output; introduce a narrow ambiguity check only if the measured error rate demands it.
5. **Worker and rollout:** Replace the artist Wikipedia rank/check orchestration, implement fair quiet-slot scheduling and interruption recovery, update the Overview counts, then run a small live artist pilot. Apply the calibrated method to Wikipedia album jobs before retiring the old pipeline. Retire old progress fields and documentation after both paths are established.

## Pilot acceptance and rollback

Before unattended publication, manually review a varied sample of **at least 100 proposed facts** across the fixture artists and several live revisions. Require **zero material unsupported or chronology errors among facts the gate would publish**; record lesser wording and airtime issues separately. This sample cannot prove zero future errors, so keep source links, operator correction, and a quick disable switch. If the threshold fails, tighten the deterministic gate or add measured targeted review before publishing.

For performance, compare total model seconds and calls **per article** with the old flow, not per section. Track p50/p95 chunk time, input/output tokens, aborts, backlog age, quiet-slot usage, DJ pick/TTS delay, and usable facts per article. The target is a clear reduction in calls and model time while research work stays behind live station needs. Recycle Bin arrivals caused solely by extraction should be zero. Watch whether a long article monopolizes the queue; adjust chunk size or round-robin pacing from evidence. A pilot that produces fast but generic or inaccurate facts fails even if its latency is excellent.

Rollback is a switch back to the existing Wikipedia worker while retaining new source and staging records for inspection. Do not auto-import rejected pilot items into the live claim store or bin. Deploying code to the production station still requires the owner-run controller rebuild described in the repository instructions.

## Open decisions for the pilot

- The exact output-token and wall-time limits that give enough facts without delaying station work.
- Whether source matching plus manual calibration is sufficient for automatic airtime, or which narrow class of items needs a second check.
- How many completed, grounded sparks from an article are useful before additional extraction has diminishing value. This should be based on measured yield, not restored as an arbitrary eight-claim quota.
- Whether a revised Wikipedia article should trigger a full scan or only changed sections, once revision refreshes occur often enough to matter.

## 4 October live pilot — 20 ranked facts per chunk

The owner reset the database, rebuilt/restarted the controller, and left the 20-fact prompt active. The first repeated 45-second timeouts were traced to llama.cpp generation falling to 11–15 tokens/s while Fish Audio held about 5.5 GB of the 12 GB GPU. After Fish was stopped/restarted, llama.cpp's allocation rose from about 5.1 GB to 6.1 GB, Fish's observed allocation fell to about 4.4 GB, and generation returned to roughly 41–51 tokens/s. This points to VRAM headroom or model placement changing during llama.cpp's five-second idle unload/reload cycle; the logs do not identify which buffers/layers moved. Fish being enabled is not by itself sufficient to cause the slowdown: after it restarted, Wikipedia extraction continued at normal speed. The generic Subwave quiet gate also now tracks its own in-flight TTS render calls, but it cannot free VRAM held by an idle TTS process.

The 5-fact experiment was briefly edited locally and reverted before it was deployed. The live and source limits remain 20. Recorded results:

| Chunk | Input tokens | Output tokens | Model generation | Wall time | Parsed | Retained by source screen |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| First success | 2,013 | 514 | 51.37 tok/s | 14.1 s | 20 | 16 |
| Larger article part | 9,951 | 607 | 41.12 tok/s | 24.8 s | 20 | 6 |
| After Fish restarted | 3,831 | 59 | 43.47 tok/s | 19.4 s | 20 | 3 |

At 20:18 UTC, the database held 28 completed chunks: 560 parsed sparks, 225 retained claims, mean chunk time 20.2 seconds, median 19.0 seconds, range 11.8–34.6 seconds; 25/28 were under the 30-second target and all were under the 45-second abort limit. This is an initial throughput/yield result, not a factual-quality approval. Human review of retained claims is still needed. The moderation-candidate table was empty after the reset.

The owner plans to let collection continue overnight and review the data tomorrow. Do not lower the 20-fact limit or wipe the database before that review. See the live handover for the job-state snapshot, current live code paths, and next checks.
