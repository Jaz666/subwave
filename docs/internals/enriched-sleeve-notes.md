# Extended Sleeve Notes — design and delivery plan

**Wikipedia implementation update (4 October 2026):** The local source now
uses revision-pinned rendered HTML, prose and quote preservation, combined
context-bounded chunks, a single free-text extraction call per chunk, durable
resume state, and post-call source screening. Wikipedia facts have no fixed
eight-claim ceiling and raw extraction failures do not enter the Recycle Bin.
This source has not been deployed or pilot-verified. The [rewrite plan](../investigations/2026-10-04-sleeve-notes-wikipedia-rewrite-plan.md)
records the current flow and the remaining quality/performance acceptance work;
older rank/check details below describe the previous implementation.

**Research queue update (5 October 2026):** Artist and album biographies are
article-level jobs split into independently paced sections. The shared
two-minute research slot orders section depth first and albums before artists
at each depth; an initial eligible encounter unlocks the remaining sections
without repeat plays. Album work no longer waits for the artist scan, and a
missing Wikipedia album article falls back to Genius Album Bio. The ten-job
autopilot cap applies only when no listener is confirmed; with a listener,
autopilot tracks continue to seed match and biography work above the cap.
Manual actions remain exempt. This update is local and still needs a controller
rebuild before the station uses it.

**Quality gate (2 October 2026):** Further feature expansion is paused while
the research rejection volume and end-user moderation workload are addressed.
The investigation, FunctionGemma options, evaluation plan, and launch questions
are in [the researcher quality handover](../investigations/2026-10-02-sleeve-notes-quality-and-researcher-model-handover.md).

## Manual claim moderation (2026-10-02)

The Notes workspace now has a Moderation tab. New candidates rejected during
Wikipedia and Genius biography research are stored in a separate review queue
with their source document, proposed Full/Short wording, exact evidence and
final rejection reason. Pending candidates are never selected for airtime.
The queue is paged and can be filtered by provider, reason and search text.
An admin can edit and approve a candidate once it passes the controller's
deterministic evidence and shape checks, or delete it. The same workspace can
correct or delete already live, text-backed research claims. Approved edits
and deletion tombstones are protected from ordinary research replays; decisions
and edits are recorded in local history tables. Moderation remains available
when Extended Sleeve Notes is switched off, so saved material can be reviewed
without putting it on air.

The queue starts collecting live research rejections after the controller
upgrade. The completed frozen Wikipedia replay separately saved its 27,158
rejected proposals. After the controller rebuild, import that preview with
`sudo npm run sleeve-notes:moderation-import -- --file=/home/jaz666/Docker/subwave/state/sleeve-notes-research-previews/wikipedia-replay-full-v12.json --apply=yes`
from the controller directory. The command validates every source revision and
is idempotent; it leaves already live claims and human decisions untouched.
The live SQLite files are created by the root-run controller container, so the
host-side import needs root write access. Do not change their ownership while
the station is running.
Older rejections from ordinary station jobs were not saved. Missing source
material and passages that never became candidates are not claims and do not
enter the queue.

## Status

This is the agreed replacement handoff for `feat/extended-sleeve-notes`, dated
2026-09-14. It supersedes the branch's earlier track-first, Genius-first
delivery plan.

The existing sidecar database, Notes route, collection worker, Genius adapter,
and operational readout are useful experiments, not the architecture to extend.
They remain disabled by default and their already-collected data is experimental.
Before enabling DJ use or adding more collection, rework them around the
artist-first model in this document.

The first replacement migration deliberately clears the experimental
Genius-only rows once. It creates the canonical store beside the retired
tables and records local encounters as durable MusicBrainz match jobs; it does
not yet run provider research or expose notes to a DJ.

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
- **claims** — category, topic, Full and Short wording, source state, freshness,
  correction and suppression state;
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

A separate quiet-time scan walks Navidrome's album pages for **all** cached
allowlisted Series. It checks song MusicBrainz recording IDs directly against
recording lists. For album lists, the album title only narrows the work; a
tagged MusicBrainz release ID must resolve to an exact cached release-group
member before any local track receives the claim. Matching albums attach the
recognition claim to each local song without waiting for that song to be
played or starting its biography research. The scan resumes from a stored
album-page offset, revisits the library daily and restarts after a Series
snapshot refresh. Albums without a verifiable MusicBrainz identity remain
unmatched rather than receiving a title-only claim.

#### Future Series settings

Adding operator settings is a later addition. When implemented, put per-list
enable/disable controls and custom MusicBrainz Series MBIDs in the Notes Config
view. Custom IDs must be resolved and validated in
the background; accept only supported recording- or release-group-level
Series, deduplicate IDs, and cap custom entries. An unknown, non-Series, or
unsupported-entity MBID must produce a visible configuration error and no
unbounded provider work. Custom Series must use the same source attribution,
caching, rank/edition provenance, and Recognition claim rules as the defaults.

### Wikipedia — preferred artist and release-story source

Wikipedia is the preferred source for source-backed artist and album stories.
Wikipedia research excludes the `credits` category. Credit-only facts are not
collected under another category; a contributor may appear in a substantive
creative story. Genius supplies structured writer and producer credits.
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
The controller first validates Full claims against the supplied revision.
Claims with a generic topic, context-dependent wording or a potentially
presentational support failure get one repair pass that keeps their category
and exact evidence fixed, then cross the same validation boundary again. The
resolved article subject may replace a clear pronoun, surname or generic
reference to that subject during repair and validation; it cannot supply a
missing relationship for another named person, event or work. A
second, smaller model call writes Short
anchors only for accepted Full claims;
an invalid Short is retried once while its Full wording and evidence remain
fixed. Short is validated as a compression of the already accepted Full claim,
rather than being required to prove the raw citation independently. A final
adversarial review sees only each completed Full/Short pair and
its exact evidence and fails closed: it must reject gaps filled from trained
knowledge or undisplayed article context, changed semantic roles, ownership,
direction, cause, place or timing, and unsupported clauses. Category and
editorial checks remain controller decisions rather than being repeated by the
factual reviewer. Each retained claim has two versions: **Full**, a complete self-contained
sentence for a long runway and future Skill/Banter use, and **Short**, compact
semantic anchors that a link-writing model can turn into a supported sentence.
Every Full sentence names its subject or titled work. Short does not need to
read naturally and is capped at 18 words in the research prompt and 140
characters at the trust boundary, but it must keep the named subject,
relationship, object, direction and exact qualifier. It may compress only the
Full claim rather than introducing another fact found elsewhere in the evidence.
It retains named works, explicit negatives and time-sensitive first-after-a-gap
claims so compression cannot remove the detail that made the Full claim useful.
Both versions must match the same exact evidence clause. Preserve the named
source of attributed opinions. The article subject may resolve its own clear
pronoun, surname or generic reference. Evidence must still state the
relationship connecting any other member, work or event to that subject;
article placement alone cannot supply that link. Evidence must end at a complete
sentence rather than a truncated source boundary. Reject lowercase or truncated fragments,
unresolved references, bare release identities, routine chart/award listings,
generic entity-name topics, misclassified credits, unsupported clauses and
strengthened rankings, quantities or superlatives. Unbalanced quotation or
bracket fragments and list-like Discography, Members or References passages do
not qualify as prose evidence.
Do not send an entire long article in one prompt; process bounded sections,
then deduplicate/rank the resulting candidates.

Wikipedia replays read the latest cached source document for every Wikipedia
entity at its stored revision and content hash. Long articles are processed in
bounded sentence-aligned sections, then their candidates are interleaved,
deduplicated and capped across the whole source. The model selects controller
issued evidence IDs; the controller restores one to three contiguous exact
source passages (enough to resolve an antecedent) rather
than accepting generated quotations. `npm run sleeve-notes:wikipedia-audit` creates a deterministic
manual sample with random entries per category separated from targeted risk
cases. Review source support, completeness, entity/relationship clarity,
category/topic fit and listener value, then choose keep/revise/reject.
`npm run sleeve-notes:wikipedia-replay` writes a preview only. Its `runState`
must be `complete`; an interrupted full run cannot be applied accidentally.
Preflight a reviewed file with `npm run sleeve-notes:wikipedia-apply -- --file=PATH`.
Add `--apply=yes` only after every completed source and proposal has an
explicit decision. Replacing a source with no retained proposals additionally
requires `replaceWithEmpty: true`. Apply checks the frozen revision and hash
again, soft-disables older Wikipedia claims for that entity, and preserves the
claim-use ledger.

### Last.fm — deferred for Extended Sleeve Notes

Do not add Last.fm tags, similarity or community-popularity data to the Extended
Sleeve Notes claim corpus or Connections graph at this stage. Existing Last.fm
scrobbling remains separate. Reconsider the API only if a demonstrated source
gap remains; first review its current API terms, attribution and any required
approval. Similarity and tags are community signals, not historical facts or
source-backed credits.

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

The use ledger records the exact claim wording supplied to the writer, its
generated link, the wording-signal result, consumer, local track and time. When
the selected link reaches the TTS dispatcher, the ledger stores the normalized
text handed to the speech engine. A later Liquidsoap live-edge confirmation
records airtime separately; corrections never rewrite the historical record.
The link writer may explicitly mark `SPARK_NOT_NOW(reason)` when a sound claim
does not fit the current track or speaking window. The controller strips that
marker before speech and stores its reason with the offered link. This is a
context pass and never contributes to the three quality rejections that send
a claim to the Recycle Bin. Ordinary omission needs no marker. The separate
`SPARK_REJECTED(reason)` marker is reserved for an intrinsic quality concern;
it contributes to the count only after the linked voice is confirmed on air.
Genius writing and production credits are eligible as optional DJ sparks when
no story, connection, or recognition claim is available for the link. The DJ
may omit or explicitly reject a credit; a rejection is recorded with the link
and cools down that exact credit for 21 days, but never moves the structured
credit into the Recycle Bin or disables it.
Genius `samples`, `sampled_in`, `cover_of` and `covered_by` connections remain
eligible as sparks. Explicit DJ quality concerns about these structured
relationships are recorded with the link, but do not add to the Recycle Bin
count or disable the claim while this policy is being assessed.

The initial `generateLink` pilot applies local specificity and novelty gates
without provider calls: recording → canonical release → artist; exact claim
(21 days), topic (60 days), entity (21/45/90 days for recording/release/artist),
and relationship neighbourhood (60 days). It requires an enabled claim with
stored evidence and a source URL. Provider/category/persona/show policy and
explicit source freshness controls remain follow-up work; the pilot does not
claim to implement those table rows yet. A two-hour reservation prevents
duplicate queued links and is released when a link is dropped. The regular
cooldown begins only when the final generated/spoken text contains a clear
signal from the offered claim and its linked voice clip is confirmed on air.
The high-precision wording signal can miss paraphrases; in that case the claim
will not receive a cooldown. The lookup considers only uses relevant to the
current candidates and their longest cooldown window, without a fixed row cap.

Config's **Story spark frequency** changes use guidance after selection:
**Regular** encourages frequent, natural use of fitting sparks, **Occasional**
uses one when it gives the current link an interesting angle, and **Rare**
reserves them for especially strong moments. All three allow omission without
explanation. The DJ may place a used fact wherever it fits naturally in the
link; it is never required as the opening sentence. Missing settings default
to Occasional. Each link uses one generation call, with no revision or
assembled fallback when a spark is omitted. A clip
uses Short anchors when the measured first-vocal runway (or silence-trimmed
`intro_ms` when vocals are unmeasured) is 18 seconds or less, and when runway
is unknown. Full wording is used only above 18 seconds. When a story-spark link
cannot survive the hard airtime trim, the picker releases its reservation and
tries once more without the spark, then applies the same trim. A measured vocal
onset below 2.5 seconds still drops speech for safety. The ledger records the
text handed to speech and confirmed airtime. The wording check and literal
fallback apply to English personas; translation cannot be verified by the same
term-overlap signal.

## Product surfaces

**Notes** remains visible under Programming even when Extended Sleeve Notes is
off. Its child views use one-word labels and the established expanding-sidebar
pattern used by Library, Shows, Imaging and Moods:

- **Overview** — the default opening page and explanation/status surface;
- **Research** — recently collected claims and activity;
- **Explore** — the full local Sleeve Notes library explorer;
- **Connections** — the source-backed relationship visualizer;
- **Sources** — provider coverage, refresh state and request activity; and
- **Config** — provider controls and credentials specific to Sleeve Notes.

The **Overview** has two states driven by the station-wide Extended Sleeve
Notes switch in global Settings → DJ Behaviour.

- With the switch **off**, explain what Extended Sleeve Notes adds, how it
  differs from ordinary Vanilla Sleeve Notes, and the resource trade-offs.
  Vanilla Sleeve Notes remain the normal factual notes. Extended Notes may
  supply one source-backed story spark for an eligible link; Config controls
  how strongly the DJ is guided to use it. Collection is background work and
  must never delay playback. When off, no Extended provider work or prompt-time use occurs;
  already cached material remains stored. Describe provider/API limits and the
  extra model context used when a cached spark is eligible, but do not show
  invented token or dollar estimates before those costs are measured. Provide
  a link to global Settings → DJ Behaviour that opens that section and, where
  the settings UI permits, scrolls to the master switch.
- With the switch **on**, show collection health, library coverage, recent
  activity, queued/retrying/failed work, provider readiness, and a bounded
  history pairing each offered story spark with its generated link, the
  normalized text sent to speech when available, and whether the voice clip
  aired. Make generated links dropped before speech visible with an explicit
  status. A claim cooldown requires both a detected claim signal and confirmed
  airtime. The detected-use label is a distinctive-wording signal, so it can
  miss paraphrases. Link into Research, Explore, Sources and Config for the
  relevant detail.

The active research path uses `sleeveNotesResearch` to extract a Full claim and
an optional Short anchor, then `sleeveNotesCheck` for a generic DJ's factual,
airtime and context verdict. Genius album Full claims use extractive source
transformation, so only the second call is needed there. Controller checks
ensure the citation is an exact passage and fields are usable; they do not
discard a supported Full for a category, topic or missing Short. The generic
DJ may approve a general claim, restrict it to the named release or track, or
send it to the Recycle Bin. A live DJ can explicitly reject a spark's own
quality. Only aired links count, and three distinct rejections move the claim
to the bin. Pending bin items are oldest first and expire after 30 days; a
fingerprint without claim prose prevents unchanged expired material returning.
Research processes one source section per turn. A database-backed two-minute
start interval spaces research/check pairs across jobs and controller restarts.
If a DJ decision begins during extraction, screened candidates are saved and
the check waits for the next quiet turn. Completed sections are checkpointed,
so a restart resumes the remaining source sections.

**Research** is the recent collection view: newest retained claims, source
evidence and their local matches. It is an activity/readout page, not the full
library index. **Explore** is the complete Sleeve Notes library explorer for
artists, albums and recordings/tracks. It opens with a paged artist index,
loads an artist's albums only after selection, then loads an album's tracks
only after selection. Keep each search scoped to the visible level, provide a
right-side A–Z jump rail for that level, and keep the selected path as
breadcrumbs. Its dossiers show retained claims, source links and match state;
artists appear when the artist or a known album/track under them has retained
evidence. Keep Explore's level-specific search, pagination, letter jumps and
entity-dossier reads separate from the admin's bounded 80-item readout so the
first view does not aggregate the full claim library and Overview and Research
can continue using small, recent summaries.

**Connections** uses the interaction model of Library → Observatory: a wide
canvas with pan/zoom, search/filter, selection, detail panel and deep-links.
Observatory's track positions and similarity edges are visual/genre
relationships, not evidence for this graph. Connections renders bounded,
focused neighbourhoods of typed, source-backed relationships between artists,
recordings/tracks, releases/release groups, MusicBrainz Series and credited
people. A neighbourhood starts from a selected library entity or current track;
every edge preserves direction and role, exposes its source/evidence, and marks
whether each endpoint is confidently matched to the local library or remains
external-only. The mobile presentation uses the same edge data as a relationship
list. Dedicated search, current-track resolution and graph reads query the local
sidecar only; viewing or expanding the graph never enqueues provider work.

Genius producer and writer credits become contributor entities and typed
edges. Preserve the exact **Writer** role; do not relabel it Composer or infer
additional roles. New structured projections retain stable Genius contributor
identifiers when supplied. Older cached credits contain names only; Connections
keeps each of those contributor nodes scoped to its source claim and labels the
identity unresolved rather than merging people on a name alone. The same
verified edges support
an optional DJ story spark such as “this track was produced by Y, who also
produced Z”; prefer Z when it is in the local library. The spark must be
pre-collected from source-backed credits, remain a single optional note, and
never trigger a live Genius lookup during playback.

**Sources** is the operational catalogue for providers and capabilities:
coverage, cached lists/material, last refresh, queues/retries/errors and
request outcomes. **Config** owns the Sleeve Notes-specific Genius metadata
collection and “research while the station is empty” controls, moved here from
global DJ Behaviour. The station-wide Extended Sleeve Notes master switch
stays in global DJ Behaviour and is linked from Overview. Config also accepts
a Genius client access token using the same protected settings-backed pattern
as the Last.fm key: mask the saved value, never return it from reads, and show
only whether one is configured. Include a short instruction and a link to
[Genius API Clients](https://genius.com/api-clients) to create an API client
and generate a Client Access Token. The `.env` token is development scaffolding
and can remain as a transition fallback while an operator moves it; the
supported operator credential belongs in Settings.

Last.fm similarity, tags and “you might like” data are deferred and stay
outside the Extended Sleeve Notes claims and Connections graph. Existing
Last.fm scrobbling remains separate. The UI must not imply that inspecting a
page, dossier or graph starts research.

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

### Phase D — Wikipedia dossiers and readouts

1. Resolve Wikipedia through MusicBrainz/Wikidata, fetch/cache versioned
   revisions according to Wikimedia API policy, and retain attribution.
2. Build bounded, injection-safe research extraction producing evidenced,
   categorised individual claims. An artist biography may yield up to eight
   distinct claims when the source supports them; this is a ceiling, not a
   quota. Give every category explicit guidance, choose categories by the
   subject of each claim, and require specific topics and standalone wording.
3. Build Research and Sources readouts around coverage and claim diversity,
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
   musical-connection claims on canonical recordings. Promote producer and
   Writer credits into typed contributor edges, using stable identities where
   available and conservative local matching.
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

## First station test checkpoint

The first live test is collection-only. It requires a controller rebuild and
restart but must not change the broadcast container or give Sleeve Notes to the
DJ writer.

1. Enable Extended Sleeve Notes and let ordinary queue/play activity create a
   small set of encounters.
2. Confirm the Notes readout shows local attachments, canonical MusicBrainz
   recordings/release appearances, artist source documents and (where the
   research LLM is available) up to three evidenced artist claims.
3. Inspect several claims against their stored evidence and source URL,
   including one compilation-local track whose selected canonical release is
   different from the local compilation.
4. Confirm the regular DJ links remain byte-for-byte on the existing Verified
   Facts path: no Sleeve Note is yet supplied to the link writer.
5. Disable Extended Sleeve Notes and verify that no new background jobs start
   or provider calls occur; existing collected material remains inspectable
   only after the feature is re-enabled.

## Completion checks for first DJ-link release

- All provider work is background-only and yields to broadcast-critical work.
- **Before upstream PR readiness:** keep Regular as an encouragement to use fitting sparks naturally, with no retry or hardcoded claim fallback; accept occasional omissions.
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
