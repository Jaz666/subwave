# Extended Sleeve Notes quality and researcher model — investigation handover

**Date:** 2 October 2026  
**Status:** Planning record; no model or moderation policy change is authorized by this document.  
**Product decision:** Pause further Extended Sleeve Notes feature expansion until claim quality and the end-user review workload are credible for launch.

## The problem to solve

Extended Sleeve Notes can collect genuinely useful, source-backed story sparks, but the present research pipeline also generates many proposals that the controller rejects. Some are incomplete, unsupported, dull, or wrongly attributed. Others are reasonable claims rejected by a brittle category, wording, or Short-anchor rule. Saving all rejected proposals made those mistakes visible, but presenting tens of thousands of them as individual decisions is not a usable end-user feature.

The completed frozen Wikipedia replay processed **2,468 source revisions**, produced **2,006 accepted proposals** and **27,158 rejected candidates**, with **zero failed model requests**. These are *candidate* counts, not unique facts or a measured accuracy rate. The first additive merge retained 690 new Wikipedia claims and supplied Short wording to one existing claim without disabling existing claims. The historical rejects were subsequently imported into moderation. Ordinary older station rejects were not available for import. See [Wikipedia replay final audit](2026-10-02-wikipedia-replay-final-audit.md) for source and merge detail.

One instructive false rejection was “Dizzee Rascal was ranked by Complex as one of the greatest British rappers of all time.” The cited passage said exactly that, but the recognition-category rule matched `rank`, not `ranked`. That specific rule has been corrected. The example shows why a rejection reason is useful diagnostic data, **not** a trustworthy ground-truth label. Other rejects fail for substantive reasons. A model must not learn that every rejected claim was bad, or that every apparently readable sentence is source-supported.

The owner has found the resulting on-air links substantially better and more grounded than unconstrained DJ invention. The goal is a practical standard of quality with manual correction available, not a promise of perfect factual accuracy. The launch problem is the **volume and quality of decisions imposed on a user**.

## Current path and boundaries

1. Encounter-based collection and provider workers save bounded, attributed source documents. The existing provider pacing and quiet-work policy protect the station and Genius API budget.
2. The research worker splits a Wikipedia source into sections. `LlmResearcher.extract` asks the configured station LLM to choose up to eight candidates per section, each with a category, topic, Full wording, and one to three exact passage IDs. The controller resolves those IDs to stored evidence.
3. The controller validates Full claims, optionally asks the LLM to repair presentation, requests Short semantic anchors, validates them, and runs a further evidence-fidelity review. It deduplicates across the source before retaining claims. Rejected proposals are stored separately for moderation. The researcher contract already allows another implementation or a sidecar; the controller owns retrieval, pacing, evidence validation, and writes.
4. Genius album biographies currently take a different, source-first route: bounded extractive Full proposals are built from saved sentences, while the model mainly compresses them into Short. An acceptable Full can survive a failed Short. This path improved the small album pilot and should be compared separately with Wikipedia extraction.
5. At airtime, cached claims are selected without provider work. Short is offered for a measured vocal runway of 18 seconds or less, Full only above 18 seconds; a measured vocal onset below 2.5 seconds drops speech for safety. A spark that cannot survive the hard airtime trim falls back to an ordinary link. Research quality changes must not weaken those timing and fallback safeguards.

Relevant code: `controller/src/sleeve-notes/research-worker.ts`, `llm-researcher.ts`, `researcher.ts`, `genius-album-extractive.ts`, `moderation.ts`, and `link-selection.ts`. The broad product design is in `docs/internals/enriched-sleeve-notes.md`.

## Working direction: a dedicated moderation specialist

The owner also sought Google's Gemini's view. Its reported assessment was that FunctionGemma is a poor prospect for parsing and breaking down whole Wikipedia articles, but a plausible fit for moderation decisions. Treat that as useful advice, not measured evidence on this station's data. **Prioritize moderation-only evaluation; defer whole-article FunctionGemma extraction.**

Revisit the FunctionGemma work as a new, bounded Sleeve Notes experiment, not as a return to its retired live track-picker role. Track picking required an open-ended editorial commitment under broadcast timing. Here the model would receive one proposal and its exact evidence, then make a fixed, source-aware decision. Background CPU inference could take the review call away from the station's configured LLM if it replaces that call successfully. Article extraction, repair, and Short generation would still use the present LLM, so moderation-only would **not** remove all researcher load from it. Measure the actual resource and queue effects rather than assuming a large saving.

The scopes and priority are:

| Scope | What the specialist receives and returns | Main uncertainty |
| --- | --- | --- |
| **Moderation specialist — investigate first** | One proposed Full/Short pair, article subject, exact evidence, source type, and a fixed review schema. | Can it distinguish useful, repairable claims from unsupported or dull ones without reproducing the existing validator's false rejections? |
| **Whole researcher — deferred** | Bounded source passages and subject; candidate passage IDs, category, topic, Full and Short wording, or no candidate. | Can a small model discover interesting facts and preserve their exact relationships and attribution across Wikipedia prose? |

The working pipeline leaves article reading and proposal writing with the station LLM, then passes proposed claims to FunctionGemma for moderation. The two stages can use different models. Revisit whole-source extraction only if later evidence gives a reason to do so; it is not required to solve the launch blocker. The source-first/extractive route used for Genius albums remains a separate way to improve proposal quality.

For the moderation specialist, keep **source support** separate from **editorial value**. A useful decision record might contain: evidence support (`supported`, `uncertain`, `unsupported`); presentation (`usable`, `repairable`, `broken`); listener interest (`worth_airtime`, `thin`, `off_topic`); a bounded reason code; and suggested disposition (`accept`, `review`, `reject`). A single “would the DJ use it?” answer cannot explain a factual failure. The model should receive the exact evidence passage and source subject, not just the proposed sentence. Do not give it the existing rejection reason during a blind comparison; that label may be wrong.

**Placement matters.** The current `semanticReview` call sees only candidates that already passed controller validation. Replacing that call alone cannot rescue false rejections such as the `ranked` example. The offline pilot must score both retained and rejected proposals. A future live design could use the specialist to prioritize rejected candidates for review and identify faulty rules, as well as to replace or supplement the existing semantic review. The deterministic controller gate remains the final source/shape boundary. When a model and a rule disagree, inspect the example and change the rule or the candidate explicitly. Do not silently let model approval bypass a known failed evidence check. Human approvals and edits continue to have precedence over later replays.

## Training material and feedback

The frozen replay is a valuable **proposal corpus**, not 27,158 negative training examples. It preserves many candidates and source receipts without another 25-hour extraction run. Current retained claims provide positive and difficult-control examples, but acceptance by the existing pipeline is also an imperfect label. The moderation UI now records human edits, approvals, deletions, and history; these decisions can become high-value labels with their source context.

Build a curated dataset from:

- A random, stratified sample of accepted and rejected Wikipedia artist and release-group claims, plus Genius album claims. Include source sections that yielded no proposal when evaluating *extraction recall*; the rejection queue cannot show facts the LLM never proposed.
- Targeted failure cases: incomplete sentences; unresolved pronouns; missing album/artist relationships; reversed sample/cover direction; lost attribution; invented dates, roles or ownership; miscategorised rankings; routine catalogue facts; and Short anchors that drop the useful detail.
- Human-approved, edited, and deleted moderation records with their original candidate and exact source evidence. Treat an edited approval as a distinct corrected target, not as endorsement of the original wording.
- Accepted claims that actually became useful on-air links, while recognizing that selection and airtime depend on timing, DJ choices, and play history rather than factual quality alone.

Annotate at least source support, completeness, relationship/attribution fidelity, category fit, listener value, Full quality, Short fidelity, and final disposition. Preserve `unknown` when evidence is insufficient. Keep source URL/revision and passage IDs attached so labels can be audited. Split training and held-out material by source entity/revision, not by individual near-duplicate candidate, or the evaluation will be misleading. Version datasets, annotation guidance, prompts, models, and thresholds. Do not train automatically on raw clicks or on the current rejection reason alone; curate and inspect feedback before a new model release.

The dated `archive/functiongemma-20260906` Git ref preserves the historical findings. Locate and inventory any surviving training scripts, datasets, checkpoints, and evaluation fixtures before estimating what can actually be reused; the old model and workbench should not be assumed available from this checkout. Reuse the dataset, inference, and evaluation *lessons* selectively. The old final-selection result is not evidence that this different task will fail or succeed. Avoid transplanting the old live tool-routing architecture into research without a demonstrated need.

### First dataset: 1,000 moderation examples

The read-only station snapshot on 2 October contains **3,204 enabled text-backed claims** (3,177 Wikipedia and 27 Genius album claims), **27,153 pending rejections**, and **one human-approved moderation item**. Therefore “live/accepted” and “pending/rejected” describe the current pipeline's outcome, not a human quality verdict. Build the first dataset from **1,000 source-linked proposals**, with a separate reviewed answer for each. Suggested sampling quotas, adjustable if near-duplicates or sparse source groups reduce availability:

| Current outcome and source | Initial quota |
| --- | ---: |
| Live Wikipedia artist claims | 240 |
| Live Wikipedia release-group claims | 140 |
| Live Genius album claims | Up to 20; fill unused places with Wikipedia release-group claims |
| Pending Wikipedia artist rejects | 400 |
| Pending Wikipedia release-group rejects | 200 |
| **Total** | **1,000** |

Within the 600 rejects, deliberately sample across reasons rather than letting the largest groups dominate: about 120 incomplete, 100 unsupported, 80 category, 80 shape, 80 Short failures, 80 editorial/bare-milestone, and 60 other (including semantic review and topic). Cross those quotas with artist/release sources where possible. Sample across categories, source dates, and entities; limit repeated claims from one article and remove exact or near-duplicate facts. Do not sample only the newest queue rows.

Each example needs a stable ID, source document and revision, provider, subject, Full, Short, category, topic, exact evidence, and the original pipeline outcome/reason in **separate metadata**. The model-facing input should omit that outcome/reason during blind evaluation. The reviewed label should separately record: evidence support (`yes/no/unclear`), on-air usefulness (`use/edit/skip`), whether Full or Short changes the fact, and a short reason code. An `edit` label should save the corrected wording; it is not approval of the original. If the displayed passage cannot establish a fact, label it `unclear` or unsupported *from this evidence*, even when the fact may be true elsewhere.

To avoid making the owner manually decide 1,000 items before the first experiment, use a staged labelling plan: manually review an initial calibration set of roughly 100 varied cases; let a stronger, source-constrained teacher propose labels for the training remainder; audit the teacher's disagreements and a random sample; and reserve roughly 200-300 **fully human-reviewed** cases for validation and a sealed final evaluation. Teacher-labelled items are provisional training data, never the accuracy benchmark. If this review workload is still too high, begin with a smaller labelled pilot rather than presenting model-generated labels as ground truth. Keep all examples from one artist/album and source revision on the same side of the train/evaluation split so paraphrases cannot leak answers.

## Evaluation before changing live decisions

1. **Establish a human baseline.** Label a manageable, balanced pilot from the frozen corpus, including clearly good, clearly bad, and borderline proposals. Report random-sample estimates separately from targeted diagnostic cases. Have the owner resolve disputed editorial examples so the model is trained toward the desired station voice.
2. **Run a blind, fixed moderation comparison.** Compare the current rules and semantic-review call with FunctionGemma's judgement on the same accepted and rejected proposals and evidence. Report prompt-only and fine-tuned FunctionGemma separately. Keep a small, separate article-extraction investigation only if moderation results or later source work justify it.
3. **Measure both sides of the error.** Count useful claims wrongly rejected, unsupported claims admitted, changes to attribution/relationships, repairable claims identified, duplicate proposals, category coverage, and Short fidelity. Count human decisions needed per useful retained claim and per typical period of background collection. Report artist, album, and track coverage separately.
4. **Measure resources and operations.** Time per proposal, CPU/RAM load, actual station-LLM review calls avoided, model failures/timeouts, backlog growth, and effects on broadcast responsiveness. Extraction and Short calls remain unless separately changed. Research may be slow; it must never hold a live link, play queue, or provider request hostage.
5. **Shadow first.** Record specialist recommendations beside existing outcomes without approving or deleting anything. Inspect disagreements, especially “model approves / controller rejects” and “model rejects / human approves.” The first live delegation should cover only the class of decisions that passed the held-out comparison; uncertain cases go to a small human queue.
6. **Define launch thresholds from the owner's tolerance.** There is no measured acceptable factual-error rate or review workload yet. Agree on a maximum review burden and minimum supported/useful yield using held-out samples and a live shadow period. Do not equate a high auto-accept rate with success.

## Moderation experience to explore

The current pending queue is an audit store, not an end-user inbox. Preserve the 27,000 historical proposals for analysis while keeping ordinary users focused on a small, prioritized set. Candidate treatments to compare:

- Group near-duplicates and multiple proposals from the same source; show one source with its related claims rather than repeated independent cards.
- Rank by source support, listener value, local-library relevance, and likely repair effort. The ranking must not convert low confidence into automatic approval.
- Hide or archive clear low-value historical rejections from the default view while keeping them searchable and exportable for training/audit. Distinguish “not surfaced” from a human deletion.
- Batch decisions only for genuinely identical or tightly defined cases; retain the ability to open source context, edit Full/Short, and make an individual override.
- Present a concise reason and highlighted evidence for each proposed decision, including uncertainty. Let users mark a model judgement wrong so that correction can be curated into the next training set.
- Make backlog, new arrivals, review time, and proportion aired visible. The default user workflow should be optional quality control, not a requirement to clear every rejection before the station can play.

Historical imports and future live candidates should be distinguishable. Do not turn the full replay backlog into launch-day notifications or imply that every pending proposal needs an owner decision.

## Other quality work that remains relevant

- **Validator false positives:** Audit the large rejection groups by reason. Fix narrowly demonstrated rule defects, such as the `ranked` recognition case, against frozen examples. Avoid blanket relaxation that admits genuinely unsupported claims.
- **Article reading and evidence spans:** Study where one-to-three contiguous passages are insufficient to resolve an identity and where longer spans add irrelevant context. Wikipedia article title alone cannot supply a missing relationship. Compare passage selection and section splitting with source-first extraction.
- **Album and track coverage:** Wikipedia is sparse for many albums; 814 release-group lookups in the replay had no matching article, and 905 of 1,200 fetched release-group sources produced no proposal. Genius album biographies improved with extractive Full candidates. Song-creation stories still lack a dedicated prose path. These are separate coverage questions; do not mask them by loosening factual standards.
- **Prompt versus model effects:** The current research prompt already forbids outside knowledge and asks for exact evidence, yet misses occur. Compare prompt revisions on frozen input before attributing every failure to model size. Do not let a larger model's fluent wording substitute for evidence support.
- **Attribution and provenance:** Preserve source opinion as opinion, source revision, provider, exact receipt, and direction of credits/covers/samples. A Wikipedia quote is provenance, not independent verification of Wikipedia's underlying fact.
- **Full and Short:** Full should remain complete enough for a long intro or future Skills/Banter. Short may be compact, but must retain the subject, relationship, direction, and defining detail. A failed Short should not erase a sound Full when a long-intro use remains possible.
- **Playback outcome:** Continue checking what the DJ selected, what survived vocal-start and duration checks, and what actually aired. This is a product-quality signal, not a replacement for claim review.
- **Collection scope:** Keep slow, encounter-based Genius gathering and source budgets. Do not use a research-model experiment as a reason to bulk crawl the library or broaden the API queue.

## Suggested order of work

1. Freeze feature expansion and preserve the present database, replay files, and moderation history.
2. Define the human label guide and sample a small, source-linked corpus. Identify which rejection reasons are policy mistakes before training.
3. Build an offline, read-only comparison for the **moderation-only** FunctionGemma task. This is the narrowest way to test whether the old training investment helps.
4. Keep whole-source FunctionGemma extraction deferred. Continue source-first and prompt improvements where they independently improve proposal quality; revisit a separate extraction model only if the moderation pilot exposes a clear need and a small held-out trial supports it.
5. Pilot the best approach in shadow mode on new station research; measure quality and review volume over time.
6. Redesign the moderation default view around exceptions and curated feedback, then agree on explicit launch gates. Only after those gates are met should any specialist decision change what enters the live claim store.

## Resume points

- Existing claim audit: `docs/investigations/2026-09-30-sleeve-notes-claim-audit-handover.md`.
- Completed replay, merge, coverage, and Genius album pilot: `docs/investigations/2026-10-02-wikipedia-replay-final-audit.md`.
- Current product architecture and manual moderation: `docs/internals/enriched-sleeve-notes.md`.
- Live research contract and gates: `controller/src/sleeve-notes/researcher.ts`, `llm-researcher.ts`, `research-worker.ts`, and `moderation.ts`.
- Historical FunctionGemma findings: `git show archive/functiongemma-20260906:docs/internals/retired-producer-routing-functiongemma.md`.

No database migration, replay, model training, station rebuild, or live moderation-policy change is part of this handover.
