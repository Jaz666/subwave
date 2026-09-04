# Native track shortlisting

The native shortlist path replaces **how candidates are discovered**, not the
station's music policy or the DJ's editorial role.

```text
current track + show/broadcast state
             ↓
      buildShortlist(context)
             ↓
  bounded candidates + factual provenance
             ↓
       djPick(context, shortlist)
             ↓
     chosen track + transition + link
```

`buildShortlist` belongs in the controller. It is local code: it does not call
an LLM and it does not enqueue a track. `djPick` is the main DJ model's single
editorial call. It must choose an id from the supplied shortlist and may write
the on-air link and transition at the same time.

The existing Candidate Pool remains the dead-air-safe fallback. It is not an
operator-selectable picking mode once native shortlisting is live.

## Compatibility contract for the first PR

The first PR is a behavioural substitution, not a new music-selection policy.
It must preserve the following current picker behaviour.

### Scope and guards

Every native source receives the same resolved `PickerScope` used by the
current picker tools:

- track recency and hard no-repeat ids/keys;
- strict show genre, era, mood, energy and vocal locks;
- strict playlist intersection and excluded-playlist ids;
- resolved show playlist tracks; and
- an active sonic-journey waypoint, when one exists.

Candidates still pass through the existing shared collection logic: strict
locks before recency, freshness-biased ordering, de-duplication by id across
all sources, and the existing default cap of three tracks per artist. The
downstream back-to-back artist guard remains authoritative.

The first PR must not weaken any of these guards, add a new musical weighting,
or change the behaviour of the Candidate Pool fallback.

### Sources

The ordinary next-track registry has seventeen conditionally available sources:

`searchLibrary`, `similarSongs`, `topSongsByArtist`, `recentByArtist`,
`songsByGenre`, `tracksByMood`, `tracksByEnergy`, `tracksLikeThis`,
`tracksThatSoundLikeThis`, `searchByLyrics`, `searchBySound`, `deepCuts`,
`recentlyAdded`, `starredSongs`, `randomSongs`, `showPlaylistTracks`, and
`tracksTowardJourney`.

`identifyRequestedTrack` is request-only and is not part of ordinary
shortlisting.

Availability remains source-owned. In particular, embedding/search sources are
absent when their backing index or query capability is unavailable; a source
with no usable data must not be offered as an empty, time-wasting call.

Most sources contribute at most eight accepted tracks. `showPlaylistTracks`
may contribute twelve. A source's raw result can be wider (for example a 60
neighbour KNN search) because the existing collection rules deliberately thin
it only after filtering and freshness ordering.

### Passes and repeat calls

The existing `llm.discoverySteps` setting retains its 1--5 range and its
"up to" meaning. It becomes the **shortlist pass budget**. A native pass may
reuse a source: vanilla permits the agent to call the same tool repeatedly, so
the first implementation must not impose artificial source uniqueness.

Vanilla lets a model make more than one call in a round, and lets it decide the
arguments from preceding results. Native code cannot reproduce an arbitrary
model's private decision process byte-for-byte. The compatibility requirement
is therefore observable rather than transcript-identical: the native plan must
use the same source registry, gates, arguments and filtering semantics, and be
benchmarked against recorded vanilla runs before its source policy changes.

No new source preference, music heuristic, or optimisation belongs in this
first policy. Those are follow-up work after the compatibility PR is accepted.

### Compatibility handoff to the DJ

The current tool-loop agent accumulates every accepted source result in a
`seen` map; it has no global eighteen-track cap. This can grow by roughly eight
tracks for each productive tool call and is the context growth this project
removes.

There is **no fixed global candidate cap** in the first native implementation.
The Candidate Pool's 18-track cap belongs to its fallback policy and is not a
property of the current agent path. Imposing it here would discard candidates
that vanilla currently lets the DJ consider.

The native shortlist instead preserves the existing per-source caps,
de-duplication and accumulated-result behaviour. In the observed one-source per
pass shape this is normally up to eight accepted candidates per productive pass
(for example, four passes can yield up to 32 unique candidates). The model
still receives far less context because it no longer receives the tool
definitions, tool-loop turns, or raw tool transcripts.

The builder records the number of candidates before and after every source and
after de-duplication. A global ceiling may be introduced only as a separately
benchmarked optimisation, never as an incidental carry-over from the Candidate
Pool fallback. `djPick` is schema-validated against the ids it receives.

## Provenance and Booth Log

`buildShortlist` returns factual data, not prose:

```ts
type ShortlistResult = {
  candidates: any[];
  sourceRuns: Array<{
    source: string;
    args: Record<string, unknown>;
    returned: number;
    accepted: number;
    elapsedMs: number;
    error?: string;
  }>;
  uniqueCandidates: number;
  appliedGuards: string[];
  elapsedMs: number;
};
```

The Booth Log renders one completed **Shortlist Pick** event, with expandable
factual context, source runs, counts, selected track and transition. The DJ's
`selectionReason` is separate from its on-air link. It may explain why the
chosen candidate fits the current musical context, but must not invent source
names/counts or absorb persona Musical Leanings as diagnostic evidence.

## Acceptance evidence

Before the native path replaces the tool loop, compare it with recorded vanilla
bench runs across ordinary picks, strict shows, playlist shows, thin indexes,
journeys, deep-cut nudges and empty-source cases. For each run retain:

- source names and arguments;
- raw/accepted/de-duplicated/final counts;
- final shortlist ids and source provenance;
- total shortlist latency; and
- whether fallback was required.

The first PR is ready only when it retains valid, varied candidates under the
same guards while removing the discovery-tool definitions and transcripts from
the DJ model's context.
