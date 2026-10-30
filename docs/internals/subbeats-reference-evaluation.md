# Annotated compilation reference evaluation

The eight owner references in `subbeats-reference-tracks.json` are development
fixtures, not production overrides. Their timestamps anchor the proposed windows;
MixMeister's displayed bar counts are estimates, not a verified phrase origin.
In particular, Diving Faces resolves at **00:27**, with a suitable 16-bar window.
This supersedes the earlier 00:25 / shortened-intro interpretation in the rollback
notes. A displayed count of 15 does not establish that a bar is missing.

Madagascar's measured sustained kick tempo is **140.30 BPM**, independently
confirmed by the owner's MixMeister reading of **140.3**. Its cached 105.25 BPM
reading is a 3:4 alias. The preferred resolve is 01:36 because earlier entry points
leave a long unchanged drum pattern before musical variation; earlier resolves
remain possible.

## Read-only cache audit

Run `controller/scripts/subbeats_reference.py --state-dir PATH --references
docs/internals/subbeats-reference-tracks.json` in the analyzer Python environment.
It verifies prepared bundle integrity and reads stems without modifying the cache.
Tempo candidates require kick evidence. A short four-bar fit is explicitly marked;
the production preview still requires its existing default 64-beat fit.

| Track | Kick BPM | Nominal intro start | Limitation |
| --- | --- | --- | --- |
| Mystery Land | unconfirmed | 00:28.87 (16 bars, cached tempo estimate) | No sustained kick fit |
| Suburban Train | 136.51 | −00:01.13 (16) | Listen and align near source boundary |
| 1998 | 140.31 | 00:13.63 (16) | Window covered |
| Diving Faces | 140.35 | −00:00.36 (16) | Listen and align near source boundary |
| Beachball | 140.21 | 00:13.15 (4) | Window covered |
| The Orange Theme | 140.32 | 00:00.32 (8) | Window covered |
| Madagascar | 140.30 | 01:08.63 (16), 00:41.26 (32) | Resolve beyond cached head |
| Universal Nation | 140.34 | 00:40.64 (16), 00:13.28 (32) | No cached followthrough after resolve |

Negative nominal starts expose uncertainty in whole-second annotations and source
alignment; they do not prove a shortened musical phrase. All eight existing exit
stem regions end before the actual file ends, so a natural-outro audition cannot
simply stop at the prepared exit boundary.

## Controlled auditions

Two offline controls use **1998 → Universal Nation**, with the former's 03:39
outro and the latter's 01:08 resolve. Quarter-beat alignment adjusts these to
218.883 and 67.990 seconds respectively; no phrase origin is inferred from zero.
The incoming window is either 16 or 32 bars. Original outgoing audio plays to its
real end, handing over across one beat to a four-bar drums+bass loop. Both clips
share the same final peak gain.

These controls use a full-mix equal-power crossfade with a drums+bass extension,
**not Stem Blend or an automatic phrase detector**. Incoming tempo remains matched
throughout the audition. Placement and musical suitability still require listening.

| Preview event | 16 bars | 32 bars |
| --- | --- | --- |
| Transition begins | 00:04 | 00:04 |
| Original outgoing file ends; loop continues | 00:17.95 | 00:17.95 |
| Incoming resolve | 00:31.38 | 00:58.75 |

Development audio, the renderer, audit JSON and render results are saved outside
Git in `/home/jaz666/codex/driving-beat-evaluation-20261028/`. Full source decoding,
time stretching and rendering ran on the test machine's CPU. Existing prepared
stems were read; there was no new separation, GPU work, live playback change or
cache rewrite. The browser preview remains at the rolled-back version 4 behavior.

The analyzer test runner includes reference-window arithmetic, tempo-alias kick
evidence, unchanged default long-fit behavior, fixture checks and a read-only
cache audit. These do not establish that automatic resolve detection is solved.
