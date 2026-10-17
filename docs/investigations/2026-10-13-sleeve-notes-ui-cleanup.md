# Extended Sleeve Notes UI cleanup — 13 October 2026

Implemented the first-use audit recommendations after operator approval. Existing signal detection, Spark prompt and Station Brain Layer Up changes remain in the same working tree.

## Presentation

- Five primary tabs: Overview, Stories, Station Brain, Review and Settings. Legacy Research and Explore links open the corresponding Stories view; Sources opens Overview with Activity expanded. Existing Connections, Config and Moderation links continue to work.
- Overview explains the benefit, source readiness and collection state. Empty collections get a three-step setup path and a clearly labelled illustrative fact → Spark → DJ-line example.
- Saved facts are distinct from offered Story Sparks. The collection count no longer promises that every fact is currently eligible for speech.
- Stories combines the recent 80-fact search and paginated artist → album → track browser. Search scope is explicit. Fact and Spark cards link to saved context, Station Brain and original sources; evidence is expandable.
- Spark history shows one outcome, offered wording and the DJ line. Generated/speech matching, rendering/air timestamps, reasons and engine are expandable. Only speech matching plus confirmed air produces “Aired · fact detected”. DJ passes and quality concerns remain visible, even if the link itself airs. Old unresolved offers say “Air not confirmed”; only a recent unresolved offer says “Preparing speech”. Matching remains a conservative automatic signal, not semantic verification.
- Review distinguishes withheld, approved, automatically saved and deleted stories, with plain reasons. Source checking, expiry and deletion consequences remain visible. Classification is expandable and the obsolete Short field is gone; review submits an empty legacy short value so the backend derives it from the canonical wording instead of validating stale hidden anchors. Existing legacy storage remains supported.
- Settings owns the master switch, optional Genius setup and collection preferences. Switches save immediately; the token, prompt and limits have explicit save buttons. The untouched default prompt cannot be saved as an accidental customization. Global DJ Behaviour links here instead of duplicating toggles.
- Advanced holds prompt editing, limits and tests; preview lists are fetched only after opening Advanced with the feature enabled. Maintenance holds refresh/disable actions with their existing confirmation previews. Activity holds source/list metadata, detailed queues and performance diagnostics; the duplicate queue table is removed.

## Cached browsing while off

Admin read endpoints accept explicit `cached=1` for Stories and Brain. Status stays inert while disabled. Review reads also use the cache while disabled.

`withCachedRead` scopes synchronous repository reads to an existing read-only SQLite handle. It never creates or migrates the station database. An absent cache receives a temporary in-memory schema so the UI can display consistent empty results. Legacy v42 history returns unknown speech diagnostics rather than invented evidence.

Migration **44** adds `sleeve_brain_layers`, separate from knowledge and research jobs. Explicit enabled artist/album layer reads save their bounded display snapshots. Disabled library layers read only these snapshots; unsaved layers explain that enabling is required. Canonical artist layers can use the equivalent saved local-artist snapshot or fall back to saved research connections. No Navidrome walk or provider request is made by disabled browsing. Populate, prompt tests and refresh actions require the master switch.

Review decisions are intentional operator writes and retain their existing correction and replay-suppression behavior. No live database migration or backfill was run during this work. Rebuild both controller and web together; the web needs the new cached-read API behavior.

## Validation

- `npm test -- sleeve-notes`: **127 passing** including four new cached-browsing tests (absent cache, unchanged v42 bytes/schema, snapshot-only disabled layers, and enabled snapshot persistence without new claims/jobs/encounters). Provider access is guarded in those tests.
- Web suite: **168 passing**. Changed-file ESLint and web typecheck pass.
- Controller typecheck still reports the ten previously known fixture errors in llm-pure, speech-label-boundary, speech-year-routing and track-length-lookahead; no new source or test errors.
- Synthetic browser fixtures: off, empty and populated Overview; recent and full Stories; Settings; Review; disabled Brain. No page errors.
- Browser interaction checks: master/token saves, lazy preview-list reads, disabled default prompt Save, legacy tab navigation, story context links, disabled population, Review approval without Short, and 375px layouts without overflow.
- Browser artifacts: `/home/jaz666/subwave-review-notes/extended-sleeve-notes-ui-20261013/implemented/`. Fixtures are representative examples, not live station configuration or metrics.

No Docker commands or live station provider/model calls were run. Richer Genius connection programming remains deferred as requested.
