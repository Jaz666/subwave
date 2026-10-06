# Sleeve Notes claim audit — handover

**Date:** 2026-09-30  
**Purpose:** Resume the retained Wikipedia claim and `sleeve-notes.research` prompt audit in a fresh chat.

## State and scope

The local Sleeve Notes database was inspected read-only. It currently contains
2,396 enabled Wikipedia claims. A quick directional spot-check reviewed the
two most recently updated claims in each of the seven categories (14 claims in
total). This is useful for finding failure modes, but it is not a random or
representative quality estimate, and the whole retained corpus has not been
manually audited. No implementation or database changes were made for this
audit; this handover is the record of the work.

| Category | Enabled Wikipedia claims |
| --- | ---: |
| Artist stories | 688 |
| Credits | 588 |
| Milestones | 384 |
| Musical connections | 133 |
| Recognition | 181 |
| Release stories | 319 |
| Track stories | 103 |
| **Total** | **2,396** |

## Findings

The research prompt has useful safeguards: source text is treated as untrusted
input; outside knowledge and lyrics are excluded; returning no claims is
explicitly allowed; wording must be source-based; and names, dates, awards and
numbers must be present in the cited passage. It also distinguishes release
stories and recognition from generic artist biography and routine metadata.

The spot-check still found retained claims that meet the lexical checks but
miss the intended editorial bar:

- **Incomplete claim accepted:** a Psychedelic Furs musical connection was
  retained as “In 1986, filmmaker John Hughes used their song,” with the same
  fragment as evidence. The source sentence continues by naming “Pretty in
  Pink” as the song and film. The claim leaves the central object unstated.
- **Catalogue metadata accepted as a story:** “Miriam Makeba is the debut album
  by Miriam Makeba” was retained as a release story. It identifies the album
  but gives no creative or cultural story. The prompt says release facts need
  a concrete story, but this simple identity statement passed validation.
- **Topic labels can be too broad:** examples included an artist's name as the
  topic. The duplicate gate normalizes exact category/topic pairs; it cannot
  recognize equivalent or overly broad topics.

There are also usable examples in the sample, including a specific producer
credit and a recording/studio detail. This small sample cannot establish an
overall pass rate. Exact quotation matching proves that wording overlaps the
stored Wikipedia text; it does not independently verify the article's
accuracy, the reliability of its underlying citation, or whether a listener
would find the claim interesting.

## Likely acceptance gap

In `controller/src/sleeve-notes/researcher.ts`, `completeVerbatimFragment`
tries to extend a wording fragment from its evidence. If the evidence itself
ends before sentence punctuation, the function returns the available
fragment. `everySentenceSupported` checks evidence overlap and named terms,
but does not require the final claim to be a complete thought. That combination
explains how the Psychedelic Furs fragment could pass. The release-metadata
filters also focus on release verbs such as “released” and “came out”; they do
not cover a plain identity statement such as “is the debut album.”

The custom prompt is in
`controller/src/sleeve-notes/llm-researcher.ts` under the
`sleeve-notes.research` call. It already asks for complete, self-contained
sentences or clauses and complete evidence, so the observed cases show that
prompt wording alone is not a sufficient acceptance boundary.

## Recommendations for the next pass

1. **Tighten claim acceptance around completeness.** Do not treat end-of-input
   as end-of-sentence when completing a fragment. Require a claim to state the
   complete supported relationship, including the song/person/place/object
   that makes it meaningful. Reject dangling references such as “their song”
   when the cited evidence does not identify the song.
2. **Reject bare release identity facts.** Keep release stories for supported
   creative or cultural context, collaboration, recording, concept,
   soundtrack, or inspiration. A debut/title/date fact by itself should not
   qualify merely because it is accurate.
3. **Make topics useful for review and deduplication.** Require a concise,
   specific facet (for example, a named producer credit or recording context),
   rather than repeating the artist or release name as the topic. Consider
   near-duplicate review across paraphrased topic labels.
4. **Keep the prompt's existing safety rules.** Make the completeness examples
   explicit, preserve the “no claim is acceptable” instruction, and keep
   high-risk assertions such as sales totals, rankings and superlatives
   qualified to what the source actually reports. A stored Wikipedia quote is
   provenance, not independent fact verification.
5. **Use a two-part evaluation sample.** For the next audit, take a random
   sample within each populated category and a separate targeted sample of
   short/truncated evidence, pronoun-led wording, bare debut/date statements,
   broad topics, and striking numbers or superlatives. Label each item for
   source support, completeness, entity/relationship clarity, category/topic
   fit, listener value, and disposition (keep, revise, or reject). Report the
   random and targeted results separately; targeted cases are diagnostic, not
   a corpus-wide rate.
6. **Re-evaluate before bulk cleanup.** Re-run extraction against frozen source
   revisions after agreeing on the acceptance changes, compare retained and
   rejected examples, and then review any proposed changes to existing claims.
   Do not bulk-disable claims based on this 14-item spot-check.

## Related branch-readiness note

The temporary `generateLinkSparkRepair` retry and fallback are separate from
claim quality: they act after a claim has been selected. The agreed plan is to
keep them during testing, then remove them before upstream PR readiness and
change Regular frequency from mandatory inclusion to **strongly encourage**,
accepting occasional missed sparks. This is also recorded in
`docs/internals/enriched-sleeve-notes.md` under first DJ-link completion checks.

## Resume here

Start with the acceptance gap and prompt recommendations above. Agree on the
review labels and sample size, then evaluate prompt/validator changes against
fixed source revisions and inspect the resulting examples. Preserve the
existing working-tree changes and user database. The 14-item spot-check is not
enough evidence for broad claim cleanup.
