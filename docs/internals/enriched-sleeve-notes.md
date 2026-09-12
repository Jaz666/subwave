# Sleeve Notes — design and delivery plan

## Status

This document is the agreed design handoff for `feat/extended-sleeve-notes`.
It extends the existing Verified Facts and Sleeve Notes foundation; it does
not replace it. `settings.djBehaviour.extendedSleeveNotes` is already a
disabled-by-default reservation and the DJ Behaviour panel currently presents
the feature as Coming Soon.

No feature code is planned in this handoff. The first implementation starts
only after the provider feasibility work in Phase 0 is complete.

## Product intent

Sleeve Notes is a provenance-aware, local music knowledge store that grows
from music a station actually encounters. Its first consumer is a small,
optional editorial layer for DJ links. It must also be useful to future Skills
and DJ banter segments without making the on-air link path complicated or
slow.

It is deliberately both of these things:

- a rich, accumulating store of source-backed music claims and relationships;
- a sparse presentation layer that offers a DJ zero or one relevant note when
  it genuinely improves a link.

The normal operator experience is automatic. Review is a correction mechanism
for material that has already influenced speech, not a publishing queue.

## Vocabulary and boundaries

Keep these concepts distinct in code, storage, prompts, and UI:

- **Verified Facts** are deterministic controller, library, station-history,
  and schedule facts. They remain the factual floor for DJ links.
- **Sleeve Notes** are source-backed claims or relationships retained locally
  with provenance. They are optional editorial context, not guaranteed truth.
- **Creative material** is persona direction and writing style. It must never
  become the basis for a factual assertion.
- **Lyrics** are out of scope. The separate lyrics feature owns structured
  lyric display and its own opt-in/publication decisions. Sleeve Notes must
  never fetch, retain, display, quote, prompt with, or derive context from
  lyric text.

The writer may naturally rephrase a supplied Sleeve Note, but must not extend
it using model memory or strengthen an editorial/source claim into an
undisputed fact.

## Non-negotiable runtime contract

`generateLink`, music selection, TTS, queue draining, and show handoffs must
never wait for a provider call, a provider-match calculation, or heavyweight
claim curation. A cache miss always uses the present Verified Facts-only link
path.

```text
Background work                         On-air link path

provider response                        current track + context
  -> validate and retain                  -> local eligible-claim lookup
  -> source-specific match                -> novelty/scope checks
  -> compact safe claim                   -> zero or one Sleeve Note
  -> local database                         -> normal link writer
```

The background job is low priority, rate-limited, bounded in concurrency, and
yielding to all playback-critical work. Link-time selection is a small,
deterministic local read; it never chooses a raw provider response.

## Product surfaces

### Navigation and disabled state

The main admin sidebar uses concise one-word destinations. The navigation item
will be **Notes**, under Programming. Its page title and feature name remain
**Sleeve Notes**.

The destination is visible even when the station-wide feature is disabled. It
is an explanation and discovery surface rather than a hidden empty route. Its
disabled state should make these promises explicit:

- no provider calls or background jobs occur while globally disabled;
- no source material can reach on-air speech until enabled;
- collection never delays playback; and
- future use is source-backed, sparse, and reviewable after airing.

The existing DJ Behaviour card stays the station-wide master switch. The Notes
page is the fuller operational and explanatory home.

### On-air scope

Global collection/exposure capability and DJ-link eligibility are separate.
A Sleeve Note is eligible for an on-air DJ link only when all of the following
are true:

```text
station feature enabled
  AND (current persona selected OR current show selected)
  AND claim is source-enabled, safe, fresh, and currently novel
```

Selecting a persona enables it for that persona across shows. Selecting a show
enables it for whichever persona hosts that show. Selecting both is additive,
not restrictive. With neither selected, the station may still collect Notes
for the shared store and future Skills, but no DJ link receives them.

Skills and future banter segments need their own explicit consumer-access
policy. They must not silently inherit a DJ/show assignment.

### Normal and corrective workflows

The Notes page has three primary views:

- **On air** — an immutable airing ledger: supplied claim, final spoken link,
  track, time, consumer, source, excerpt/evidence, and source URL.
- **Collected** — retained claims and relationships, their source, freshness,
  eligibility, and local match state.
- **Sources** — configured providers, health, rate/backlog state, and
  station-wide controls.

Corrections alter future exposure, never the historical record. Operators can
disable a claim, replace its compact presentation wording while retaining the
source evidence, suppress a source for an artist/release/track, refresh a
record, or disable a provider immediately. Disabling a provider removes its
claims from future selection while retaining audit history.

## Stored knowledge model

Use a sidecar SQLite database keyed to existing library/Subsonic identity;
never modify Navidrome's database. Store canonical local entities separately
from provider identities, so multiple sources can enrich the same artist,
release, or track.

The first schema should support these durable records:

- **entities** — local artist, release, track, and external-only entities;
- **provider identities** — provider, provider ID, canonical URL, match
  confidence, and provider-to-local resolution state;
- **claims** — constrained claim type, compact DJ-safe wording, classification,
  freshness, eligibility, and suppression/correction state;
- **evidence** — bounded supporting excerpt/structured source fields,
  retrieval time, and attribution needed for the operator audit view;
- **relationships** — directed music graph edges such as `samples`,
  `sampled-by`, `cover-of`, and `covered-by`, with their own provenance;
- **provider coverage** — lifecycle for each provider/entity pair;
- **jobs** — deduplicated background retrieval, retry, and local-resolution
  work; and
- **uses** — consumer/aired history used for audit and repetition control.

Claims and relationships must be source-scoped. Two providers agreeing can
corroborate a normalized claim; conflicting claims remain independently
attributed and must not be merged into a stronger assertion.

### Music relationships and local IDs

Source links such as samples, songs that sample a record, and cover versions
are relationships, not prose facts. Preserve the direction exactly.

When a provider supplies a linked song, queue a local Navidrome search in the
background. A confident match may attach one or more local track IDs; release
and compilation duplicates are valid. An uncertain result remains an
external-only relation with `ambiguous` or `unavailable` resolution state.
Never force a same-title match. Future Skills can use only confident local
links when they need something playable from the station library.

## Collection, providers, and freshness

Sleeve Notes is gained knowledge, not a whole-library scanner. A track entering
the queue/play history can create a small, persistent candidate. Admission
priority can favour repeated plays, recent plays, and entities already known
to matter to the station.

Provider/entity coverage has an independent lifecycle:

```text
unknown -> queued -> fetching -> ready
                    |             |
                    +-> no-match  +-> stale / refreshable
                    +-> retry-at
```

Adding a provider does not re-fetch existing providers or replace stored
claims. It queues a low-priority source-specific backfill for already-known,
likely-to-matter entities, rather than scanning the full library. The Sources
UI should report the resulting ready, queued, retrying, and no-match counts.

The store is artist/release/track capable, but provider strategy is
source-specific. For example, a track-oriented provider may begin with a
track lookup, while MusicBrainz/Discogs-like sources may begin at release or
artist. Track-level lookup is not inherently too detailed; track-level
**on-air use** remains sparse.

### Genius feasibility boundary

Genius is a promising first research candidate because of its music context
and potential credits/relationship data. Before implementation, confirm what
the supported API actually returns and permits us to retrieve, retain,
transform, and expose. Do not build any feature on page scraping or an
undocumented endpoint.

The Genius adapter must never retrieve or process lyric text. If useful
credits or relationship links are only page-rendered rather than available
through supported, permitted access, they are not part of this adapter's
contract.

## Link-time selection and repetition

The stored model may be rich; a normal DJ link gets zero or one selected Sleeve
Note. Selection considers consumer policy, confidence/classification,
freshness, current track context, existing Verified Facts, and repetition.

Knowledge value and on-air cadence deliberately run in opposite directions:

| Entity level | Knowledge value | Repetition risk | Exposure cadence |
| --- | --- | --- | --- |
| Artist | Highest; reusable across a catalogue | Highest | Most restrained |
| Release | Shared context for its tracks | Medium | Moderated |
| Track | Narrowest and most specific | Lowest | Most freely eligible |

Use both an exact-claim cooldown and a broader entity-level cooldown. A recent
artist fact should suppress other artist facts about that artist for a longer
window, while a genuinely novel track fact may still be suitable later. The
selector asks for the best *currently novel* fact, not merely the highest
ranked one. Saying nothing remains a successful outcome.

## Delivery plan

### Phase 0 — provider spike and policy decision

1. Document Genius's supported endpoints, authentication, quotas, data shape,
   storage/display/transform permissions, and attribution obligations.
2. Verify whether useful credits and music relationships are available through
   supported access; explicitly exclude lyrics and scraping.
3. Prototype exact provider-to-Navidrome matching against a small, disposable
   sample. Establish confidence and ambiguity rules before any automated
   persistence.
4. Write the provider adapter contract from the findings. Do not begin the
   production adapter until this phase has a clear permitted data scope.

### Phase 1 — foundation and inactive product surface

1. Add the sidecar database migrations and repository layer for entities,
   provider coverage, claims/evidence, relationships, jobs, and uses.
2. Define source-neutral schemas and the native provider interface.
3. Extend the existing disabled `extendedSleeveNotes` setting into a complete
   master setting/provider configuration contract.
4. Add the always-visible **Notes** route and its disabled explanation state.
5. Add controller tests proving that the disabled state schedules no jobs,
   makes no provider calls, and cannot alter existing link output.

### Phase 2 — background collection and first provider

1. Add candidate admission from queued/played music, deduplication, priority,
   bounded concurrency, retry backoff, negative caching, and observability.
2. Implement the validated first provider adapter and source-scoped local
   retention.
3. Add background provider-target-to-Navidrome resolution with conservative
   match/ambiguous/no-match states.
4. Surface provider coverage and job state in Notes → Sources.

### Phase 3 — DJ-link projection

1. Add persona/show assignment controls and resolve the additive eligibility
   rule at link time.
2. Implement deterministic local selection, one-note maximum, freshness,
   claim/entity cooldowns, and source/provider suppression.
3. Extend the existing factual-grounding prompt boundary for sourced notes;
   retain its prohibition on model expansion or invention.
4. Write an airing record whenever a claim is supplied to a consumer, including
   the final generated speech where available.
5. Measure link latency and assert that source/network work cannot occur in
   the on-air path.

### Phase 4 — operator correction desk

1. Build Notes → On air and Collected views with source attribution and
   evidence.
2. Add future-facing correction actions: claim suppression, presentation
   correction, entity/provider suppression, refresh, and provider kill switch.
3. Ensure every correction is auditable and takes effect immediately for new
   selection without rewriting past use records.

### Phase 5 — expand consumers and providers

1. Add explicit Skills access to structured claims/relationships and source
   links; do not expose raw provider payloads by default.
2. Design a separately scoped DJ-banter consumer using a small themed set of
   facts and the same provenance/repetition guarantees.
3. Add providers one at a time with their own capability, policy, matching,
   and backfill rules.
4. Consider relationship-driven Skills, such as sample trails, cover stories,
   and local-library follow-up playlisting, only after local relation matching
   is reliable.

## Completion checks for the first DJ-link release

- No provider or heavyweight curation work can be triggered by `generateLink`
  or another playback-critical path.
- Station-wide off means no external calls, jobs, or changed current behaviour.
- DJ links receive a sourced note only when global, persona/show, provider,
  claim, freshness, and repetition gates all pass.
- Every selected note has durable source provenance and an audit/use record.
- Suppression, correction, and provider disablement affect future use
  immediately and leave history intact.
- Ambiguous external-to-local music matches are never treated as playable
  local tracks.
- Lyrics are absent from all Sleeve Notes data, prompts, APIs, UI, and tests.
- The existing Verified Facts regression suite continues to prove that sparse
  metadata cannot cause invented music history or show steering.
