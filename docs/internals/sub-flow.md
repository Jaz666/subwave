# Sub/Flow implementation plan

Prepared: 9 October 2026 (Europe/London)

Status: proposal for later implementation. This document does not authorise changes to the running station. Recheck the current upstream code before development; this plan reflects the station inspected on 8–9 October 2026.

## Objective

Allow the station owner to define an ordered Flow of two or more tracks that should be heard together. Whenever an enabled Flow member is selected, queue the complete Flow in its defined order and preserve the original joins between its tracks.

Example: selecting either **Brain Damage** or **Eclipse** queues **Brain Damage → Eclipse**, starting at Brain Damage. A Flow is one selection and scheduling unit, containing individually tracked songs.

The owner defines the musical relationship explicitly. The model does not invent Flows or decide which parts can be omitted.

## Existing foundations and limitations

- Agentic Tools and Track Shortlist share selection resolution, Musical Leanings review, final guards and queue handoff in `controller/src/broadcast/dj-agent.ts`.
- Queue admission, persistence and controller-to-Liquidsoap delivery are centralised in `controller/src/broadcast/queue.ts` and its supporting modules.
- Operator album/artist blocks already provide ordering, group labels and grouped cancellation through `controller/src/broadcast/block-queue.ts` and `controller/src/routes/dj.ts`.
- Existing block identity is deliberately presentation-only. Its tracks remain ordinary FIFO items; it provides neither atomic admission nor protected, gapless playback. Do not change its meaning to implement Sub/Flow.
- Liquidsoap currently polls one annotated URI from `next.txt` into `request.queue`, then applies the station’s transition pipeline.
- The autonomous `auto.m3u` fallback is a separate playback path. Updating the controller queue alone will not cover it.

## Recommended initial behaviour

These are proposed defaults to confirm during implementation planning, rather than requirements already agreed by the owner.

| Area | Proposed default |
| --- | --- |
| Membership | A track belongs to at most one enabled Flow. Reject overlapping or duplicate membership. |
| Trigger | Any selected member resolves to the complete Flow, beginning with its first track. |
| Ordering | Explicit owner-defined order; never shuffled or inferred from discovery order. |
| Internal joins | Original end followed immediately by original start, without added silence or overlap. |
| Normal transitions | Allowed into the first track and out of the last track. |
| Admission | All members eligible and playable, or none queued. Never silently shorten a Flow. |
| Speech and imaging | Links, beds, jingles, idents and routine announcements wait until the Flow finishes. |
| Listener requests | Wait behind an active Flow; show this clearly to the listener. |
| Show boundaries | Autonomous selection defers a Flow that cannot fit before a known boundary. Explicit operator queueing retains existing boundary-warning behaviour. |
| Repeat rules | Check every member before admission. Permit intentional same-artist/same-album adjacency inside an admitted Flow; record all plays for subsequent cooldowns. |
| Automatic cuts | Do not apply individual length caps or scheduled cuts inside a Flow. Decide eligibility using the whole duration. |
| Operator actions | Allow explicit cancellation/stop, clearly identifying that it ends or breaks the Flow. |
| File versions | Bind to specific library recordings; do not substitute another edition automatically. |

A true playback failure or an explicit operator intervention may interrupt a Flow. Routine station scheduling must not.

## Phase 1 — playback proof before production integration

Prove the audio and metadata behaviour with the station’s exact Liquidsoap version before committing to a transport design.

1. Use local two-track and three-track fixtures whose endpoints form a known continuous signal.
2. Evaluate a finite `sequence` with merged internal boundaries, and an alternative protected queue/transition design if necessary.
3. Confirm that internal joins introduce neither fades, overlaps, missing samples nor added silence. A zero-duration transition setting alone is not sufficient proof.
4. Confirm independent track metadata remains observable at each member boundary, even if Liquidsoap presents the group as one track to outer transition operators.
5. Prove the group starts only when its members are resolved and sufficiently buffered, so the one-URI polling mechanism cannot create an internal gap.
6. Exercise the existing jingle, voice, fallback, gain and crossfade pipeline around the group.

**Exit condition:** a rendered audio fixture demonstrates continuous joins and correct per-member metadata through the real station pipeline. If `sequence` removes the events needed for queue advancement, introduce explicit member metadata handling or select a different transport.

Reference: [Liquidsoap sequence documentation](https://www.liquidsoap.info/doc-2.3.3/reference/source-track-processing#sequence). The documented version is background guidance; verify behaviour against the deployed version.

## Phase 2 — definitions, storage and management

Introduce a separate Flow domain model and store, following the repository’s current persistence conventions after checking them.

A definition should contain:

- Stable Flow ID, display name, enabled state and revision.
- An ordered list of track IDs, with readable title/artist/album snapshots.
- Created/updated timestamps and validation status.
- Enough identity information to report missing members and participate in existing library ID-rotation recovery.

Validation must reject fewer than two tracks, duplicate members, ambiguous enabled membership and missing/unresolvable selections. Use a modest bounded size for the first version; choose the actual limit after the playback proof.

A queued occurrence must capture an immutable snapshot of the definition. Editing or disabling the definition must not silently alter a group already queued or on air. Cancel an existing occurrence explicitly.

Provide management through an authenticated API and an admin library interface: create, name, reorder, enable/disable, inspect problems, preview and queue a Flow. Display its complete duration and constituent recordings. Deletion and editing should report existing queued occurrences.

## Phase 3 — Flow-aware selection and eligibility

Introduce a shared resolver that maps a selected/discovered track to either an ordinary track or a Flow selection unit. Reuse it across Agentic, Shortlist and Candidate Pool recovery.

For autonomous selection, resolve units before the final choice and guards wherever possible:

1. Collapse discovery of several members into one Flow opportunity, merging source provenance without duplicating the group.
2. Resolve all members and check hard show restrictions, blocklists, availability, recency and duplicate queue membership against the entire group.
3. Present the first track as the entry point, the last as the exit point, and the full duration as the scheduling cost. Do not use the triggering middle track’s acoustic fit as if it were the first track’s fit.
4. Give models concise, explicit group information and a stable selection identifier. Validate returned identifiers against the actual eligible units.
5. Ensure deterministic recovery and corrective re-picks choose complete eligible units too.

Keep discovery and initial selection Leanings-blind. The private Leanings review may compare eligible selection units, but its preference evidence and flow checks need a documented interpretation. Recommended first version: use the entry track for fit and preference evidence, label companions as following because of the Flow, and avoid crediting a mere trigger-to-first-track remap as Leanings influence.

Internal artist/album adjacency must be an explicit, scoped exception after successful whole-group admission. Do not globally disable artist or album guards. Every aired member still contributes to later repetition checks.

Listener requests, manual queues, album blocks and automated fallback need explicit policies. Recommended request behaviour is expansion with an explanation that the requested track belongs to a Flow. Avoid recursively expanding members of an already resolved group. If an album block already contains the complete consecutive Flow, mark those existing items rather than inserting another copy.

## Phase 4 — atomic queue admission and recovery

Add a dedicated group-admission operation rather than repeatedly calling ordinary `push()`.

- Resolve and validate all members first, then recheck mutable restrictions at the actual admission boundary.
- Commit the complete group to durable queue state before waking the sender.
- Serialize admission against requests and other concurrent producers. No partial group may become playable during the commit.
- Give each occurrence a unique ID and each member its index/count, while retaining distinct track identities.
- Keep members contiguous. Queue moves, insertion and removal must operate on the group or explicitly break it through an operator action.
- Make retries idempotent: duplicate discovery or a repeated handoff must not append another copy.
- Preserve request origin, picker provenance and the reason the Flow was triggered.

Persist both the occurrence snapshot and delivery/playback progress. Recover queued and partially aired groups after a controller restart without replaying completed members. Mixer restart recovery is a separate case and must reconcile actual playback rather than assuming that persisted delivery means the audio aired.

A missing, blocked or unresolvable member before playback refuses the whole group. A failure during playback should abort the remaining group and use the normal safe fallback, with an explicit diagnostic. Do not spin or silently play only selected surviving parts.

## Phase 5 — protected audio and station scheduling

Implement the transport chosen by Phase 1 in `liquidsoap/radio.liq`, the controller sender and track annotations.

The protection must cover the whole pipeline, including mixer-owned jingle rotation and independent voice queues. Controller-only suppression of new DJ links is insufficient.

- Pre-resolve/preload the group before its first member starts.
- Suppress internal crossfades and transition gestures.
- Preserve member endpoints: bypass automatic silence trimming and cue cuts at internal joins.
- Keep ordinary entry/exit transitions outside the group.
- Prevent normal requests, fallback switching, jingles, beds and scheduled announcements interrupting its interior.
- Defer handovers and announcements with fresh scheduling after completion; avoid airing stale time/weather text or a stale handoff.
- Forecast the full duration and reserve the group’s scheduling span.

Review loudness processing explicitly. Independent per-track gain may introduce an audible level jump across an otherwise continuous album join. Prefer a shared album/Flow gain where supported, while retaining peak protection; document and test the chosen behaviour.

Preserve per-track now-playing, play history, scrobbling and Sleeve Notes identity. Avoid speech inserted for companion tracks. Generate any introduction for the actual first track and complete group, not the originally discovered later member.

The direct `auto.m3u` fallback must either support complete protected groups through the chosen transport or exclude enabled Flow members from its ordinary standalone entries. The latter is a reasonable first-release limitation if disclosed; do not claim universal Flow coverage while fallback can split members.

## Phase 6 — visibility and diagnostics

- Show one expandable Flow group in the queue, with ordered member rows and total duration.
- Show current progress, such as “Sub/Flow: Dark Side finale — 1 of 2”.
- Record trigger track, selection unit, definition revision, occurrence ID and discovery sources.
- Separate Flow expansion from Musical Leanings influence and subsequent guard changes.
- Log admission, delivery, member start/end, completion, cancellation and failure with a shared occurrence ID.
- Explain refusal reasons: missing member, blocked track, recent companion, insufficient show time or already queued.

## Verification and acceptance criteria

Use meaningful behavioural tests and rendered audio fixtures. Follow the repository’s required lint, type, schema-mirror and full-suite checks when the relevant areas change.

1. Picking any member queues exactly one complete group in the defined order on every supported route, including corrective and model-failure recovery.
2. Discovery of multiple members does not multiply selection opportunities or duplicate companions.
3. The first track’s fit and whole-group duration govern selection; a recent/blocked companion prevents partial admission.
4. Concurrent requests cannot split admission or insert a track inside the group.
5. Internal same-artist/same-album membership works, while subsequent unrelated selections observe normal cooldowns.
6. Audio renders demonstrate continuous internal joins and normal outside transitions for two and three members.
7. Jingles, speech, requests and handovers cannot intrude inside a playing group.
8. Length caps, silence trimming and show-boundary logic cannot sever its internal joins.
9. Now-playing, history, scrobbling and relevant Sleeve Notes records correctly identify each aired member.
10. Group editing, cancellation, duplicate triggers, ID rotation and controller/mixer restart recovery preserve coherent state.
11. A missing member or decoder/network failure produces a clear diagnostic and safe recovery.
12. Ordinary tracks, existing operator blocks, both pickers, Debug and Extended Sleeve Notes retain their established behaviour.

## Suggested delivery order

1. Decide the initial policies above and establish the rendered Liquidsoap proof.
2. Implement definitions, validation and manual protected Flow queueing.
3. Add atomic admission, durable recovery and queue presentation.
4. Integrate both picker routes, their guards and deterministic recovery.
5. Cover requests, album blocks and autonomous fallback under documented policies.
6. Run complete checks, then conduct long station tests with known continuous album tracks.

Keep the work in a dedicated feature branch and PR. Include an explanatory introduction in commits and a PR description explaining observable behaviour and validation. Develop and verify in an isolated checkout; preserve the station’s existing development integrations. The station owner runs Docker rebuilds, starts, restarts and diagnostics requiring Docker. Do not deploy the feature as part of preparing this plan.

## Decisions to settle before implementation

- Whether listener and manual selections always expand a Flow, or offer an explicit standalone override.
- Maximum group size and duration.
- Exact treatment of show boundaries for listener requests and long Flows.
- Whether original-endpoint protection also requires shared loudness gain by default.
- Whether the first release implements grouped autonomous fallback or excludes Flow members from that fallback.
- How an explicit mid-Flow stop should behave and be presented.

These choices can be resolved before development starts; they do not block producing this plan.
