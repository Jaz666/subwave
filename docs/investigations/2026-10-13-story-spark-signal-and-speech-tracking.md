# Story Spark signal and speech tracking — 13 October 2026

The owner authorized implementation following review of 100 recent offered Sparks (10–13 October). The sample had 51 stored positive signals: 25 false positives, three partial/ambiguous uses, and 23 substantive uses. The frozen review and exact records are retained locally at `/home/jaz666/subwave-review-notes/story-spark-20261013/`.

## Result

- Both the Agentic/Shortlist selection path and the pool enqueue path now retain `generatePickLink`'s `sleeveClaimUseId` and pass it into the existing queue, speech and live-edge bookkeeping. Queue drops and collisions can therefore release the correct reservation.
- `sleeve-notes/claim-signal.ts` replaces the two-overlapping-word rule with a conservative local sentence check: a factual relation must share a detail with the offered claim. Current artist, track, album and quoted title identities cannot establish the fact alone. Predicates inside those identities are excluded too.
- Recognition checks retain the actual named publication/list. Explicit sample and cover wording preserves direction, including passive speech. Writing and production remain separate roles. Short contributor names and complete spoken year forms are supported. Delivery cues, leaked notes and locally negated predicates do not establish use; incidental phrases such as “no less” do not suppress an otherwise valid claim.
- Generated and normalized speech signals are retained separately, with detector version, reason, matching sentence and matched terms. The existing `detection_status` still serves repetition control, updated from actual TTS attempt text.
- Each primary/rescue TTS attempt records its real text and engine before rendering. Successful rendering has its own timestamp. Confirmed airing still requires Liquidsoap's live-edge timestamp; a transcript or a successful render cannot manufacture it.
- The Notes panel shows independent generated/speech claim checks and distinguishes a requested voice from a rendered voice awaiting confirmation.

Migration 43 adds nullable diagnostic/render columns. It preserves existing claims and use history, leaving legacy checks and missing speech/air timestamps unbackfilled. No wipe is required. The live station database was not migrated during development.

## Validation

- Offline replay of the frozen 100 offers removes all 25 audited false positives, retains all 23 substantive uses, and leaves all 49 original negatives plus the three partial/ambiguous cases unflagged.
- Sleeve Notes suite: 118 tests passed; an additional contributor-role regression was subsequently added to the detector suite. The final detector/Regular Spark tests also pass.
- Host-speech ownership and TTS fallback/routing checks: 23 tests passed.
- Web suite: all 168 tests passed. Web typechecking and changed Notes panel ESLint passed.
- Changed controller files passed ESLint with existing `any` warnings. An unused predecessor binding in the touched picker module was renamed to satisfy lint.
- Controller typechecking reports the same 14 stale script/test errors recorded in the rebase handover (llm-pure, speech-label-boundary, speech-year-routing, track-length-lookahead, verified-facts). It reports no controller source errors.
- Two old library-connection fixtures were corrected: the historical schema fixture now includes the claim-use table and expects migration 43; the empty-catalogue retention fixture now creates the previous connection index before checking that it survives failure.
- Whitespace checks pass. No Docker commands or live browser checks were run.

The signal remains a wording heuristic, with English factual relation vocabulary. It can miss unsupported paraphrases and does not verify every assertion or every date in a multi-clause link. These sample results are not a general accuracy guarantee. Older stored positives retain their original cooldown interpretation; legacy evidence has not been rewritten.

## Operator deployment

The owner runs the rebuild locally:

```bash
cd /home/jaz666/Docker/subwave
docker compose up -d --build controller web
```

After deployment, check newer offers for independent speech checks, rendered timestamps and confirmed air stamps, then collect another sample. Existing history deliberately retains unknown stages.

## DJ presentation follow-up

The owner confirmed that current research uses a single claim wording; the prompt must not rely on the old short-wording field. Unused Regular/Occasional/Rare Spark controls and schema entries were removed from both admin locations; the mirrored schema was regenerated. Existing eligibility, reservations and aired-claim cooldowns remain the offering rules.

The DJ now receives a prominent `Story Spark — suggested subject for this link` packet ahead of the detailed rules. It identifies artist/recording/album scope, retains the canonical supported fact, gives whole-link speech space, and asks for one complete factual thought in the opening sentence when the Spark is used. Scope metadata follows the existing matching-release/matching-track restrictions. No short claim is generated or substituted. Source metadata remains backstage, and the packet preserves the existing connection-direction and playback-promise limits.

The prompt's speech budget and the deterministic trimming backstop share `introWordBudget`; pace, vocal floor and ceiling calculations therefore remain aligned. The prompt reminds the writer that spoken years and names consume the whole-link budget. Unknown or on-demand timing does not manufacture a runway. General factual grounding was consolidated, while current-track timing, context restrictions and supported performance cues remain explicit.

For links with an offered Spark, one structured generation returns `speech`, a private `use`/`pass`/`quality-concern` disposition, and a private reason. Only `speech` is returned to queue/TTS. Ordinary links without Sparks retain free-text generation. The shared provider harness owns normal failure recovery; no separate reviewer/rewrite model stage was added, and the text path's default 4,000-token backstop is retained. Private timing passes populate context-pass diagnostics; quality concerns use the existing on-air moderation lifecycle. A clear expressed fact overrides contradictory private pass/quality metadata. Empty spoken responses retain the offer diagnostic and release its reservation.

The matcher now recognises a recording/location relation, so a supported fact such as recording in a converted barn can be measured. Presentation/private-disposition regressions, the 123-test Sleeve Notes suite, and 34 intro-budget/vocal-runway/host-speech/fact-packet tests pass. Changed controller files pass ESLint with existing warnings. The affected stale verified-facts tests were updated; controller typechecking is now blocked by the remaining ten pre-existing script fixture errors in llm-pure, speech-label-boundary, speech-year-routing and track-length-lookahead, with no controller source errors.

Live DJ output still needs observation after the owner's controller rebuild; mocked provider tests establish prompt and return-path contracts rather than live-model editorial quality. The proposed richer connection selection and connected programming remain deferred at the owner's request.
