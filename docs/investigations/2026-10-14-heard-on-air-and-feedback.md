# Heard-on-air shelf and operator feedback

The first phase adds an admin **Heard on air** tab to Extended Sleeve Notes. It shows the actual speech, offered Spark, track, airing time and original source, with 20-item pagination. Confirmed airings qualify only when the successful TTS render has a versioned factual signal in the speech itself. Offers, generated-only detections, passes, unconfirmed handoffs, failed renders and unversioned legacy detections are excluded.

Story quality and DJ delivery have separate ratings. Good/routine story ratings and worked/forced/wrong-subject-in-speech delivery ratings are recorded without changing selection, research prompts or the picker. The feedback summary counts one current rating per airing; editing does not add votes.

Unclear wording, factual errors and wrong story scope require a specific note (20–500 characters). Saving that feedback creates or updates one Review item and withdraws the existing claim. Explicit operator Review items do not expire automatically. A database hold prevents background research/list refresh from restoring the withdrawn claim; explicit approval through Review clears the hold. Changing a rating is not approval. The historical airing remains visible even while its story is withdrawn.

New offers snapshot track identities and canonical claim wording independently from the adapted offered wording. Feedback on an already rewritten story stays attached to its historical airing and does not withdraw the replacement. Older airings use the original offered wording conservatively when no canonical snapshot exists.

Migration 46 adds the feedback ledger, a claim hold, the offer snapshots and an airing index. Read-only cached browsing while research is off handles older stores without migrating or creating the live database. Feedback writes require the feature to be enabled and use the existing admin authentication gate.

The shelf is admin-only in this phase. Listener publication, automatic preference/prompt tuning, Station Brain coverage, operator research pointers and a session-connections skill are separate follow-ups.

Validation includes backend tests of eligibility, pagination, feedback edits, Review holds/approval, expiry, adapted wording, historical repairs, and absent/legacy/disabled cache reads. A Playwright fixture at 375px checked the real form controls, separate ratings, required-note validation, source links, pagination, read-only browsing and overflow. All provider responses used in tests were mocked; no live station data was changed and no Docker commands were run. Requires a controller and web rebuild.

Final checks: 153 Sleeve Notes controller tests and 171 web tests passed; both TypeScript checks and changed-file lint passed. The browser fixture passed with no page errors or horizontal overflow. Temporary preview routes and the preview server were removed.
