# Sleeve Notes — medium-priority implementation, 16 October 2026

The four agreed medium priorities are implemented locally. Changes remain uncommitted; the owner deploys by rebuilding controller and web. No Docker commands, live settings changes or station data edits were performed. Low-priority ideas remain deferred.

## Heard on Air

The interface renders one card and transcript per conversation, followed by each story's wording, source, individual story/delivery ratings and feedback form. Individual airing IDs remain the feedback identity. Independent DJ links remain separate entries. The API paginates native segment IDs rather than individual stories, so a native conversation's eligible stories cannot be split across pages. Story totals and conversation totals remain distinct. Existing legacy transcript reconstruction remains read-only compatibility; historic records without a stored segment ID retain their existing per-use pagination.

## Collection-wide search

Stories defaults to All saved facts. A paged, parameterized database query searches retained enabled stories by wording, topic, category, artist and album/track title, rather than filtering only the last 80 entries in memory. Album stories can be found through their linked recording's artist. Category filtering and total matches apply to the whole searched collection. Recent facts is an explicit filter over the latest 80 saved stories; Browse library remains available. Withdrawn stories remain managed through Review and historical airings.

## Selected subject and return navigation

Station Brain's saved-stories link carries the selected research entity type, ID and display name into its dossier. It also preserves the map focus and selected node for Back to Station Brain. Node selection is retained in the map URL for browser return navigation. Library-only nodes without a research entity open collection search for that named subject rather than fabricating a canonical research identity. Dossiers no longer display the unrelated story list or library explorer beneath their selected context.

## Independent collection pause

`djBehaviour.sleeveNotesCollectionPaused` defaults to false, persists through settings reloads and is mirrored into the web schema. Sleeve Notes Settings has a Background collection control independent of the existing feature master switch. Pausing collection keeps the master enabled, so cached Sparks remain eligible for links and native segments, and editing/feedback remain available.

The pause gates MusicBrainz matching and series workers, Wikipedia fetching, extraction, Genius, connection-library matching and background artist population. The shared quiet gate also yields when collection is paused. Saved jobs and progress remain for resumption; already-running provider requests may finish. Explicit browsing and manual research commands remain operator actions; queued collection work waits for resumption. Research still shares the station's hard token cap and listener/playback gates. Status and Overview distinguish an operator collection pause from a token-budget pause; optional Genius configuration no longer labels all background research as stopped.

## Focused validation

Twelve controller regressions cover collection-wide search beyond 80 stories, pagination and literal query handling, conversation pagination, existing airing/feedback behaviour, pause persistence, worker gating and continued cached-Spark eligibility. Two web tests cover grouping and subject/return links. The admin-query audit and its nine self-tests pass. Controller/web lint and type checking are checked; controller retains its existing warnings. The full test suites were deliberately not run, following the owner's usage-budget request. These checks do not constitute a live browser or broadcast trial.
