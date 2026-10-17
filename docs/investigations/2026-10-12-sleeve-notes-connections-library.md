# Story Sparks and library connections — 12 October 2026

The owner agreed to prioritize connections whose targets resolve to local
library tracks, retain unresolved connections for the Graph, and prepare a
shared data model for later DJ skills. Writer and producer connections use
contributor identity, so they can link multiple credited recordings.

## Implemented behavior

- `ConnectionLibraryWorker` periodically reads Navidrome in pages of ten albums
  during the existing Sleeve Notes quiet window, every 30 seconds. A finished
  sweep rests for 15 minutes before beginning another. Failed pages retry after
  ten minutes with their cursor intact. An observed Navidrome scan restarts the
  sweep; incomplete/empty responses never clear the previous catalogue.
- The worker indexes retained Genius samples, sampled-in, cover-of, covered-by,
  writer and producer records against that catalogue. It does not fetch new
  Genius facts, enqueue Wiki research, or call an LLM.
- Track matching uses known Genius identity and recording MBIDs where available,
  then conservative exact title/artist matching. Case, whitespace and apostrophe
  style can vary. Version qualifiers and punctuation remain significant.
  Multiple local copies require a shared stable recording identity; otherwise
  they stay ambiguous and expose no queue candidate.
- Shared writer/producer links require the same Genius contributor ID and the
  same role on another retained, enabled recording credit. Names alone do not
  join people, and an artist performing a song does not establish its writer or
  producer. Each connection exposes at most 24 related library tracks.
- Connections retain direction. For `samples`, the target is the sample source;
  for `sampled_in`, it is the sampling track. For `cover_of`, the target is the
  covered recording; for `covered_by`, it is a cover version. No dates, sampled
  passages, arrangements or artist intent are inferred.
- Spark selection keeps recording → release → artist specificity. Within each
  level, matched library connections receive priority, followed by ranked Wiki
  claims and then other eligible categories. Wiki claims retain section-local
  extraction rank: first-ranked claims from each section precede second-ranked
  claims. Ties use section order, category, relationship direction, least recent
  offer and stable claim ID. Alphabetical topics no longer choose the Spark.
- A Genius `covered_by` Spark needs a matched local target. Its source claim and
  external Graph edge survive while unresolved. Other connection types remain
  eligible at lower priority when unresolved. Existing cooldowns and the DJ's
  ability to omit an offered Spark still apply.
- Automatic shared-credit Sparks can include another locally available recording
  with the same verified credit. Operator wording is preserved.
- The Graph exposes `localTrackId` on resolved targets, including targets not
  previously encountered by Sleeve Notes. Contributor nodes remain people rather
  than playable tracks. `GET /sleeve-notes/connections/library/:recordingId`
  provides the same typed records and target matches for future skills.
- A future queueing skill must still fetch/validate the current local track and
  use the normal queue guards. Catalogue matches describe the last scanned
  library; they do not promise a track has aired or is scheduled.
- Link retries now honor `suppressExtendedSleeveNote`, and a known vocal entry
  below two seconds skips Spark selection. Prompt grounding explicitly preserves
  connection direction and avoids unsupported musical details/playback promises.

## Upgrade and validation

Sleeve Notes migrations 39–40 add rank and the separate derived connection index.
Rank is recovered from existing saved Wiki diagnostics where available; new
extracts persist it directly. Existing claims, sources, edits and research
progress remain intact. No database wipe is needed.

The matcher begins filling its catalogue after the owner rebuilds the controller.
Initial matches appear as pages are processed; subsequent library sweeps update
additions and removals. Credits on previously unresearched tracks can only form
shared links once their actual Genius credit records have been collected.

The owner runs Docker commands locally. The current checkout also contains prior
Sleeve Notes changes awaiting deployment; this work does not rebuild containers.

Validation: all 98 tests selected by `npm test -- sleeve-notes` pass, including
migration backfill, cover eligibility as tracks arrive/disappear, version and
identity ambiguity, shared contributor roles, Graph contributor alignment,
transient catalogue failures, and actual link-prompt suppression/direction.
Controller ESLint reports zero errors. `npm run lint` still fails at TypeScript
checking on existing picker/queue/telemetry signature mismatches (including
`showAt`, `ToolCallSummary.round`, `AttemptResult.contextPeakInput`, and the
quiet-gate call); the new matcher modules introduce no TypeScript errors.
