# Sleeve Notes — high-priority implementation, 16 October 2026

This records local implementation of the five [agreed high-priority tasks](2026-10-16-sleeve-notes-appraisal-priorities.md). The changes remain uncommitted and undeployed. Medium and low priorities have not been started.

## Backup and restore

Manual and scheduled station backups now include `sleeve-notes.db` when it exists, using SQLite's online backup API so committed WAL pages are included. Exporting an older disabled cache uses a read-only connection and does not migrate it or create an absent database. Stories, operator corrections, feedback, research progress and confirmed conversation history share this database and round-trip together.

Restore validates and migrates an extracted copy before changing station media or settings. Corrupt, unrelated, future-schema and broken-reference databases are rejected. The prepared file is staged beside the destination and swapped synchronously between closing and reopening the database; stale WAL/SHM files are removed. Existing research jobs and database snapshots hold a shared work lease: an import containing research returns 409 while they are active, and a restore lease prevents new background research starting while other archive contents are applied. Running jobs in a restored snapshot return to queued state, and connection caches are invalidated. Older archives without `sleeve-notes.db` leave current research untouched.

Entry points: `controller/src/sleeve-notes/db.ts`, `controller/src/backup/zip.ts`, `controller/src/routes/backup.ts`; all seven collection/research workers use the database work lease.

## Claim history

Both global and artist-scoped Wikipedia rebuilds disable automatic claims instead of deleting them. Sources, referenced claim IDs, offered wording snapshots, airings, feedback and operator-approved corrections remain available. Re-extraction can re-enable/upsert an automatic fact under the existing uniqueness rules. Historical offered wording remains a snapshot even if current wording changes.

The existing response field `claimsRemoved` is retained for compatibility: it now counts claims removed from automatic offers, not records deleted from the database. No schema migration is required.

## Research budget

Research shares the existing station **hard daily token cap**. A zero cap remains unlimited; the soft threshold does not independently stop research. This is the current policy, rather than a new research-specific allowance. The listener/quiet gate blocks background work at the hard cap, including empty-station maintenance. Every LLM researcher phase re-checks the allowance before transport, so a multi-phase job cannot start another generation after earlier billed work exhausts the cap.

Cap exhaustion is a scheduling deferral, not a provider failure. Jobs/progress are retained for resumption and billed usage is retained. The admin Overview shows “Paused by the station token budget”; readout exposes `researchPausedByBudget` and provider status can report `token-budget`. The allowance resumes through the station's existing daily accounting. Already-running provider requests can still finish and bill; this is not a reservation system guaranteeing a precise token ceiling.

## Trusted Sparks and multilingual speech — revised owner decision

Stored Sparks are trusted factual inputs. The writer's system prompt and operator Station House Rules govern their use and any correction of generated wording. Following false rejections in live trials, the owner explicitly removed the second model verification gate and local factual-wording publication vetoes. The `verifySleeveNotesSpeech` implementation and its tests have been removed; native segments and ordinary links in every language now use one writing call. No factual assessment runs in observation mode either.

Native publication retains output/cast validation, generation deadlines, the writer's own air/stand-down decision, settings/roster rechecks, source eligibility, concurrent reservation protection, cooldowns, delivery handling and confirmed-air bookkeeping. Missing local wording matches and the position of a fact in the opening no longer reject speech. Ordinary links no longer suppress English or translated speech based on factual wording checks or review failures.

Local version-2 wording signals remain solely for locating and recording apparent claim use. They neither verify truth nor veto publication. Translations and freer paraphrases may remain undetected; actual airing is still recorded independently. Historical `speech-review-v1` signals remain readable without creating new model-assessed records. Backup/restore, claim-history preservation and research-budget changes remain in place.

## Validation and deployment

Focused regression checks cover backup/restore (including older caches and active research), referenced claim rebuilds, cap checks on every research phase, queued-work preservation, wrong dates/places/relationship direction, multilingual paraphrases, invalid assessment references, unsupported extra claims, and translated segment/link attribution. Final validation: **4,488 controller tests passed**, with no failures/skips; **187 web tests passed**; controller and web lint/type checking passed (controller retains its existing warnings); the admin-query audit and all nine self-tests passed; `git diff --check` passed. These are isolated regression checks, not confirmation of station deployment or live model quality.

The owner deploys this follow-up by rebuilding **controller and web**. This work has not run Docker or changed live settings, queues, research records or station services. The schema remains version **53**.

## Historical investigation: Cranberries generation/review mismatch (superseded)

Read-only inspection of the owner's live trial in `state/logs/events-2026-10-16.jsonl` found a generation at **10:19:46 UTC** and verification at **10:19:51 UTC**. Generation received both the short formation story and its source extract about the Hogan brothers, Fergal Lawler, childhood in Limerick and English indie/punk influences. Verification received only the short story wording, losing the source support the writer had been allowed to use.

The verifier then rejected an audition anecdote that appeared only among the supplied stories, not in the speech. It also attributed a generic musical reaction to the unused 2009 reunion story and changed straight apostrophes to curly ones in purported verbatim excerpts. The previous implementation processed those excerpts even after `safe=false`, so the excerpt error could replace the model's rejection reason. These are distinct evidence-handoff, model-reasoning and rejection-reporting problems. The generated phrase “they were all kids who grew up together” also needs scope care: the extract names three members, rather than establishing that every member grew up together.

The local correction passes exactly the same bounded source extracts (900 characters per story) to generation and verification, and includes extracts in the local name/number checks. Review instructions explicitly distinguish spoken assertions from unused supplied stories, require subject/scope fidelity, exclude generic reactions as evidence of unrelated story use, and require copied punctuation. A model rejection now returns immediately with its original reason and no uses. Accepted assessments still require literal spoken excerpts; no punctuation-tolerant attribution or bypass has been introduced.

Regression coverage checks source-only named details, writer/reviewer evidence parity and bounds, rejection-reason preservation, and the existing invalid-excerpt, conflicting-detail and multilingual cases. These changes require a **controller rebuild by the owner**. They do not establish that the live model will now assess every segment correctly; no additional live generation was triggered during this investigation.

### Historical follow-up: unsupported vineyard rejection (superseded)

The owner's next live generation at **10:26:25 UTC**, reviewed at **10:26:36 UTC**, confirmed evidence parity was fixed. However, the verifier falsely called “P!nk owns an organic vineyard in Santa Barbara County” contradicted, despite receiving both the purchase story and its source extract. This rejection is a model judgement error, not missing evidence or an actual incompatible detail. Its returned excerpts also identified the vineyard story while its verdict rejected it.

The review instructions now explicitly accept ordinary paraphrases, artist-name spelling variations, reasonable conversational implications (including purchase/ownership), and omitted dates/measurements. Rejection instructions require the actual spoken assertion and a precise unsupported or incompatible detail after considering all supplied support. Safety verdicts still stand down rather than being overridden by lexical matching. A focused regression checks the ownership paraphrase through the local validation path and checks the new prompt contract; this uses a simulated response and does not establish live model reliability. No new live model call or deployment was performed by the agent.

## Removal validation

At the owner's request, validation is limited to the native-segment and Spark-link regression files: **31 tests passed**. Controller lint/type checking and `git diff --check` passed; no full suite or live provider calls. The owner deploys this change with a controller rebuild. No station services or live data were changed by this work.
