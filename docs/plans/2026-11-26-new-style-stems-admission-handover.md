# New Style Stems: track admission and preparation handover

Updated: 26 November 2026. Scope: make as many tracks as practicable available
to later pick-time decisions by improving their measured head/tail evidence.

## First implementation

Branch `codex/stem-blend-admission-20261126` starts from draft PR #10 commit
`d4698f344`. It adds an explicit library pass for Regular Stem Blend tail
evidence. Run it from the controller directory after enabling New Style Stem
Blends and building an analyzer image from this source.

```sh
npm run analyze -- --prepare-stem-blend-admission --limit 25 --dry-run
npm run analyze -- --prepare-stem-blend-admission --limit 25
```

Use `--ids id1,id2` or `--ids-file path` for a fixed cohort. The pass defaults
to 25 tracks and accepts a limit of 1–200. The default scope is missing or
failed evidence for known-size files. It picks queued grid misses first among
unattempted tracks. `--re-analyze` refreshes completed evidence. The CLI uses
the existing acoustic maintenance lock, quiet-hours gate, progress reporting,
and analyzer device defaults. Schedule the first listening-library cohort
during a maintenance window because the bulk lock defers pick-time work.

The pass reuses the 60–120 second tail sizing and measures the enlarged
window from a verified complete recording. It stores absolute decoded
coverage, audible bounds, a measured fade cue when present, the measured
beats and bars, and their provenance in `stem_blend_tail_admission`. With a
cold ending or no distinct fade, the measured music end is the fallback.
`gridStatus` distinguishes a valid grid, a measured window without usable
bars, and a model failure. The library read checks identity and the schema.
Four-, six-, and eight-bar counts are derived from the saved markers before
the fade cue or fallback endpoint. Use the before and after report for the
same selected cohort.

The next acceptance step is a representative audio cohort. Head preparation
continues through the existing grid refresh. Wiring the wider tail evidence
into automatically scheduled preparation or a Library UI control is a
separate follow-up. Pair policies and live transitions continue to use the
existing data readers.

## Start here

The owner's latest clarification takes precedence over earlier plans:

> We are only concerned with "admission", ensuring as many tracks are
> available to the pick-time decisions as possible.

Here, **track admission** means retaining usable, source-matched preparation
evidence. It does not mean approving a particular pair or promising that a
transition will render. Another chat owns pair selection, tempo adjustment,
stem extraction, rendering, EQ and listening trials.

The immediate problem is that a complete eight-bar span before the existing
wind-down is a useful steady-beat requirement but too restrictive as a blanket
test of whether other genres have useful preparation data. Separate that live
consumer's requirement from the evidence the preparation process retains.

## Locations and state

- Integration station: `/home/jaz666/Docker/subwave`, branch
  `test-station/ordered-pr-union-20261118`. Read-only inspection for this
  handover found a clean working tree at `8f8367ab0`,
  `fix(stems): make pick-time grids source complete`.
- Existing development worktree and home of this document:
  `/home/jaz666/codex/pr10-integration-20261118`, branch
  `codex/subbeats-role-policy-station-20261120`. It has extensive pre-existing
  uncommitted source, test and documentation changes. Preserve them. It is
  not an up-to-date copy of all station fixes.
- Before coding, read `STARTHERE.md`, `HANDOFF.md`, the applicable scoped
  controller guidance, and inspect branch/status again. Develop under
  `/home/jaz666/codex/` using a suitable checkout containing the latest station
  fixes; do not copy older development files over the newer station code.
- The old general handover,
  `docs/plans/2026-11-20-stem-blends-subbeats-handover.md`, is historical context
  and has a 24 November checkpoint. Its old V1-preservation and deployment
  instructions do not describe all subsequent work.
- No station services, runtime data, PRs or production settings were changed
  in this handover session. This new document is intentionally left local and
  uncommitted alongside the existing development changes for the next chat.

## Owner decisions and boundaries

- Work applies to opt-in **New Style Stems** only. Legacy means vanilla
  upstream Stems; leave its options, defaults and behavior intact.
- "Regular Stem Blends" in recent discussion means the New Style non-Beats
  path, not Legacy Stems.
- Use **Stem Beats** for the V2 feature. V1 Sub/Beats is retired and must not
  be revived as a preparation source or live fallback.
- Use the configured stems root if files are needed, with `stembeats/` or
  `stemblends/` subdirectories. Never assume an operator's host mount path.
- Library preparation measures evidence; Demucs extraction belongs to later
  pick-time work. Do not introduce bulk stem extraction for admission.
- Do not introduce another whole-track tempo-fit test or broaden unrelated
  discovery rules in this task.
- A failed/deferred pick-time evidence refresh must remain eligible for the
  durable library catch-up process. Avoid depending on a track being picked
  again before it can become ready.
- Preserve Extended Sleeve Notes, Sub/Flow, Sub/Shows and the controller stall
  fix if later integrating a candidate into the station.

## What the investigation established

The main blocker was **tail grid coverage**, not simply absent Stem Beats
tail cues. These are separate pieces of evidence: measured beat/bar markers,
their actual coverage, and a musically selected cue/wind-down.

The vanilla base tail-analysis window is controlled by
`ANALYZE_OUTRO_SECONDS`, default **20 seconds**. New Style's Regular grid
refresh already requests **60–120 seconds**, sized from measured spacing and
the saved fade. However, the worker's `regular_tail_grid()` explicitly widens
the grid **without moving/re-detecting the existing fade cue**. Wider grid
coverage alone therefore does not fix a cue constrained by an earlier short
analysis window.

Current live Regular selection uses `eightBarWindow()`: eight bars require
nine real markers inside measured coverage and, for the tail, before the saved
wind-down. That requirement still exists in the live selection/rendering path.
Changing it is outside this task. Keep useful shorter evidence available for
the other chat to consume later.

Historical read-only DB investigation on 26 November reported:

| Snapshot measure | Tracks |
| --- | ---: |
| Tail role candidates at four bars | 7,432 |
| Tail role candidates at six bars | 5,533 |
| Tail role candidates at eight bars | 3,816 |
| Usable head, no current source-matched tail grid | 2,858 |
| Usable head and matched tail/cue, no eight-bar span | 5,628 |
| Of that last group, tail coverage at most 20 seconds | 5,619 |
| Current tail grid but no cue, in the inspected cohort | 12 |
| Eight-bar tail span plus usable head | 3,773 |
| Durable pick-time grid catch-up queue | 64 |

These are earlier snapshot results (DB last-write time reported as
`2026-11-26 10:02:00 UTC`), not fresh counts verified for this handover.
The role counts have different predicates from the usable-head cohort;
they are not compatible-pair counts. Reproduce definitions and counts before
using them as a new baseline. Do not sum overlapping populations.

## Recent fixes to retain

The library-scan investigation exposed incomplete source downloads as well
as grid coverage problems. Do not assume every missing tail is a detection
failure or a missing stored stem file. Complete decoded source audio and its
actual end are essential. A successful head measurement does not establish
that the tail was downloaded.

Recent station commits include:

- `665beb163 fix(analyzer): keep acoustics when shared grid fails`
- `1ae820272 fix(analyzer): preserve tail results when grid fails`
- `03712e9ee fix(analysis): finish tail backfills and honor scan selections`
- `8f8367ab0 fix(stems): make pick-time grids source complete`

The last commit changes queue scheduling, beat-grid upgrade, source/grid DB
handling and `regular-tail-grid.ts`. Prior-session evidence recorded a passing
controller typecheck. This handover did not rerun it or inspect live containers.
Preserve independent head/tail refresh attempts and source completeness checks.
Do not let a failed optional grid measurement discard unrelated acoustic or
vocal results, or enable an unselected vocal/Demucs scan.

## Proposed implementation sequence

1. **Define track evidence independently of pair decisions.** Reuse the
   existing measured grid/provenance representation where possible. Retain
   head and tail independently, with actual coverage, source identity, cue
   origin and available consecutive bar spans. The earlier proposal suggested
   recording four/six/eight-bar availability; four bars is a useful candidate
   span, not an instruction to discard every shorter or irregular track.
   No BPM pair gate should decide whether to prepare or retain track evidence.

2. **Measure enough tail for New Style cue detection as well as the grid.**
   Start with the existing 60–120-second sizing, allowing space before the
   detected wind-down for an eight-bar candidate. Run the appropriate cue
   detector on that wider, completely decoded tail. Keep New Style cue evidence
   distinct from vanilla cue/talk-over data; inspect current schemas/readers
   before choosing the smallest backward-compatible representation. Do not
   globally change `ANALYZE_OUTRO_SECONDS` or overwrite Legacy cue semantics.

3. **Retain an explicit no-cue fallback.** If no reliable musical cue is found,
   preserve the real measured music end and usable preceding tail coverage.
   When measured bars exist, retain a span sufficient for an eight-bar intro
   where possible, and shorter spans where that is all the evidence supports.
   Mark fallback separately from a detected cue. Do not invent bar markers,
   pad beyond decoded audio, count silence as usable music or claim that a
   fallback is a verified Stem Beats cue. How a particular pair uses this tail
   is the other chat's decision.

4. **Provide an explicit, bounded library catch-up route.** The existing
   durable queue contains pick-time misses, not the entire library. Inspect
   how normal acoustic/shared-grid scans enumerate missing/stale evidence;
   extend the appropriate New Style scan to include missing or short tails
   without silently adding thousands of tracks to a small selected run.
   Honor scan limits, Run/Re-scan semantics, progress totals, stop/resume and
   device settings. Use existing job priority so pick-time retains priority;
   do not build a second scheduler. Distinguish adequately measured no-grid
   results from missing/failed work to prevent endless retries.

5. **Report preparation results and hand off the contract.** Produce before/
   after counts for measured head, measured tail, source mismatch, short
   coverage, available span lengths, detected cue, no-cue fallback and genuine
   analysis failures. State populations precisely. Document fields and reader
   behavior for the other chat. Live pair admission and rendering can remain
   unchanged while the richer evidence is prepared.

This is a proposed sequence, not a claim that its data contract or cue
algorithm has already been implemented. Resolve the storage/consumer contract
first so both chats do not independently redefine the same fields.

## Code map in the station checkout

| Area | File |
| --- | --- |
| Grid refresh sizing, completeness, durable catch-up worker | `controller/src/music/regular-tail-grid.ts` |
| Persisted pick-time catch-up IDs | `controller/src/music/library-db/regular-grid-scan.ts` |
| Acoustic scan and catch-up integration | `controller/src/music/analyze.ts` |
| Source/grid writes and provenance handling | `controller/src/music/library-db/tracks.ts`, `rows.ts` |
| Complete source download/lease | `controller/src/music/regular-stem-source.ts` |
| Shared-grid pick-time upgrade | `controller/src/music/beat-grid-upgrade.ts` |
| Base tail and extended grid analysis | `controller/scripts/analyze_worker.py` (`OUTRO_SECONDS`, `regular_tail_grid`, `regular_head_grid`) |
| Current eight-bar consumer, reference only | `controller/src/broadcast/regular-stem-policy.ts`, `regular-stem-needs.ts` |
| Other live consumers, coordinate before changing shared fields | `controller/src/broadcast/stem-blend.ts`, `regular-stem-runtime.ts`, `queue.ts` |
| Stem Beats V2 preparation/readers | `controller/scripts/subbeats_prep_v2.py`, `controller/src/music/subbeats-prep-v2-store.ts`, `subbeats-prep-v2-library.ts` |

## Separate offline BPM experiment

The owner is considering these trial ranges in the transition chat:

- Stem Beats: current directional 8% baseline; trial up to a 12% symmetric
  pair gap, with neither track adjusted more than 6% from native tempo.
- Stem Blends: compare current 3% with 6% and 10% pair gaps in both orders.

They are **offline trials, not approved production settings**. They must not
become restrictions on which individual tracks this task prepares. See
`docs/plans/2026-11-25-stems-tempo-eq-and-clash-control-plan.md` for that separate
work; do not implement its rendering/EQ plan as part of this handover.

## First action and acceptance

First trace, in a development checkout containing the station fixes, how the
base tail cue and extended tail grid are produced, stored and read. Specify
the smallest additional New Style evidence needed to retain a wider cue scan,
a clearly marked end-of-music fallback and useful shorter spans. Then implement
that preparation contract with the library path; coordinate it with the other
chat before altering any shared live-reader semantics.

Verify with a bounded representative cohort: steady dance material, other
genres, short tracks, fade endings, no clear cue, no reliable grid and decoded
EOF discrepancies. Check source replacement, existing-data compatibility and
Legacy behavior. Run appropriate focused checks and typecheck for code changes.
Judge this task by increased usable preparation evidence, not by transition
counts. No code tests were run for this documentation-only handover.
