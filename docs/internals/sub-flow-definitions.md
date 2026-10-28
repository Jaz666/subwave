# Sub/Flow definitions

The Library editor stores two- or three-track Flow definitions in the active
station's `sub-flows.json`. Saving resolves every track against Navidrome,
rejects missing or blocked tracks and overlapping enabled definitions, and
starts a background check. All members must be consecutive, in album order,
on the same album. The order check uses the complete unfiltered album, including
blocked or archived tracks, and rejects incomplete or ambiguous numbering.
Multi-disc boundaries are supported when their order is unambiguous. Updates
and deletes require the current revision. Disabling does not need the music
server, but enabling checks the track order again.

Definitions saved before the order check, or restored from backup, are marked
for an order check. They remain visible rather than being silently deleted or
changed. Playback integration must recheck the current album order before
admission, since the library may have changed after a definition was saved.

One worker at a time downloads each raw track, checks the response, hashes the
downloaded bytes and decodes the whole file with FFmpeg to measure its duration.
When the library reports a duration, a difference greater than two seconds
fails the check. Downloads are limited to 512 MiB per track and download and
decode operations each have a three-minute timeout. A later edit or deletion
cannot be overwritten by an earlier check. If the controller restarts during
a check, the editor offers the check again.

“Checked at save” describes a baseline, not proof that the original recording
was complete or has not changed since. Playback preparation checks the same
prepared bytes against the saved fingerprints before admitting a complete
Flow; it must not refetch a
different representation after checking. Unknown or stale library durations
cannot guarantee completeness, and decode success is not an audio-quality
guarantee.

Backups include definitions. Restore validates the file before changing state,
then clears fingerprints and marks each restored Flow for another check on the
destination station. Audio files and credentials are not included in this file.

## Join protection settings

Library → Sub/Flow has station-wide **Join protection** controls between the
builder and saved Flows. Before and after each join are separate whole-second
settings from 1 to 30, both defaulting to 5. They prevent speech, jingles and
duck recovery from covering the joins; speech may play elsewhere in the Flow.
Overlapping windows remain continuously protected.

The values live in `picker.flowProtectBeforeSec` and
`picker.flowProtectAfterSec`. Preparing a Flow captures both values in its
durable playback occurrence, so a later settings change does not alter a
queued or playing sequence. Older occurrences retain 5/5 protection. Entry
speech uses the before-join budget; outer crossfades respect the respective
before/after windows. Internal audio remains untouched.

Broadcast capability version 2 reads the separate window annotations and still
accepts older symmetric annotations. The controller accepts version 1 for
default 5/5 occurrences, but refuses custom windows until broadcast is rebuilt.
Rebuild controller, web and broadcast when installing this change. No further
restart is needed when the operator subsequently changes the settings.

## Deferred: listener-request integration

Listener-request expansion is deliberately deferred as of 2026-10-28 while
another contributor improves requests. Do not enable it as part of the current
Sub/Flow work. This follow-up accompanies the draft Sub/Flow PR. The
recommendations below are proposals, not approved request policy.

Automatic DJ selection and operator queuing from Library and Observatory
can expand an enabled Flow member into the complete sequence. The tested station
also integrates Extended Sleeve Notes, which is separate from this draft.
Listener requests still queue individual tracks. Their discovery
scope intentionally leaves `automaticFlows` off. Consequently, listener
requests do not currently receive the protected Flow playback contract.

### Existing integration points

- `controller/src/routes/request.ts`: asynchronous POST receipt and GET outcome,
  direct resolution, the special "more like this" path, agent result handling,
  acknowledgements, wait notices, rate limits and pending-request gates.
- `controller/src/music/request-match.ts`: direct catalogue identity,
  requirements, alternatives and named cooldown/duplicate refusal. Coordinate
  with the request contributor's changes here before implementing expansion.
- `controller/src/broadcast/dj-agent.ts`: the other request-matching mode;
  generates acknowledgements and introductions around the selected song and
  queues it itself. Updating only the route's direct path would be incomplete.
- `controller/src/broadcast/request-intro.ts` and
  `controller/src/util/request-{guard,claim}.ts`: optional intro generation,
  requester sanitisation, echo protection, host ownership and safeguards
  against announcing the wrong artist or title. Preserve these protections.
- `controller/src/music/sub-flow.ts`, `sub-flow-playback.ts` and
  `controller/src/broadcast/queue.ts`: exact-revision preparation, source and
  album-order verification, protected playback and atomic Flow admission.
  `queueFlow()` currently distinguishes automatic selection from studio
  operation; it has no listener ownership mode. Reusing its default would
  incorrectly mark a listener's Flow as an operator action.
- `web/components/skins/classic/drawers/RequestDrawer.tsx`, other request
  clients and the native app: audit outcome consumers together. Existing
  request outcomes describe one track and a queue position. Keep compatibility
  with clients that do not understand additional Flow information.

### Required behaviour and implementation work

1. **Preserve two identities.** Retain the actual requested/selected song and
   its member index separately from the Flow entry and immutable occurrence.
   Selecting member two or three must start the complete saved sequence at
   member one. Never relabel the requested song as the opener. For example,
   requesting Aerosmith's "Eat the Rich" can acknowledge that song and explain
   that its album "Intro" will play first.
2. **Introduce listener ownership.** Extend Flow admission deliberately rather
   than overloading `automatic` or setting `requestedBy: 'studio'`. Record the
   request/occurrence association durably enough for queue recovery and
   cancellation. Preserve the requester, ordinary request speech policy and
   correct dashboard attribution without counting every member as a separate
   listener request.
3. **Centralise final request admission.** Both matching modes and the special
   "more like this" branch must reach the same Flow-aware checks. Inspect
   membership before writing speech about what will play. Recheck availability
   after asynchronous work; a successful match does not reserve the queue.
   Do not make all `queue.push()` calls implicitly expand: playlists and other
   callers have different contracts.
4. **Reuse verified atomic playback.** Check mixer capability, enabled state,
   revision, complete source fingerprints, album adjacency, all-member
   blocklist and queue conflicts. Prepare the existing single WAV and append
   all members together. Dispose of prepared audio on admission failure.
   Once an enabled Flow has been selected for expansion, failure must never
   silently enqueue its selected member alone. Disabled/non-member behaviour
   and stale or unverified definitions need explicit coverage.
5. **Apply request protections to the whole unit.** Currently cooldown and
   duplicate checks concern the chosen ID. Check every companion too, and
   decide how to acknowledge a queued, playing or recently played companion.
   Recheck after preparation to cover concurrent requests. Preserve blocklist
   privacy and named-request refusal semantics; an expansion failure must not
   accidentally become an unrelated alternative through agent fallback.
6. **Fix accounting and waiting.** `queue.pendingListenerRequests()` currently
   counts upcoming rows with `requestedBy && !operator`; simply annotating all
   members would consume two or three slots. `stillInFlight()` follows
   `entry.pick.id` in current/upcoming IDs; that cannot express a whole Flow
   hold consistently when different members are requested. Count an occurrence
   once, retain the existing resolving-request count, and define when the
   listener's hold ends. Keep refusal, failed preparation, operator removal,
   whole-Flow skip, restart and lost-playback cleanup from leaving phantom
   holds. Request receipts themselves are currently in memory, not durable.
7. **Make acknowledgements and forecasts honest.** Return the requested song
   plus safe Flow name, sequence and actual entry information. Distinguish
   waiting until the opener from waiting until the requested member; include
   preceding-member durations for the latter. Define queue-position semantics
   explicitly rather than returning the tail after appending several rows.
   Public responses must not expose generated file paths or fingerprints.
8. **Adapt request speech before publication.** Explain the requested song's
   place in the sequence and attach speech only to the entry. Claim guards
   must understand both the opener and the requested member, so an honest
   mention of the later song is neither rejected nor presented as playing now.
   Reuse Flow entry-runway limits and omit speech when it cannot fit. Preserve
   request echo guards, budget/voice gates and host-change checks. Keep normal
   entry/exit transitions and the existing five-second protected windows on
   both sides of every internal join, including duck recovery and jingles.

### Decisions needed before implementation

| Question | Suggested starting policy (not agreed) |
| --- | --- |
| Which requests expand? | Start with explicit matched song requests in both matching modes. Decide separately how artist, album, mood, alternatives and "more like this" selections interact with enabled Flow membership; do not silently split a Flow as a shortcut. |
| Which length rules apply? | Consider automatic Flow admission rules for expanded requests: per-member maximum with the existing Flow override, plus complete-sequence fit before a firm show finish. Ordinary listener requests currently bypass length limits, so this would be a deliberate policy change for expansion. Decide whether an additional total-Flow cap or request-specific override is wanted; neither exists today. |
| Which cooldown applies? | Check every member using the configured request repeat cooldown, preventing another member from bypassing repeat protection. |
| When is a request served? | Count the Flow once while waiting; retain the per-listener hold until the complete Flow finishes rather than releasing it when its opener or requested member ends. These are separate counters today. |
| What if this Flow is already queued or playing? | Acknowledge the existing occurrence without appending a duplicate. Say whether the requested member is still coming, playing now or has already passed. Decide whether this attaches a new listener hold/dedication; existing duplicate refusals do not. |
| What if a different Flow is queued or playing? | Keep the current one-Flow-at-a-time limit and honestly decline expansion. Deferral would require additional queue/preparation design. Never silently play a fragment. |
| What if a definition becomes unusable? | Fail the complete request clearly, without leaking blocklist details or silently substituting. Keep ordinary behaviour for disabled definitions unless a different policy is agreed. |

### Acceptance coverage for the follow-up

- Direct, agent and model-free fallback requests for each of members one, two
  and three; missing/disabled definitions preserve the agreed ordinary path.
- Artist/mood/album/alternative and "more like this" outcomes follow the
  chosen scope consistently; explicit genre/language requirements are not
  accidentally invalidated by inserted companions.
- Companion cooldown, on-air/queued conflicts, changed source, blocked member,
  unverified definition, stale revision and unsupported mixer refuse without
  partial append or leaked prepared audio.
- Concurrent requests for the same/different Flows, and a definition edit or
  disable during preparation; no duplicate, wrong attribution or false success.
- One pending slot per occurrence, correct IP hold for each requested member,
  and no phantom holds following refusal, failure, skip, removal or restart.
- Agreed track/total length exemptions and overrides, plus firm show boundaries
  at admission and handoff, including a Flow that no longer fits after waiting.
- Honest acknowledgements, requested-member timing, stable queue position,
  public metadata allowlists and compatible web/native outcome rendering.
- Short openers, later-member requests, voice/budget changes, host changes,
  request injection/echo and wrong-title guards; no speech/jingle or duck
  recovery inside protected join windows. Failed optional speech must not lose
  otherwise accepted music.

Before coding, reconcile this map with the other contributor's final request
pipeline and agree the policy table. Prefer one shared admission point in that
pipeline over copying the current branches. Run the existing request suites
alongside new Flow request cases and the protected-playback regressions.
