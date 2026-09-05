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

## Session handover — 4 September 2026

### Scope and branch

Native track shortlisting is being developed in:

```text
feat/track-cpu-shortlisting
/home/jaz666/codex/subwave-track-cpu-shortlisting
```

The work is deliberately independent of the paused Producer Routing and
FunctionGemma paths.

### Decisions made

- The primary path will become `buildShortlist(context)` followed by
  `djPick(context, shortlist)`.
- `buildShortlist` is controller-native and makes no LLM calls. `djPick` is the
  one editorial DJ-model call, returning a valid shortlist id, transition,
  on-air link and a separate selection reason.
- The existing Candidate Pool remains the automatic dead-air-safe fallback; it
  will not remain an operator-selectable mode after parity is demonstrated.
- The first PR is a vanilla-compatible substitution. It preserves source
  availability, arguments, scope, filtering, per-source caps, de-duplication,
  repeated source calls, the 1--5 discovery-pass budget and existing deep-cut
  behaviour. It adds no new musical heuristic.
- There is no fixed 18-track cap in the first native shortlist. That cap belongs
  to the Candidate Pool fallback, not the agent path. The native handoff keeps
  the existing accumulated per-source candidate behaviour.
- User-facing terminology after rollout: **Track Shortlist**, **DJ selection**,
  and **Backup selection**. The Booth Log should render one expandable
  **Shortlist Pick** event with code-generated factual provenance and a separate
  DJ-written selection reason.

### Evidence captured

Vanilla benchmarking with the same 8B local model shows the agent normally
uses almost all available discovery passes:

| discovery setting | average tools | `djAgentPick` average | pick success |
| ---: | ---: | ---: | ---: |
| 1 | 1.0 | 20.6 s | 85/85 |
| 2 | 1.9 | 24.1 s | 54/55 |
| 3 | 2.8 | 27.0 s | 32/36 |
| 4 | 3.8 | 47.7 s | 31/36 |
| 5 | 4.7 | 92.3 s | 32/39 |

Five rounds reached a 196.1 s p95. Discovery tools recorded no failures. Real
station traces show repeated calls are normal, especially
`tracksTowardJourney`, with mood, audio/text similarity, show playlists,
energy, random, search and deep cuts also occurring. This supports preserving
source repetition and identifies the repeated LLM/tool turns and growing
transcript as the bottleneck.

The next benchmark must measure separately:

1. `buildShortlist` latency for equivalent one-pass and five-pass source plans.
2. `djPick` latency, input tokens and success for the resulting one-pass and
   five-pass shortlist payloads.

Use the same current-track/show/journey context for repeated measurements and
record p50, p95, candidate counts, source runs and fallback outcomes.

### Completed feature work

- `6ade317b` — defines this vanilla-compatible shortlisting contract.
- `bca3c58e` — adds `controller/src/music/shortlist.ts`, a replayable native
  shortlist runner plus focused tests. It executes an explicit recorded
  source/argument plan through the current picker registry without an LLM,
  retaining the existing filtered/de-duplicated `seen` accumulator and factual
  per-source provenance. It is not yet live-wired and has no automatic source
  planner.

Verification completed for `bca3c58e`:

```text
controller npm run typecheck      passed
controller npm test -- shortlist-runner   passed (2 tests)
```

### Station state

The integration checkout is `/home/jaz666/Docker/subwave`, branch
`test-station/vanilla-debug-handoffs-prompt-safety-live`.

- It now includes upstream `v1.11.0`, debug features, prompt safety and
  show-boundary handoffs. The live boundary timing repair is `c220b6a6`.
- Controller and web were rebuilt to 1.11.0; the controller is healthy.
- The discovery bench is live under Admin → System → Discovery.
- Existing local `.dockerignore` and `controller/scripts/functiongemma/`
  changes in the integration checkout were intentionally preserved.
- Announce before any controller or web rebuild/restart. The user is currently
  collecting five-round baseline data, so do not deploy shortlisting work yet.

### Related follow-up

`djAgentSegment` is still a true skill tool-loop whenever the old Agentic
Picker setting is enabled: `SKILL.md` supplies the brief and `tool.mjs` is the
model-callable data capability. A later weak-model/creative-model path should
be controller-selected skill → controller-fetched data → one structured
generation call. Keep this separate from the native-shortlisting PR.

### Next action

After the user captures sufficient five-round data, turn representative live
source traces into replay fixtures and implement the conservative state-led
source planner: journey, show playlist, current-track audio/text similarity,
mood/energy and the existing deep-cut nudge. Do not introduce new music
heuristics or a global shortlist cap.

### Replay-fixture prerequisite

The captured discovery-route logs currently record only source names and
result counts. They do **not** include the source arguments or the pick context
required to make faithful replay fixtures. Before implementing the automatic
source planner, obtain a full trace export containing those fields, or add
detailed redacted trace logging long enough to capture representative picks.

Redaction must retain the fields needed for replay (source, arguments,
current-track/show/journey context, discovery round and result identifiers or
stable candidate metadata) while excluding credentials, tokens and unrelated
prompt contents. Do not restart the controller merely to add this observability
without first notifying the user; they are collecting latency data.

### Replay-trace capture

`picker.replayTrace` now emits one factual, redacted event for every completed
agentic picker run. It contains the resolved replay scope, minimal
current-track and show context, one-based discovery rounds, source arguments
and returned candidate ids. It deliberately omits prompts, model responses,
credentials and unrelated session history.

The change is not deployed to the integration station. Notify the user before
any controller rebuild or restart; after deployment, retain representative
events as replay fixtures before starting the automatic source planner.

### Captured source-plan evidence — 5 September 2026

The integration station captured 94 `picker.replayTrace` records before its
next controller change. The set includes 69 journey contexts, 10 strict-show
contexts, 8 calls with an empty source result, 40 playlist contexts and 25
repeated-source runs. It covers journey, playlist, audio/text similarity,
mood/energy, search, random and deep-cut sources. Strict-playlist evidence is
still desirable before rollout, but is not needed to begin the planner seam.

`planShortlistSources(context, availableSources)` and native
`buildShortlist(context)` now exist in `controller/src/music/shortlist.ts`.
The planner is controller-native and availability-gated: it leads with an
active journey or show playlist, follows the observed mood/energy and
current-track similarity lanes, preserves repeated calls when its pass budget
wraps, and retains the existing caller-decided deep-cut nudge. It is not yet
wired into the live picker or the DJ selection call.

`controller/src/music/dj-pick.ts` now supplies that selection seam: one
structured `djShortlistPick` call receives the candidate payload, can select
only one supplied id, and writes the existing link/transition fields plus a
separate editorial `selectionReason`. It cannot make discovery calls or claim
source provenance. Queue integration and Booth Log rendering remain pending.
