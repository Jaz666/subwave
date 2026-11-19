# Sub/Beats eligibility and pick-time preparation plan

Status: proposed implementation plan, 19 November 2026. This plan changes the
Sub/Beats candidate and preparation flow so a recording is not held in that
path merely because its genre and BPM match. Shared-grid and cue evidence
first establishes which roles it can supply. Stem extraction and vocal
measurement then happen for a real pair at pick time, before the transition
type is finalized. A candidate that cannot supply the needed Sub/Beats role is
released to the regular Stem Blend path, which makes its own pick-time decision.

## Goal

For each selected transition, reach one explicit outcome:

1. **Sub/Beats confirmed:** the outgoing track has a usable Sub/Beats tail, the
   incoming track has a usable Sub/Beats head, the required stems are extracted
   and source-verified, and the vocal-activity check passes before a Sub/Beats
   render is armed.
2. **Released to Regular Stem Blend:** Sub/Beats cannot use the required role
   or the final Sub/Beats check fails. Regular Stem Blend gets an opportunity
   to select its own current tail/head windows and extract them at pick time.
3. **Ordinary transition:** neither stem path has complete evidence, sufficient
   deadline, or a successful final check.

“Dance Candidate” remains a broad discovery label, not proof of suitability
and not a reservation from regular stems. Eligibility is directional: one
track can have an incoming head, an outgoing tail, both, or neither.

## Why change the current flow

The current broad Sub/Beats admission is based on BPM 90–180 and a dance-genre
predicate. That is useful for finding candidates, but it does not prove that a
track has a current shared grid, an incoming cue, an outgoing cue, or saved
coverage for either role. The current preparation path derives cues and then
immediately separates cue regions and measures vocal activity. The current
Regular Stem pair policy also treats broad Sub/Beats eligibility as a blanket
reservation. A candidate with no usable Sub/Beats role can therefore miss both
Sub/Beats and regular Stem Blend preparation.

The scanned subset is already a useful warning: of 6,412 scanned Dance
Candidates, 4,448 lacked incoming cues and 4,526 lacked outgoing cues. These
figures overlap and do not describe the full 12,205-candidate pool. They show
why the genre/BPM candidate label should not be treated as role readiness.

## Target decision flow

| Stage | Work | Result |
| --- | --- | --- |
| Candidate discovery | Keep the existing Dance Candidate predicate as a broad, inexpensive discovery filter. | Candidate to screen; no stem reservation. |
| Grid and cue screen | Ensure current shared Beat This head/tail grids and derive/refresh role cues. Store outcomes separately for head and tail. | Sub/Beats role evidence, role-specific failure reason, or release. |
| Pair selection | For the actual outgoing-tail/incoming-head roles, check Sub/Beats grid/cue readiness, the existing Sub/Beats tempo/pair rules, and remaining handoff time. | Sub/Beats extraction request or release to Regular Stem. |
| Pick-time extraction | Extract only the exact cue regions required for the selected pair, using the regular pick-time CPU worker foundation where its contract fits. | Source-bound temporary stems, or a named extraction failure. |
| Vocal check | Measure vocal activity from the extracted vocal stems for the candidate cue regions and run the existing Sub/Beats vocal/conflict logic. | Confirmed Sub/Beats render, another already-covered cue choice, or release. |
| Regular fallback | Run Regular Stem Blend's independent current-grid, role-window, tempo and deadline checks; extract its exact windows if admitted. | Regular Stem Blend, or ordinary transition. |
| Handoff | Revalidate queue occurrence, source identity, evidence version, job completion and deadline immediately before arming. | One immutable transition handed to the mixer. |

The flow must not wait for Sub/Beats preparation if it cannot meet the handoff
deadline. Pending work is not an eligibility verdict. Completion must trigger
a fresh decision against the live pair and queue generation.

## 1. Define candidate, role and pair evidence

Replace the use of one broad boolean as the authority for both Sub/Beats and
Regular Stem Blend with explicit evidence dimensions:

- **Candidate:** genre/BPM discovery predicate matched. This may prioritize
  grid/cue screening, but does not reserve either track role.
- **Current source:** the grid, cue and any extracted stems refer to the current
  recording revision. Check source identity and size, and checksum where the
  extraction contract provides one. Stale or mismatched evidence is unusable.
- **Head role:** current shared head grid plus a Sub/Beats incoming cue and
  enough measured coverage for the requested extraction window.
- **Tail role:** current shared tail grid plus a safely placed Sub/Beats
  outgoing cue and enough measured coverage for the requested extraction
  window. Do not infer a real ending from a byte-capped prefix.
- **Extracted role:** verified stems cover the exact source interval selected
  for this queue occurrence.
- **Pair:** the outgoing tail and incoming head both have their required role
  evidence and pass current Sub/Beats pair/tempo policy.
- **Final Sub/Beats decision:** extracted evidence passes vocal activity and
  render checks before the pair is armed.

Represent head and tail independently. Missing one role must not erase or
invalidate the other. A missing Sub/Beats role should release that role to the
regular path; it should not trigger unnecessary Sub/Beats extraction for the
other end.

Give each stage a stable reason code, including candidate-not-matched,
grid-stale, head-cue-missing, tail-cue-missing, tail-placement-unproven,
window-too-short, source-changed, role-not-prepared, pair-tempo-rejected,
deadline-insufficient, extraction-failed, vocal-check-failed,
regular-role-ready, and ordinary-fallback. Keep human-readable logs tied to
track title/artist and role.

## 2. Screen candidates using shared grids and cues

1. Use the shared Beat This grid as the authoritative grid for this feature;
   do not revive legacy Librosa grids as fallback evidence.
2. Refresh head and tail outcomes independently for candidates that enter the
   screening flow. A successful head refresh with a missing tail is a partial
   result, not a fully current Sub/Beats record.
3. Derive or refresh cue candidates from the current grids and current source.
   Record each usable cue interval and its role. Do not require both roles for
   the track to remain useful.
4. Screen without Demucs. Candidates with no cue for the relevant role, no
   complete grid coverage, or no provable tail placement should leave the
   Sub/Beats role queue without stem extraction.
5. Keep the candidate scan bounded and resumable. Start with the current Dance
   Candidate population and report counts for head only, tail only, both, and
   neither; do not infer eligibility from genre counts alone.

This stage may still require downloading/decoding source audio for shared-grid
and cue work. It must not run Demucs or vocal measurement merely to classify a
candidate. Existing complete, current analysis can be reused; stale or
source-mismatched data cannot.

## 3. Split Sub/Beats preparation before and after selection

Refactor the current combined `prepareSubbeats` sequence into two explicit
parts:

### Before a pair is selected

- Validate source identity and current shared-grid provenance.
- Generate and save cue candidates and per-role grid/cue readiness.
- Do not separate stems and do not require saved Sub/Beats coverage for a role
  to count as a candidate.
- Release role-ineligible candidates to Regular Stem eligibility instead of
  leaving them reserved by the broad genre/BPM predicate.

### After a pair is selected

- Select the actual outgoing-tail and incoming-head cue candidates.
- Request only the exact stem regions needed to evaluate those candidates,
  including alternate cues only when the same bounded extraction covers them.
- Reuse verified saved Sub/Beats stems if they match the current source,
  separator/model version and requested intervals. Otherwise use the new
  pick-time extraction path; do not rely on the legacy standard stem cache.
- Measure vocal activity on the separated vocal stem and apply the existing
  Sub/Beats vocal, cue-conflict and render checks.
- Finalize the Sub/Beats decision only after those checks complete.

The vocal measurement remains based on the isolated vocal stem. Moving it to a
whole-track stage with the current algorithm would require whole-track stem
separation and would defeat the extraction savings. The pick-time extracted
regions provide the needed input without a second separation pass.

## 4. Route the pair to Sub/Beats, Regular Stems or ordinary transition

Change pair routing so a broad `subbeatsEligibleTrack` result cannot by itself
block Regular Stem Blend:

1. Try Sub/Beats only if this pair has role-specific head/tail grid and cue
   evidence, plus the existing Sub/Beats pair rules.
2. If either required Sub/Beats role is absent, stale, unextractable, or fails
   its final vocal/render check, pass control to Regular Stem Blend.
3. Regular Stem Blend independently checks its shared-grid provenance,
   eight-bar/native-tempo windows, complete matching source, the vanilla
   3%-with-half/double-equivalent tempo gate, and its own deadline. It must not
   consume Sub/Beats cues or declare Sub/Beats readiness to be regular role
   readiness.
4. If Regular Stem Blend is admitted, request its own exact CPU windows using
   its existing pick-time contract. Reuse an extraction only when source,
   interval, separator settings and output provenance are identical.
5. If neither path reaches a verified render before the deadline, choose the
   ordinary transition with the most specific available reason.

This replaces the blanket candidate-level Sub/Beats reservation with
role-specific routing. Preserve the existing Sub/Beats tempo rules and
transition style; this plan does not force a drums-late style or alter random
style selection. Pair compatibility remains distinct from track-level
eligibility.

## 5. Pick-time extraction and safety contract

Use the existing regular pick-time extraction foundation where possible, while
keeping Sub/Beats cue planning and outputs distinct:

- CPU-only separation for these pick-time jobs, including on GPU-equipped
  analyzers; do not load or run a GPU model for this path.
- Explicit source bounds for each role, with bounded CPU threads/concurrency
  and no uncontrolled whole-track separation.
- Complete-source and current-source identity checks remain mandatory unless a
  separately designed and validated range-extraction contract proves the same
  identity and true tail placement. A truncated download cannot establish a
  track ending.
- Validate requested samples, finite stem arrays, actual output coverage and
  completion metadata before accepting a result. Publish completion last.
- Key reuse to recording identity, exact interval, separator/model version and
  queue generation as applicable. A matching track ID alone is insufficient.
- Reuse a verified existing Sub/Beats region only when its provenance matches;
  never treat old standard stem-cache presence as readiness.
- Retain temporary files only for the active playback/queue working set and
  clean stale outputs after active jobs and mixer references release them.
- On timeout, source change, malformed output, worker failure or queue change,
  reject the Sub/Beats result and re-evaluate Regular Stem/ordinary fallback.

The Sub/Beats and Regular Stem Blend paths should share worker primitives and
CPU/resource limits where possible, not a semantic readiness flag or an
unverified cache. Preparation completion must re-check the exact live queue
occurrence before rendering; a late job may finish but cannot arm a stale pair.

## 6. Migration and compatibility

- Preserve current valid Sub/Beats saved stems and coverage records. Reuse only
  after source and separator provenance validation.
- Version the new role-readiness and pick-time evidence. Old broad eligibility
  rows are candidate hints only until refreshed; do not silently reinterpret
  them as current head/tail readiness.
- Keep old standard cache files untouched. They are not evidence for either
  new pick-time workflow.
- Make preparation resumable so existing library analysis and source data are
  not needlessly repeated. Refresh only the grid/cue facets required to settle
  missing or stale roles.
- Keep ordinary playback available throughout migration. A missing or failed
  Sub/Beats job must never hold the queue past its normal handoff deadline.
- Confirm the exact crossover policy while integrating with the current
  Regular Stem admission. This plan releases role-ineligible candidates to the
  regular path, but should not silently introduce a new mixed-mode renderer
  for a pair that was previously configured to use an ordinary transition.

## 7. Diagnostics and operator visibility

Emit per-track role states and per-pair decisions, distinguishing:

- broad candidate vs usable head/tail role;
- grid/cue screening vs extraction pending/complete;
- vocal-check result vs final transition verdict;
- Sub/Beats release reason and whether Regular Stem Blend accepted the pair;
- queue wait, extraction time, vocal-check time and remaining handoff budget.

The Mixing Desk can later display concise current/next role and pairing status
using the existing header icon proposal. This plan requires a stable status
contract first; it does not require redesigning the UI as part of the first
backend implementation.

## 8. Focused validation

Add targeted tests alongside each stage, keeping the initial test set small:

- Candidate genre/BPM match with no cues is not Sub/Beats-ready and is released
  to Regular Stem policy; it does not invoke Demucs during screening.
- Head-only and tail-only evidence are preserved independently and can supply
  only their matching transition role.
- A stale grid, changed source, missing tail placement, incomplete source,
  insufficient bars, or too-short extraction cannot be reported ready.
- Current cue/grid evidence with no saved stem coverage can reach pick-time
  extraction; matching saved coverage can be reused without another
  separation.
- Pick-time job requests exact regions and CPU, and rejects wrong device,
  incomplete coverage, invalid output and stale queue generation.
- Vocal activity is measured after extraction and before final Sub/Beats
  render admission; a vocal failure releases to Regular Stem policy.
- Regular Stem fallback applies its own 3% half/double-equivalent BPM rule and
  exact role-window/source requirements. Missing evidence falls through to an
  ordinary transition with an explicit reason.
- A pair is re-evaluated after asynchronous work; deadline expiry, skip,
  reorder, source replacement or worker failure cannot arm a stale seam.
- Current valid Sub/Beats saved artifacts remain reusable, and legacy cache
  files remain unchanged and ignored.

Use a few contrasting real tracks from the recently played test-station set
that have already passed through the shared-grid analyzer: Sub/Beats-ready at
both roles, head-only, tail-only, neither, and at least one non-Dance-Candidate
regular Stem Blend case. Exclude the previously identified unsuitable track.
Listen to any resulting transitions; technical checks alone cannot establish
that vocal overlap or the musical result is acceptable. Do not run a
library-wide Demucs pass.

## Implementation order and completion gates

1. **Policy contract:** define candidate, role and pair readiness plus stable
   reasons; remove broad genre/BPM eligibility as a regular-stem reservation.
2. **Grid/cue screen:** refresh shared head/tail grids and cue candidates
   independently; report role coverage counts and release no-cue roles without
   separation.
3. **Preparation split:** keep pre-pair work to grid/cues; make extraction and
   vocal measurement demand-driven after pair selection.
4. **Pick-time worker integration:** extract exact CPU-only Sub/Beats windows,
   validate source and queue identity, reuse only verified compatible results.
5. **Routing and fallback:** finalize Sub/Beats after vocal checks, then give
   Regular Stem Blend its independent pick-time opportunity, then ordinary
   fallback.
6. **Diagnostics and operator status:** expose per-role and per-pair states;
   keep user-facing icons as a follow-up on the agreed Mixing Desk status
   contract.
7. **Test-station rollout:** verify contrasting recent tracks from cold and
   warm working state, review timing and logs, listen to aired results, and
   preserve a rollback route before widening candidate refresh.

Do not remove the Sub/Beats tempo/pair checks, relax source-completeness or
tail-placement guards, force a transition style, run whole-track Demucs just
for candidate classification, or delete old caches as part of this work.

## Open implementation details

- Confirm which existing Sub/Beats cue alternatives the current vocal check may
  select after extraction, so the worker requests exactly the regions needed
  without extracting the entire track.
- Decide whether failed Sub/Beats vocal checks should always offer the same
  pair to Regular Stem Blend or only do so when its independent pair policy
  passes. Recommended default: always evaluate regular policy; it may accept or
  reject independently.
- Confirm the current crossover setting/behavior against the integration
  baseline before enabling a mixed Sub/Beats-to-Regular renderer. The role
  release should not change an existing ordinary-transition rule without an
  explicit decision.
- Measure cold/warm CPU extraction times and establish a realistic cutoff
  before the queue handoff deadline; a job that cannot finish in time should
  release immediately.

