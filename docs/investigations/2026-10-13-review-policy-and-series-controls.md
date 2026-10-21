# Selective Review and MusicBrainz list controls — 13 October 2026

Implemented after operator approval, on top of the existing UI, signal-detection and Station Brain changes in this working tree.

## Review admission

Album-source research now retains a `matching-release-only` verdict when it identifies the source album, including an implicit “the album” subject. Named song stories keep their exact track scope. Artist-source stories retain supported album/track restrictions. A story about a different album does not become a fact about the source album.

Missing model verdicts persist the same review cursor and defer the batch for a later paced attempt. No partial batch approval, editorial rejection or Review entry is created.

Generic research must explicitly nominate a `wording` or `context` repair on a bin decision. Local gates additionally require a supported, worthwhile fact and a specific repair explanation. Album identity, thin facts, scope-only explanations, ordinary rejections and routine validation failures do not enter Review. The existing maximum of two entries per article remains a ceiling, never a quota. The current Wikipedia extraction rejection path has not been expanded.

The separate live-DJ policy still requires three distinct, confirmed aired quality rejections; timing passes and failed detection do not count, and existing Genius credit/connection exemptions remain. Existing review rows and expiry policy were not backfilled or changed during this update.

## MusicBrainz Lists

Settings now owns a MusicBrainz Lists card. Supplied defaults are expandable, 1001 editions have group and individual switches, and custom lists appear alongside them. Switches save immediately. The add form uses the shared Zod/form controls and the generated schema mirror.

Paste a MusicBrainz Series URL or MBID → Check list → preview verified name/type/sample → Add list. Supported kinds are recordings and release groups. A Series of another kind receives a clear explanation. Existing MBIDs offer an open/re-enable action. Membership wording is the default; ranking is explicitly selected and uses only numeric positions supplied by MusicBrainz. Custom lists can be removed; supplied defaults can be disabled. Saved caches and history are retained. Configuration remains usable while the master feature is off; Check is an explicit operator metadata request, while automatic collection stays paused.

Admin APIs: GET `/sleeve-notes/series`, POST `/series/check`, POST `/series`, POST `/series/configure`. Check metadata stays in a bounded server-side cache for ten minutes. Add uses its opaque check receipt and ignores client-supplied names/types; arbitrary URLs are never fetched. Duplicate and unsupported additions are rejected server-side.

Migration **45** adds persistent enabled/origin/removed state to the existing Series table. Supplied defaults are seeded with INSERT OR IGNORE, preserving operator choices. Workers, canonical matching, library sweeps and Spark selection all use the active stored catalogue. An in-flight refresh cannot reinstate a disabled/removed list. Configuration changes reconcile cached identities locally and reset the background scan cursor, without provider/library walks. Disabled library links remain cached for re-enable. 1001 edition reconciliation retains one fact from the earliest enabled matching edition. Activity labels disabled and removed caches clearly.

## Validation

- Sleeve Notes controller suite: **138 tests passing**, including production research-worker admission/retry tests, scope/repair tests and list API/matching/persistence tests.
- Web suite: **168 tests passing**; changed-file lint and web typecheck pass.
- Controller typecheck retains the ten pre-existing fixture errors; no new errors.
- Rendered browser fixture checks: defaults off/on, duplicate re-enable, check/add, ranking, grouped editions, removal, and 375px layout without horizontal overflow. Screenshot saved outside the repository under `/home/jaz666/subwave-review-notes/extended-sleeve-notes-ui-20261013/implemented/musicbrainz-lists.png`.
- Regenerated schemas with `npm run gen:schemas`.

All provider responses in tests were mocked. No live database writes/migrations, Docker commands or live provider/model calls were performed. Rebuild controller and web together.
