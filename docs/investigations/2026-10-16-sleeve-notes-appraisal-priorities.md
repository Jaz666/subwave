# Sleeve Notes — appraisal priorities, 16 October 2026

The owner agreed the following prioritisation after discussing an independent blind appraisal of PR #5. This is the agreed follow-up list, not a record of completed fixes. The owner subsequently authorised the high-priority work. Local implementation and its limits are recorded in [High-priority fixes](2026-10-16-sleeve-notes-high-priority-fixes.md); validation/deployment status is in the session handover. The four medium priorities are now implemented locally; low items remain unstarted.

The appraisal examined commit `bc8e0bf` and predates the local Sleeve Notes-before-Banter change. It was code-led: the reviewer did not assess the running interface or listen to generated segments. Follow-up inspection supported the identified backup, research-budget, claim-history and repeated-transcript concerns. An independent local probe reproduced the detector accepting a changed year or city and rejecting an equivalent French sentence.

## High — address before merging

The durability and budget fixes are implemented. The owner subsequently revised the factual-fidelity approach to trust stored Sparks and govern generated wording through prompts and Station House Rules; the speech-verification gate was removed. They remain uncommitted and undeployed; see the [implementation and validation record](2026-10-16-sleeve-notes-high-priority-fixes.md), including the limits of model-based speech assessment.

- **Backup and restore:** include the Sleeve Notes database, covering research, corrections, feedback and aired history.
- **Preserve claim history:** rebuilding research must retain claims referenced by airings or feedback.
- **Research budget:** establish and enforce how research respects the station's token allowance, preserving queued work when paused. Whether research shares the station allowance or has its own remains a policy decision.
- **Factual fidelity (revised):** trust stored Sparks; generated wording is governed by the system prompt and operator Station House Rules. No second model verification gate or local factual-wording veto. Preserve factual-use signals as bookkeeping only.
- **Multilingual acceptance:** valid non-English speech must not fail simply because detection relies on English wording.

## Medium — implemented locally before merging

Implementation and focused validation are recorded in [Medium-priority fixes](2026-10-16-sleeve-notes-medium-priority-fixes.md). Changes remain uncommitted; the owner deploys.

- **Conversation grouping:** show each Heard on Air conversation once, with its stories and individual feedback underneath.
- **Collection-wide search:** search all saved stories, with “recent” available as a filter.
- **Preserve the selected subject:** opening a dossier from Station Brain should retain the artist, album or track, including when returning.
- **Separate collection from on-air use:** allow background research to pause while cached Sparks remain available for links and segments.

## Low — possible follow-ups after merging

These are ideas to consider after the feature has been merged, not requirements for this PR.

- **Private segment preview:** generate, inspect sources, listen, then optionally air or discard. This would be an operator tool, not an approval step for automatic broadcasting.
- **Feedback evaluation tools:** filters and examples by model, prompt version, presenter, category and date. Keep any changes to prompts and selection policy operator-controlled.
- **Upcoming-programme research:** bounded preparation for shows, playlists or selected albums, with progress indication.
- **Map/List presentation:** assess whether a more prominent switch improves navigation, particularly on mobile, before prescribing a redesign.
- **Targeted maintenance:** split modules and consolidate shared types/query keys where concrete maintenance problems justify it. Avoid a broad restructuring based solely on PR size. Separating the bundled-font fix is not a merge requirement; it addressed a real build failure.

## Product decisions to retain

- Broad musical observations may draw on musical knowledge; specific biography, dates, credits, recording events, quotations and awards require supplied evidence.
- Actual airing confirmation and factual fidelity are separate properties. Preserve the confirmed-air ledger and individual story/delivery feedback.
- Automatic Banter offers its existing slot to eligible Sleeve Notes first, including during Produced Episodes, and falls back to Banter when unsuitable. Existing segment settings, cooldowns and material requirements apply; the planned programme feature is unchanged.
- Track discovery remains deferred and arbitrary operator-led web research remains retired.

See the [current session handover](2026-10-16-extended-sleeve-notes-session-handover.md) for checkout, deployment boundaries and completed validation.
