# Stem Blends and Sub/Beats handover

Updated: 20 November 2026. This handover summarizes the current Regular Stem
Blend work, Mixing Desk updates, the pending-grid timing correction, and the
next Sub/Beats investigation/implementation step. The combined work is in the
[draft PR #10](https://github.com/Jaz666/subwave/pull/10).

## Current work locations

| Purpose | Location and state |
| --- | --- |
| Development / PR source | `/home/jaz666/codex/pr10-integration-20261118`, branch `codex/pr10-integration-20261118`, tracking `jaz666/feat/subbeats-draft`. Current PR head includes `e27150bb6`. |
| Test-station integration checkout | `/home/jaz666/Docker/subwave`, branch `test-station/ordered-pr-union-20261118`. The pending-grid correction is committed there as `10bcfaa92`; the controller has not been rebuilt since. The checkout still has many other uncommitted changes, including unrelated work and changes to the same runtime file. Do not reset or clean it. |
| Draft PR | [Jaz666/subwave#10](https://github.com/Jaz666/subwave/pull/10), open draft, `feat(stems): integrate Sub/Beats and regular Stem Blends`. |

To make the station commit live, run from the station checkout:

```bash
docker compose up -d --build controller
```

The controller has not yet been rebuilt or restarted for `10bcfaa92`.

## Work completed

### Regular Stem Blends

- Added a separate pick-time Regular Stem Blend path using measured shared
  Beat This `small0` head and tail grids, exact role windows, source identity
  validation and CPU-only stem extraction.
- Head and tail readiness are handled separately. The preparation path checks
  the required windows and falls back to an ordinary transition when evidence
  or time is insufficient.
- Regular Stem Blend remains open to non-Dance genres. Its pair tempo rule is
  vanilla's 3% tolerance, including clean half/double-time equivalents.
- During testing, both head and tail preparation were allowed to generate
  freely. This was for observation and is not necessarily the final production
  preparation policy.
- Stem style selection remains as implemented; no forced drums-late behavior
  was introduced.

Details and implementation history are in the [Regular Stem Blend
implementation plan](2026-11-17-regular-stem-blends-implementation.md).

### Mixing Desk

- Added stem-readiness information to the Mixing Desk as part of the combined
  PR work, following the theme's Faint Text and Accent colors.
- The UI concept discussed in this chat places current-track status icons in
  the Mixing Desk header and moves timeline-sync controls onto the Auto row so
  the collapsed panel is more compact. Each icon needs a tooltip; narrow/mobile
  space remains a design constraint.

### Grid timing correction

The log line `pair blend 6s` reports the ordinary pair crossfade duration; it
does not mean a stem blend was chosen. The logs did expose a race: the queue
could evaluate Sub/Beats and Regular Stem fallback before an incoming shared
head grid finished, because the pending check required an already-admitted
regular pair. Missing BPM prevented that pair admission, so its pending grid
was ignored.

The pending check now waits for the outgoing tail or incoming head grid while
there is still time before the normal handoff deadline. When analysis
completes, the pair is reconsidered; after the deadline the normal fallback is
allowed. The fix is `e27150bb6` on the PR branch and `10bcfaa92` in the test
station checkout. It has not yet been rebuilt on the station.

Other standard transition effects use existing library/track BPM, key and
outro data rather than shared Beat This head-grid evidence. Their behavior is
not gated on that grid refresh. Missing classic BPM/key can affect those
existing calculations, but it is a separate issue from this pending-grid race.

## Sub/Beats: current findings and next design

The current Sub/Beats admission is a broad candidate predicate (dance genre and
BPM range), while actual usefulness is directional: a track may have a usable
incoming head, outgoing tail, both or neither. In the scanned 6,412 Dance
Candidates, 4,448 lacked incoming cues and 4,526 lacked outgoing cues. These
counts overlap. The larger library has 12,205 Dance Candidates out of roughly
72,000 tracks.

Current preparation measures grids/cues and then separates cue regions and
measures vocal activity. The regular path can also blanket-reserve broadly
eligible Sub/Beats tracks even when their needed role has no usable cue. This
may block tracks from both routes.

The proposed flow is documented in the [Sub/Beats eligibility and pick-time
preparation plan](2026-11-19-subbeats-eligibility-pick-time-preparation-plan.md).
In short:

1. Treat Dance Candidate as discovery only, not as proof of readiness or a
   reservation from regular stems.
2. Refresh current shared head/tail grids and cue evidence independently,
   without running Demucs just to classify a candidate.
3. At pair time, extract only the required Sub/Beats regions on CPU, then run
   the vocal activity check before the final Sub/Beats decision.
4. If the needed Sub/Beats role or final check fails, evaluate Regular Stem
   Blend independently, then use the ordinary transition if neither path is
   ready before the deadline.

The plan is proposed; this new Sub/Beats eligibility/preparation flow has not
been implemented. Pair crossover behavior should be confirmed during
integration; do not silently introduce a mixed-mode renderer.

The user has approved starting Sub/Beats preparation from scratch on the test
station when this is implemented. That means the implementation can discard
old Sub/Beats-specific cue, eligibility, coverage and prepared-stem state and
regenerate it. Keep shared Beat This grids, library metadata and unrelated
analysis; leave old standard stem-cache files untouched. This approval is for
the future implementation rollout, not a reset already performed.

## Suggested next steps for a fresh chat

1. Rebuild the test-station controller from `/home/jaz666/Docker/subwave` and
   confirm the grid-pending fix behaves as expected in the next eligible pair.
2. Continue from the Sub/Beats plan linked above. First verify the current
   station and PR source state; the station checkout has many unrelated local
   changes and should not be cleaned or replaced wholesale.
3. Implement the role-specific grid/cue screening and remove broad
   candidate-level reservation only after the exact pair routing and fallback
   behavior are explicit.
4. Move Sub/Beats extraction to pick time, run its vocal check before final
   admission, and retain the handoff deadline and source-integrity guards.
5. Use the approved clean Sub/Beats preparation reset only during the scoped
   station rollout, then listen to representative Sub/Beats-ready, partial-role
   and non-Dance regular-blend tracks.

