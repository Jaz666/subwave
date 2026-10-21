# The Station Brain — Connections visualizer

The Connections page opens at artist scale, showing a constellation from the
cached Navidrome catalogue and encountered Sleeve Notes artists. The
`react-force-graph-2d` canvas replaces the fixed SVG rings. Search, relationship
filters, source evidence and the existing focused graph endpoints remain the
navigation tools around the map.

## Opening overview

`GET /sleeve-notes/connections/overview` is an authenticated local read. With
Extended Sleeve Notes disabled it returns an inactive empty result without
opening the database. It accepts the same relationship filters as the focused
graph. It performs no research, provider requests or model calls.

- Sample and cover facts aggregate between artist nodes, preserving the
  source relationship direction. Each line retains a count and up to five
  track examples with their actual source links and attribution.
- Shared writer and producer identities appear as contributor hubs linked
  to artists with those credits. Names alone do not create shared hubs.
- Library artists without an encounter appear as dim nodes. The artist index
  supplies local identities so their albums can be opened immediately.
- Ambiguous canonical artist names remain separate catalogue display groups.
  External artist labels are scoped to the Genius target recording identity;
  they do not merge into canonical artists by name alone.
- Existing library-match snapshots are used only while the retained claim is
  enabled and its evidence still matches. Unresolved or ambiguous targets
  remain external references. Before the first matching sweep, a unique
  retained Genius recording identity can connect a known target artist.
- The display is bounded to 6,000 entities and 2,400 lines, preferring populated
  library artists, then connected nodes. The underlying read caps 6,000 canonical artists, 6,000 catalogue
  groups and 20,000 claims. A truncated result says that it is a selection.

## Interaction

The track target button opens the currently airing recording, which is resolved
from its local track attachment. The artist target button opens that recording's
matched artist neighbourhood. The live track refreshes every five seconds;
resolution refreshes every thirty seconds so a late MusicBrainz match becomes
available. Refresh map updates the displayed network on demand; there is no
timed overview refresh during exploration. A manual target
action selects a fixed track; it does not follow future track changes.
Targeting the same artist or track again recentres its node while preserving
the current zoom.

A single click selects a node. In the opening artist view it also highlights
all visible connections and nodes reachable from that node, following both
directions through artists and contributor hubs. Hidden relationship types
are excluded from traversal. Hover does not replace a selected pathway
highlight; clicking empty space clears it. A slider limits the number of
reachable links highlighted, with the full reachable count shown as its maximum.
Animated particles are limited to 64 lines to bound browser work. Double-clicking an artist opens its albums;
double-clicking a library album opens its tracks. Layer Up and Layer Down sit
below the zoom/Fit controls. Layer Down opens the selected expandable child;
Layer Up returns through the explored layers, or to the artist overview.
The clicked node stays stationary so the second click can hit it.

The canvas can expand into a full-screen page overlay; Escape closes it. Layout
controls switch between force-directed positioning, connected-group placement,
and a radial focus around the selected node. Spread/Compact adjusts the force
spacing. Re-layout releases pinned positions and seeds the force layout again;
node dragging continues to pin a node until re-layout or another arrangement.
Opening a matched track's neighbourhood includes track-level Genius connections
and the ordinary MusicBrainz backbone. Selecting a line shows source evidence.
Back to artists returns to the cached overview. The map key can hide or
show library artists that Sleeve Notes has not encountered yet; their associated
lines are hidden with them.

The canvas uses small glowing nodes, colours for sample/cover/credit links,
directional arrows and particles on highlighted lines, and a pulse for the
current track or artist. Track count sizes artist nodes; verified library
connection counts affect their brightness. External music uses dim outlines.
Labels become more detailed with zoom or selection. Clicking the colour key
toggles samples (including sampled by), covers (including covered by), shared
writers/producers, or external music. The focused map also offers a key toggle
for artists/albums/lists. Key buttons and individual toolbar filters share the
same visibility state. Filters apply locally without fetching or restarting
the layout, and the key remains usable with every connection hidden.

The renderer loads only in the browser, clones query data before physics can
mutate it, resizes with its container, and pauses when the document is hidden.
Metadata updates reuse its existing physics objects. New nodes settle around
existing positions, while refreshing, filtering and resizing preserve the
camera. Automatic fitting occurs on a new focus only and stands down once the
user pans, zooms or selects; the Fit button remains an explicit camera reset.
Reduced motion removes particles, pulsing and animated camera transitions.
Browse lists preserve keyboard access to every displayed node and line and
remain available on mobile alongside the canvas. No playback actions are added.

## Operator rebuild

```bash
cd /home/jaz666/Docker/subwave
docker compose up -d --build controller web
```

The artist index adds database migration 41; connection change counters add
migration 42. They preserve all claims, sources and research jobs; no wipe is
needed.

## Library population and album drilldown

- On first enabled startup, the Brain fetches Navidrome's artist index, then
  refreshes at most daily. `Populate library artists` lets the operator update
  it immediately and refreshes the view without resetting the camera.
- The opening map reads the persisted artist index and existing catalogue
  cache. It has a 6,000-node display limit; search also finds artists outside
  that displayed selection.
- Library artists that have no retained Sleeve Notes artist identity are dim
  nodes. They create no encounters, claims, provider facts or research jobs.
- Double-clicking an artist loads only its albums using Navidrome's `getArtist`.
  Double-clicking an album loads its tracks using `getAlbum`. Matched tracks can
  then open the ordinary sourced connection neighbourhood.
- Artist-to-album and album-to-track membership is labelled as library
  metadata. It does not imply a sample, cover or credit connection.
- Local identities stay separate when names are ambiguous. A unique name
  match can supply a display drilldown, never verification of a musical fact.
- Complete artist snapshots are published transactionally. Failed, malformed,
  duplicate or unexpectedly empty responses preserve the previous snapshot;
  scanning defers publication. Concurrent populate requests share one fetch.
- Album/track requests forward client cancellation. Artist overview GETs
  perform no provider walk. Existing Genius connection matching is unchanged.
- If no local artist identity is available, the retained artist neighbourhood
  also shows albums first, with tracks available by opening a release.
- Maps above 2,000 nodes start normal-motion physics without blocking warmup
  ticks. Reduced motion uses 32 warmup ticks, and the minimum zoom allows the
  larger constellation to fit on mobile. Offscreen nodes skip custom drawing;
  pointer areas remain independent of the previous display frame so panning
  cannot leave newly visible artists unclickable. Filtering and camera
  preservation stay unchanged.
- Large maps use a steady current-artist marker and pause idle redraw after
  settling. Highlighted pathways still animate during interaction.
- Shared local credit counts are calculated once per contributor, rather
  than scanning their artist group for each endpoint of every credit edge.
- The overview count separately reports populated library artists. At the
  display limit, the message explains that library artists take priority.

## Larger overview measurement

On an isolated copy of the populated station database, the updated overview
returned 6,000 entities, including all 4,646 distinct populated local artist
identities, and 1,709 connections. Five builds including JSON serialization
took 147–229 ms, with a 3.3 MB uncompressed response. These are native-process
measurements against a copied database, rather than live container or browser
timings. The larger renderer has had static checks; browser runtime checks
were not run in this turn.

## Controller performance

- Migration 42 adds separate matching and overview revision counters. Triggers
  watch relevant Genius recording claims/documents, music identities, library
  metadata and derived matches. Wiki claims, provider timestamps and unchanged
  catalogue generation stamps do not invalidate connection matching.
- The library worker reconciles at most once at the end of a catalogue pass,
  or when changed facts arrive during the interval between sweeps. It no longer
  rebuilds on every Wiki update or on an unconditional five-minute timer.
- A separate read-only Node process computes matches and overview snapshots.
  It uses one WAL read transaction per task and makes no provider requests.
  Overview JSON is serialized there, shared across in-flight requests and
  cached in the controller by revision (at most four filter variants).
- Matching computes a differential patch. The controller validates its facts
  revision and atomically publishes changed rows; a stale patch is discarded.
  Unchanged matches are not deleted/reinserted. Publication stays on the main
  process, so a first index with many new rows can still take more time than
  an ordinary incremental update.
- Provider identity reads project just the Genius ID. Contributor candidates
  are resolved once per contributor group, and map grouping uses mutable
  arrays rather than repeatedly copying growing arrays.
- The computation process exits after one minute without work and is stopped
  during controller shutdown. Worker failures leave the last index intact and
  matching backs off for ten minutes. Background calculation uses additional
  process memory while active; moving it out of the event loop does not remove
  its CPU or memory cost.
- Album navigation resolves the displayed track identities in one SQL query.
  Artist population updates only changed names and removes absent IDs rather
  than replacing an unchanged index in full.
The Station Brain uses only the 2D renderer. The optional 3D renderer, toggle
and dedicated dependencies were removed at the operator's request. The
controller performance improvements above remain in place.

### Measurements and checks for this change

On a copied database with all 4,646 populated artists, the background overview
returned 6,000 nodes and about 3.3 MB of JSON. Cold creation including child
startup took 557 ms; subsequent cached reads took 0.02–0.15 ms. A background
match calculation took 230 ms; the main process's 5 ms heartbeat incurred a
maximum additional delay of about 1 ms during that calculation. An unchanged
patch publication took 1.23 ms. Cold overview startup/transfer caused an 18 ms
maximum heartbeat delay. These exclude live container, network and GPU timing.

The production web build, web type check, changed-file ESLint, query audit and
whitespace checks pass. Controller type checking still reports the existing
integration errors outside the changed Brain modules. No unit or browser
runtime tests were run for this change. The updated double-click and layer
controls still need interaction testing in the station owner's browser.

## Validation

For the library population and lazy album layer, the web TypeScript check,
admin query audit and whitespace check pass. Changed files pass ESLint with
the existing `any` warnings in the Subsonic module. The controller TypeScript
check still reports the previously noted integration errors outside these
changes, with no new errors in the Brain modules or routes. Runtime tests
were not run in this turn.

The checks below describe the previous renderer/filter changes.

- 105 Sleeve Notes tests pass, including seven overview cases covering
  aggregation, contributor identity, stale matches, catalogue changes,
  deterministic caps, read-only operation and current-track resolution.
- The original 163 web tests and five additional layout/filter regressions
  pass. The production query
  audit passes, and the changed web/controller files pass ESLint.
- The production web build passes with the browser-only renderer.
- Chromium checks with isolated sample data pass at 1,080px and 375px: initial
  overview, target current track, evidence selection, return to artists,
  catalogue search, artist drilldown, filtering and reduced motion. No page
  errors or horizontal overflow were observed.
- Additional Chromium regressions measured camera scale and centre through
  initial settling after user zoom, key filtering/restoration, metadata and
  topology refreshes, detail-pane resizing, and hiding the selected connection.
  Current-artist targeting, keyboard toggles and unchanged query-cache objects
  also passed; key filtering made no graph requests.
- Full web lint remains blocked by the existing unused
  `PICKER_MIN_TRACK_LENGTH_BOUNDS` import in `settings/LlmSection.tsx`. Full
  controller lint reaches existing TypeScript integration failures outside
  this change. No new overview or renderer type errors were reported.

## Layer Up selection — 13 October

Layer Up restores the node used to enter the child layer and centres/zooms to it:
tracks return to their selected album, and artist albums return to their selected
artist in the overview. Navigation records the overview as a parent too. Directly
opened layers resolve library/researched artist aliases when returning without
history. Restoration waits for the destination map and falls back safely if the
node is no longer visible. Once the force layout settles, the restored node is
recentred unless the user has already moved the camera. Repeated current-target
actions retain their existing zoom behaviour.

Isolated Chromium checks with synthetic catalogue data pass for artist → albums
→ tracks → albums → artists and directly opened artist albums, with normal and
reduced motion. Album/artist selection, zoom and final centring were checked;
no page errors were observed. The temporary preview route/server was removed.

## 13 October: browser Key preferences and mobile panels

The Key now retains connection-type visibility, external music, library artists not encountered, and the neural-link limit in localStorage under `subwave-station-brain-key:*`. Preferences are read after mount and written only on user changes, so reopening a layer cannot overwrite saved choices with defaults. Invalid or inaccessible storage falls back to the existing defaults; controls remain usable. The limit retains the chosen value even when the current artist has fewer available links.

Layout, Map controls and Key start collapsed below the `md` breakpoint and expand through labelled buttons with `aria-expanded` and `aria-controls`. Desktop panels remain expanded via CSS, including when resizing from mobile. Panel expansion itself is temporary, so mobile openings start collapsed each time.

Validation: browser fixture with mocked graph data at 375px confirmed a limit of 6 and all Key switches survive reload, all three mobile panels start collapsed and open correctly, desktop controls remain expanded, malformed stored limits fall back, and there is no horizontal overflow or browser error. Changed-file ESLint and web typecheck passed; five connection tests passed. No live station writes or Docker commands. Requires a web rebuild.
