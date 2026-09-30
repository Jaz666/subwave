# Extended Sleeve Notes — design and delivery plan

## Status

Updated 2026-09-30 for the current `feat/extended-sleeve-notes` implementation.
This document remains the product and architecture contract; the earlier
track-first, Genius-first plan and the collection-only milestone are retired.

The branch now has the canonical artist, recording and release-group store;
quiet-time MusicBrainz, Wikipedia/Wikidata and controlled Genius research;
MusicBrainz Series recognition with recording lists collected first; and
link-time selection that keeps regular Sleeve Notes while offering at most one
eligible Extended Sleeve Note as optional context. Canonical release-group
Wikipedia research supports album-level facts. The Notes admin page exposes
collection state, and `generateLink` recent-call rows show whether a note was
unavailable, available, offered, chosen or held by cooldown. Only the
station-wide Extended Sleeve Notes switch is configurable now; per-list and
user-supplied Series remain future work.

The branch is still under station review. Before it is ready for an upstream
PR, measure whether synchronous link-time lookups or background research can
delay other controller jobs, verify that MusicBrainz release-group Series
membership now retains correctly after the parser/requeue fix, and review the
accuracy of the `chosen` badge against generated wording. DJ banter and
user-defined Skill consumers remain later extensions.

## Product test

Every decision about collection, claim extraction, selection, UI, and prompt
wording answers one question:

> Would you hear a DJ on a BBC Radio station say that?

This does not mean every stored datum must be airtime material. Credits, IDs,
dates, source text, and matching data are valuable evidence and research
inputs. It means that a note *offered to a DJ* must be specific, natural to
say, interesting to a listener, and grounded in its source. Saying nothing is
always a successful selection result.

## Intent and non-negotiable runtime contract

Sleeve Notes is a provenance-aware local music knowledge store. It grows from
music a station actually encounters and gives a DJ zero or one useful editorial
talking point for a link. It is also a research surface for operators and
future Skills; those consumers require their own explicit access policies.

`generateLink`, music selection, TTS, queue draining, recovery, and show
handoffs must never wait for a provider call, source matching, Wikipedia
extraction, or LLM research. A cache miss always uses the current Verified
Facts-only link path.

```text
Background collection                         On-air link path

match + research + retain                      current track + context
  -> provenance-bearing claims                  -> deterministic local lookup
  -> canonical release history                  -> category/scope/novelty gates
  -> relationship graph                         -> zero or one prepared note
  -> local database                             -> normal link writer
```

All background work is low priority, bounded, durable, rate-limited, and
immediately yielding to playback-critical work.

## Vocabulary and editorial taxonomy

- **Verified Facts** are deterministic controller, library, station-history,
  and schedule facts. They remain the factual floor for DJ links.
- **Sleeve Notes** are source-backed editorial claims and music relationships.
  They are attributed and optional, rather than asserted as universal truth.
- **Evidence** is the source material supporting a claim: structured fields,
  an approved bounded excerpt, source revision, URL, provider and retrieval
  time. It is for audit, correction, and grounding; it is not automatically a
  DJ prompt.
- **Creative material** is persona direction and writing style. It cannot
  supply a factual assertion.
- **Lyrics** remain out of scope. Sleeve Notes must never fetch, retain,
  display, quote, prompt with, or derive notes from lyric text.

Every claim has one stable, provider-neutral category plus a finer-grained
topic. Providers fill gaps in this taxonomy; they do not define the DJ-facing
controls.

```text
Artist stories        origin, career turns, scenes, collaborators, legacy
Release stories       an album's creation, recording, concept, collaborators
Track stories         recording/background, cultural moments
Musical connections   covers, samples, interpolations
Recognition           inclusion or rank in a named critics' or editorial list
Milestones            career achievements, chart success, awards, releases
Credits               writers, producers, featured performers
```

For example, an artist's chart achievement and career origin are different
claim topics even when they came from the same source biography. This is what
makes natural rotation possible rather than merely delaying repeated wording.

## Canonical music model

The sidecar database never modifies Navidrome. Its knowledge graph is
canonical and artist-led; a local file is an attachment, not the primary music
identity.

```text
local Navidrome files (many)
             |
             v
canonical recording ---- performed-by ---- artist
             |
             +---- appears-on ---- release / release group
             |
             +---- source-backed relationships ---- external or local recording
```

This prevents a copy from a various-artists compilation from becoming the
recording's editorial identity. Multiple local copies, including compilations,
may attach to one canonical recording.

### Canonical release history

MusicBrainz is the authority for canonical identities and release history.
Store all relevant release appearances, then keep two distinct derived
answers:

- **first official non-compilation appearance** — the answer to “where did
  this first come out?”;
- **canonical home release** — a representative release/release group and a
  recorded selection reason.

A track may have begun as a single, EP, or album track; never force an album
answer. The resolver prefers an exact MusicBrainz recording, official releases,
the recording artist rather than a various-artists credit, non-compilations,
and the earliest release date. Country/date ties remain ties rather than being
presented as a false universal first release. Other appearances remain durable
history.

MusicBrainz's public canonical-data downloads may later improve resolution of
remasters and alternate recordings. They are a periodically refreshed local
input, not a per-track API dependency.

### Required records

The replacement schema must support:

- **entities** — canonical artists, releases/release groups, recordings, and
  external-only graph nodes;
- **local attachments** — many Navidrome track IDs attached to a canonical
  recording, with conservative match state;
- **provider identities** — provider IDs and canonical URLs attached to any
  entity, including MusicBrainz IDs;
- **release appearances** — recording-to-release history, release type/status,
  artist credit, date/country, and canonical-selection reason;
- **source material** — versioned approved text or structured source payload,
  source URL/revision, verification state, retrieval time and content hash;
- **claims** — category, topic, concise presentation wording, source state,
  freshness, correction and suppression state;
- **evidence** — a claim's source material and bounded supporting passage or
  structured fields;
- **relationships** — directed edges such as `cover-of`, `covered-by`,
  `samples`, `sampled-by`, and `interpolates`, each source-scoped;
- **encounters** — accepted queued/played local tracks that seed research;
- **coverage** — provider, entity, and capability state rather than one coarse
  provider/entity status;
- **jobs and provider requests** — durable matching/research jobs, retry
  state, priority, call accounting, and daily budgets; and
- **uses** — supplied/airing history keyed by claim, entity, topic and
  relationship edge.

Conflicting provider claims remain independently attributed. Agreement can be
shown as corroboration but must not silently become a stronger fact.

## Collection: two stages, not a track scanner

Sleeve Notes is gained knowledge, not a whole-library scan. Only an accepted
queued or played track creates an encounter; vetoed proposed picks do not.

### Stage 1 — non-blocking match and admission

An encounter queues, but never awaits, a small match job. It:

1. checks existing local attachments and provider identities;
2. resolves a reliable canonical recording/artist/release identity where
   necessary; and
3. records what coverage is missing and queues one appropriate research task.

For Genius this may be an exact title-and-artist search used only to establish
a provider identity. It is not permission to run a full track-enrichment job.
No raw provider response is retained or put into a prompt.

### Stage 2 — quiet-time research

The worker runs only while no playback-critical work is pending. It yields for
queue-frontier work, link generation, TTS, show handoffs, recovery and drains.
After a match, it selects work in this order:

```text
artist unknown / stale / thin dossier
  -> release history or release context unknown / stale
    -> track research, with relationships given the highest track priority
```

Priority is a database decision, not only a queue number. If an artist gains
adequate coverage while lower-priority work waits, the worker should spend the
next request elsewhere.

Genius has a hard station-wide budget of at most three calls per minute on
average (4,320/day), preserving headroom below its 5,000-call daily limit for
retries and operator actions. Count every request, persist the budget across
restarts, and use one shared provider gate. Each other provider has its own
documented limit, request accounting, backoff and concurrency policy.

## Provider responsibilities

Providers are independently enabled, attributed, budgeted and refreshable.
Adding one must never refetch another or initiate a whole-library scan.

### MusicBrainz — required identity and release-history source

Use the public web service with its descriptive User-Agent and conservative
global rate gate. MusicBrainz provides canonical artist/recording/release
identities, release appearances, types/statuses, dates, artist credits,
aliases, areas, tags/genres and source relationships. It is the release-history
authority, not a source of rich biography prose.

Use its `url-rels` data, where present, to reach a stable Wikidata identity.
That is the preferred bridge to a selected-language Wikipedia article.

#### Default MusicBrainz Series membership

The following curated catalogue is the initial default allowlist. Fetch only
these MusicBrainz Series, in the order shown: the two track lists first, then
the album lists. Album-level membership matches against a recording's
canonical release group; track-level membership matches against its canonical
recording. Never match against the local compilation/reissue file. Preserve
the exact series edition and rank where provided, and cache source-attributed
membership snapshots for prompt-time use without provider calls. Collection
runs through the existing quiet-time gate and shared MusicBrainz request
throttle. The station-wide Extended Sleeve Notes switch controls collection
and prompt-time use; no per-list or custom-list settings are part of this
initial implementation.

| Series | MusicBrainz Series MBID | Match level | Notes from the supplied catalogue |
| --- | --- | --- | --- |
| Pitchfork: The 200 Best Songs of the 2010s | `b8d22d6d-cd22-4eee-add5-2e2249130054` | Track / recording | Ranked |
| Pitchfork: The 100 Best Songs of the 2020s So Far | `2b266ad9-15f9-4cb4-9172-519c5cb0e0cc` | Track / recording | Ranked |
| *1001 Albums You Must Hear Before You Die* (2005 edition) | `4bc2a338-e1d8-4546-8a61-640da8aaf888` | Album / release group | Initial edition |
| *1001 Albums You Must Hear Before You Die* (2008 edition) | `48acb3cb-7daa-42b0-9af7-12a06cad0bbe` | Album / release group | Seven additions to the 2005 original |
| *1001 Albums You Must Hear Before You Die* (2013 edition) | `45dcf1d4-4b03-4afb-a57c-dfe6c03bcab1` | Album / release group | Two additions to the 2005 original |
| *1001 Albums You Must Hear Before You Die* (2021 edition) | `0d8822f8-0da9-4a00-8b97-fa7f8683aae4` | Album / release group | Ten additions to the 2005 original |
| *1001 Albums You Must Hear Before You Die* (2023 edition) | `d624997d-f585-47cb-ab27-e4254c08bf1a` | Album / release group | Three additions to the 2005 original |
| Rolling Stone: 500 Greatest Albums of All Time | `bb3d9d84-75b8-4e67-8ad7-dcc38f764bf3` | Album / release group | Catalogue identifies this as the 2023 revision; each revision is a full 500 entries |
| Pitchfork: The 200 Best Albums of the 1960s | `efbe4c84-5f83-470f-be53-ef4089ef3010` | Album / release group | Ranked |
| Pitchfork: The 200 Best Albums of the 1970s | `f2e5e744-d9a7-41f5-bc95-6ee787122bc1` | Album / release group | Ranked |
| Pitchfork: The 200 Best Albums of the 1980s | `2d7fadbe-6e29-471c-adb9-1d5f78c26b63` | Album / release group | Ranked |
| Pitchfork: The 150 Best Albums of the 1990s | `4d544556-8519-4a20-b854-af57256d9717` | Album / release group | Ranked |
| Rolling Stone: 100 Best Albums of the 2000s | `d9bc7eab-1e3c-468f-836d-5dc231299d65` | Album / release group | Ranked |
| Pitchfork: The 200 Best Albums of the 2010s | `ecae5db8-a33e-45d3-a345-9acab6d5c559` | Album / release group | Ranked |
| Pitchfork: The 100 Best Albums of the 2020s So Far | `e546b910-b88f-4c92-b928-29943a68dca8` | Album / release group | Ranked |
| The Guardian 100 Best Albums Ever | `acf170fe-b358-4140-9e32-93a9c7afa544` | Album / release group | Ranked |

The worker starts with the two track-level Pitchfork song lists, matching
entries to canonical MusicBrainz recordings, then processes album lists
against canonical release groups. The follow-up 1001 Albums editions are
additive and do not repeat the 2005 entries, so combine their memberships
cumulatively while retaining which edition first added each album. An album
absent from a later additions-only edition remains a member of the cumulative
list. Ranked lists may provide a rank only when the Series data stores it
unambiguously. A positive match is a **Recognition** claim: it states
inclusion in a named list, not a universal quality judgement. All such claims
remain optional and novelty-gated.

#### Future Series settings

Adding operator settings is a later addition. When implemented, put per-list
enable/disable controls and custom MusicBrainz Series MBIDs in a dedicated
Settings subpage within Notes. Custom IDs must be resolved and validated in
the background; accept only supported recording- or release-group-level
Series, deduplicate IDs, and cap custom entries. An unknown, non-Series, or
unsupported-entity MBID must produce a visible configuration error and no
unbounded provider work. Custom Series must use the same source attribution,
caching, rank/edition provenance, and Recognition claim rules as the defaults.

### Wikipedia — preferred artist and release-story source

Wikipedia is the preferred source for source-backed artist and album stories.
For artists, resolve the MusicBrainz artist's Wikidata URL relation. For an
album, resolve its canonical MusicBrainz release-group Wikidata URL relation;
request that item's English Wikipedia sitelink and fetch the article revision.
The route is MusicBrainz release group → Wikidata → English Wikipedia. Do not
guess an article from the title or use a loose name search. A missing
MusicBrainz relation, Wikidata item, or English sitelink is a clean no-match.
Store album material and claims under the release-group identity so editions
of the same album share the research and its repetition history. Use the
`release-stories` category for creation, recording, concept and collaboration
facts about the album itself.

Fetch a revision through Wikimedia's public API with a descriptive User-Agent
and contact information, serial/cached requests, `maxlag` for background work,
and normal retry/backoff. Retain the article title, revision ID, URL,
retrieval time and required attribution. Follow the applicable content licence
when storing or republishing source material. Quiet-time collection backfills
known canonical release groups as well as newly matched groups.

Deterministic extraction first separates infobox/profile fields, headings,
linked entities, dates and bounded prose sections. A dedicated research LLM
then extracts a small, diverse set of explicit, BBC-DJ-worthy claims. It must
treat source text as untrusted data, ignore any instructions within it, use no
outside knowledge, and return structured claims with exact supporting text.
The stored claim is accepted only when its evidence is found in the supplied
revision. Do not send an entire long article in one prompt; process bounded
sections, then deduplicate/rank the resulting candidates.

### Last.fm — optional community-context source

Reuse the station's existing Last.fm API key when configured. Last.fm can add
community tags, short artist/track wiki material, popularity/listener signals,
similar artists/tracks and current chart context. Use MusicBrainz IDs where
available for exact requests.

These are community or time-scoped signals. Similarity is not a cover/sample
relationship, and popularity is not a permanent historical achievement. Last.fm
does not own canonical release history or credits. It needs its own conservative
rate/backoff policy because no numeric quota is published.

### Genius — controlled metadata and musical-connections source

Genius is enabled only when both the Sleeve Notes master switch and its
provider switch are on and a server-held token is configured. Its conservative
station-wide ceiling is three requests per minute and 4,320 per day. The
worker retains only exact matched song identity, writer/producer credits, and
the allowlisted cover/sample relationships as structured source data and
claims. It never fetches lyrics, referents, annotations, page HTML or
undocumented endpoints.

The existing Genius spike's search/detail telemetry, exact matching rules,
one-hop expansion limit and local-resolution findings are useful inputs, but
its track-first claim model is superseded.

### Future providers

Add a provider only to fill a demonstrated taxonomy gap. Each requires a
documented endpoint/field contract, attribution and content-use policy,
matching rules, quota/backoff policy, claim category mapping and reviewable
provenance. Provider names never become listener-facing categories.

## DJ briefing, policies and repetition

The link-time selector does not give the DJ a raw database result or a bundle
of facts. It offers a concise, prepared **story spark** plus source metadata
for audit. Selection prioritises a recording-specific story, then the
canonical release or album, and uses artist-level material only as a fallback
or when it directly illuminates the song. When recording matching is still
pending, artist claims may use a unique, exact, case-insensitive match against a
MusicBrainz-backed artist name; compound credits, aliases and duplicate artist
names remain unmatched. Recording and release claims still require their
canonical matches. `generateLink` receives at most one spark. Regular Sleeve
Notes remain available separately as Verified Facts.

The same source-backed store can serve other consumers through bounded,
read-only lookups. A user-defined or built-in Skill should be able to request
relevant claims for the current recording, canonical release, artist, or an
explicit topic, and receive the wording together with its source URL,
attribution, category and supporting evidence. The lookup itself makes no
provider calls and does not inherit `generateLink`'s one-spark selection rule;
each consumer applies its own relevance and repetition policy while recording
which consumer received or spoke each claim.

Useful Skill consumers include **Album Anniversary**, which can draw on
canonical release facts; **Now-playing dig**, which can use cached claims as
source-backed context alongside its web search; and **Web search**, which can
reuse relevant stored claims and citations while answering a query. Cached
facts complement a Skill's own search or calculation when that capability
requires fresh information.

Collection and exposure are separate. The operator may retain an enabled
provider's source-backed claims while allowing only selected categories to be
offered to DJs. The future policy stack is:

```text
station feature enabled
  AND provider/source enabled and suitable
  AND category enabled for Sleeve Notes
  AND persona or show selected (additive)
  AND claim is fresh, supported and currently novel
  AND “Would you hear a DJ on a BBC Radio station say that?”
```

Use all of these novelty gates:

1. **exact claim** — do not repeat the same anecdote soon;
2. **topic/facet** — do not repeatedly give the same artist a chart-success,
   origin or collaborator story;
3. **entity** — artist notes have the longest cooldown, then releases, then
   recordings; and
4. **relationship neighbourhood** — suppress both directions of a recently
   used connection and related near-duplicates.

The use ledger records the supplied claim and generated link, consumer, local
track, time, source/evidence and source URL; actual airing can be attached when
the broadcast path confirms it. Corrections affect future use immediately and
never rewrite history.

The initial `generateLink` pilot applies local specificity and novelty gates
without provider calls: recording → canonical release → artist; exact claim
(21 days), topic (60 days), entity (21/45/90 days for recording/release/artist),
and relationship neighbourhood (60 days). It requires an enabled claim with
stored evidence and a source URL. Provider/category/persona/show policy and
explicit source freshness controls remain follow-up work; the pilot does not
claim to implement those table rows yet. Cooldowns begin when the claim is
supplied to the writer, which is conservative if a queued link is later dropped.

## Product surfaces

**Notes** remains always visible under Programming, even while globally
disabled. It makes clear that no provider calls occur while off, collection
never delays playback, and source material cannot reach speech until enabled.
The existing DJ Behaviour settings retain only the station-wide Extended
Sleeve Notes master switch. This initial implementation uses the curated
MusicBrainz Series defaults behind that switch. Provider switches,
empty-station maintenance, category and persona/show policy, per-list Series
controls, and custom Series MBIDs are later additions for a dedicated
**Settings** subpage inside Notes.

When Notes is redesigned, it should follow the established expanding-sidebar
pattern used by Library, Shows, Imaging and Moods. The section’s child views
keep an expanding research system legible instead of attempting to present its
operational controls, provenance and editorial material on one page.

Its operational views evolve to:

- **On air** — immutable supplied/airing ledger and its evidence;
- **Collected** — artist dossiers, canonical recording/release history,
  individual claims, categories, freshness and local attachments;
- **Connections** — source-backed graph explorer with source, direction,
  confidence, local match state and external-only nodes;
- **Sources** — capabilities, provider budgets, coverage/backlog, health and
  collection status; and
- **Settings** — provider and category controls, empty-station maintenance,
  Series enablement/custom MBIDs, and future exposure policies. The page must
  explain each control's effect on collection versus prompt-time selection.

Connections is an operator discovery tool as well as DJ infrastructure. It
must clearly distinguish an external linked artist/recording from a confident
local-library match and must not create provider work just by being viewed.

## Delivery plan

### Phase A — rebase the experiment on this model

1. Keep the retired Genius track-first collector experimental and dormant;
   run the separate canonical, metadata-only Genius worker only behind the
   Sleeve Notes master switch, its provider switch, and a server-held token.
2. Replace the old provider policy/documentation with this provider-neutral
   architecture and record the retained operational findings.
3. Define migration/backfill policy for existing experimental claims,
   relationships and provider identities; preserve data where it maps safely,
   never silently upgrade it.
4. Add a testable quiet-time gate and durable per-provider request accounting.

### Phase B — canonical identity and schema migration

1. Replace the local-track-centred model with canonical artist, recording,
   release/release-group and local-attachment records.
2. Add capability-specific coverage, source-material revisions, claim topics,
   release appearances, encounters and novelty-aware uses.
3. Implement the MusicBrainz identity/release-history resolver, including the
   first official non-compilation appearance and canonical-home selection.
4. Prove compilation files cannot cause a DJ to receive compilation context as
   a recording's origin.

### Phase C — two-stage collection scheduling

1. Convert accepted queue/play events into non-blocking Stage 1 match jobs.
2. Implement Stage 2 quiet-time research with recording → release → artist
   development priority and coverage-aware deduplication.
3. Enforce provider-wide pacing, daily budgets, retry state and observability.
4. Test that every playback-critical path remains network-free.

Prioritize recording-level facts first because they have the lowest repetition
risk, then canonical release context, then artist biographies. These are
scheduling priorities, not a promise to contact an optional provider: each
provider still requires its own enablement and worker. MusicBrainz Series
refreshes follow the same recording-before-release order.

### Phase D — Wikipedia and Last.fm artist dossiers

1. Resolve Wikipedia through MusicBrainz/Wikidata, fetch/cache versioned
   revisions according to Wikimedia API policy, and retain attribution.
2. Build bounded, injection-safe research extraction producing evidenced,
   categorised individual claims. An artist biography may yield up to eight
   distinct claims when the source supports them; this is a ceiling, not a
   quota. Give every category explicit guidance, choose categories by the
   subject of each claim, and require specific topics and standalone wording.
3. Add Last.fm community context through the existing credential path and
   separate its ephemeral popularity/similarity data from durable facts.
4. Build Collected and Sources readouts around coverage and claim diversity,
   rather than raw provider rows.

### Phase E — Genius metadata and musical connections

1. Reuse the documented song search/detail adapter only for exact recording
   identity, writer/producer credits, and cover/sample relationships. Retain
   only the adapter's structured allowlist; never fetch, retain, display, or
   prompt with lyrics or Genius prose.
2. Run the provider behind its own setting and token, the station-wide
   playback quiet gate, and durable station-wide limits of three requests per
   minute and 4,320 per day.
3. Store the structured Genius source projection and source-backed credit and
   musical-connection claims on canonical recordings. Promote relationships
   into canonical graph edges and resolve local attachments conservatively in
   the later Connections surface.
4. Add Connections as a read-only operator/discovery surface, including
   external-only nodes.

### Phase F — DJ-link projection and operator policy

1. Add category settings, provider/source gates and additive persona/show
   eligibility.
2. Implement deterministic story-spark selection, category/entity/relationship
   novelty and one-note maximum.
3. Extend the factual-grounding prompt boundary: the writer may naturally
   rephrase a supplied note but may not add, strengthen or invent facts.
4. Write supplied/airing records and measure/assert no source work or latency
   regression in the on-air path.

### Phase G — correction desk and later consumers

1. Add claim suppression, presentation correction, source/entity suppression,
   refresh and provider kill-switch actions, all auditable.
2. Add explicit, separately controlled DJ-banter and Skills consumers.
   Banter should receive one optional story spark for the whole exchange and
   keep music claims grounded in supplied evidence. Skills should get a
   bounded, read-only lookup for source-backed claims scoped to the current
   recording/release/artist or a requested topic. Start with Album
   Anniversary, Now-playing dig and Web search; preserve each Skill's normal
   search/calculation path and record the consumer and any resulting spoken
   use in the ledger.
3. Add later providers only through a documented taxonomy-gap review.

### Deferred operator review — picker release-year discrepancies

Once canonical release matching has bedded in, add an operator-facing review
queue that compares the track picker’s effective library year with the
confident canonical first-release year. It must initially be advisory: show
both values, the selected release and the evidence, but never silently rewrite
library tags or change picker behaviour. An operator may later choose to adopt
a confident canonical result.

## Current station test checkpoint

The current test exercises both background collection and optional link-time
selection. It requires a controller rebuild and restart; the web container also
needs rebuilding for the recent-call badge.

1. Enable Extended Sleeve Notes and let ordinary queue/play activity create a
   small set of encounters; confirm collection yields to broadcast-critical
   controller work.
2. Confirm the Notes readout shows canonical MusicBrainz recordings and
   release groups, attributed Wikipedia sources, and retained claims at track,
   album and artist levels where the sources support them.
3. Confirm the MusicBrainz Series cache has members for the two recording lists
   and the release-group album lists, including cumulative 1001 Albums
   recognition. An empty fetched list should be deferred and retried rather
   than refreshed every minute.
4. Inspect claims against their evidence and source URLs, including a
   compilation-local track whose canonical release group differs from its
   local compilation.
5. Compare `generateLink` badge states with its selected-note payload and
   generated wording. In particular, check that `chosen` means a
   high-confidence wording match, and that cooldown prevents recent repetition.
6. Verify that the regular Sleeve Notes section remains available when
   Extended Sleeve Notes is disabled, and that disabled mode makes no
   Extended-Sleeve-Notes provider calls or background jobs.
7. Capture timing evidence for link-time lookups and provider/research jobs;
   this is the upstream-review gate recorded above.

## Completion checks for first DJ-link release

- All provider work is background-only and yields to broadcast-critical work.
- **Upstream PR review point:** collect timing evidence for synchronous on-air note/release lookups and verify that active provider and research-LLM jobs do not delay playback-critical controller work, including when the quiet gate changes after a job starts. Agree and meet an acceptable latency budget before calling the branch ready for upstream review.
- Station-wide off performs no provider calls, database opening or behavioural
  change.
- Canonical release context is separated from local compilation/reissue files.
- Every candidate note has category/topic, evidence, provenance, freshness and
  use history.
- The selector can produce an untold artist story, a high-value track story or
  a relationship note—and can correctly choose none.
- Repetition is prevented across exact claims, topics, entities and reverse
  relationship edges.
- Provider/category/persona/show controls gate exposure independently.
- Suppression and correction apply immediately to future selection while the
  history remains immutable.
- Lyrics never enter Sleeve Notes storage, APIs, UI, prompts, logs or tests.
- Existing Verified Facts regression tests continue to prove that sparse
  metadata cannot create invented music history or show steering.
