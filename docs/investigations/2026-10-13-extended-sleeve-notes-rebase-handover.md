# Extended Sleeve Notes / Station Brain — handover for 13 October 2026

This note captures the current checkout and recent GitHub housekeeping so a new chat can continue without replaying the long conversation.

## Current GitHub state

- Repository: `/home/jaz666/Docker/subwave`
- Local branch: `test-station/live-integrated-sleeve-notes-20261006`
- PR branch: `Jaz666/subwave:feat/extended-sleeve-notes`
- PR: [Jaz666/subwave#5](https://github.com/Jaz666/subwave/pull/5), open and draft
- PR title: `feat: add Extended Sleeve Notes collection and link selection`
- PR head: `db84db8c1b104418afee93ce45ce4fc51b19622b`
- Rebased onto Perminder's upstream `develop` at `254753ad9f84e065befffb1889e247f1f7eec360` (version 1.22.0). The PR base is `develop`.
- Latest rebase integration commit: `db84db8c fix(rebase): reconcile picker integration with develop`.
- PR currently contains 294 changed files, approximately 29.6k additions and 1.8k deletions. This branch contains all accumulated work, including Shortlist/Leanings and Station Brain changes, so the PR is much broader than its title suggests.
- A pre-rebase safety branch exists: `backup/extended-sleeve-notes-before-rebase-20261013`.

The rebase rewrote the PR branch and used `--force-with-lease`; PR #5 now points at `db84db8c`. One old release commit for 1.20.0 was skipped because upstream `develop` is already at 1.22.0. The local worktree was clean after the push.

## Recent integration fixes

The rebase exposed overlaps with upstream's Track Shortlist refactor. These were resolved to retain the newer shared selection route while preserving this branch's predecessor context, show playlist order, transition guidance and Station Brain work. The final integration commit also:

- removed duplicate predecessor imports and duplicate event/predecessor declarations in `controller/src/broadcast/dj-agent.ts`;
- restored the Musical Leanings event clause;
- updated `enqueuePick` to pass `selectionShowAt` through to the queue, matching current queue APIs;
- updated the quiet-gate call to the current zero-argument `playbackCriticalBusy()` signature;
- adjusted link trimming to the current `trimLinkToIntro` signature.

These fixes are in PR head `db84db8c`.

## Verification status

- `git diff --check`: passed.
- `web`: `npm run typecheck` passed.
- `controller`: `npm run typecheck -- --pretty false` still exits nonzero, with errors confined to existing script/test TypeScript call sites after the source errors from the rebase were fixed. Reported issues:
  - `scripts/llm-pure.test.ts`: `ToolCallSummary.round` missing in fixtures;
  - `scripts/speech-label-boundary.test.ts` and `scripts/speech-year-routing.test.ts`: helper calls pass an obsolete third argument;
  - `scripts/track-length-lookahead.test.ts`: fixtures still use `showAt` where the current enqueue option is `selectionShowAt`;
  - `scripts/verified-facts.test.ts`: helper arguments no longer match the current signature.
- No tests were run in this housekeeping turn.

A fresh chat should decide whether to update those stale test/script call sites before requesting a full controller typecheck. The current typecheck output had no remaining errors in controller `src` files.

## Product context and recent decisions

### Extended Sleeve Notes

Extended Sleeve Notes researches Wikipedia artist and album articles in sections, stores ranked claims, and can offer Story Sparks for DJ links. User-customized prompts support `{wikiNumber}` with separate artist and album claim counts. Chunk sizing adapts from observed latency and context, targeting an appropriate context budget relative to the station's picker calls. The Config work includes prompt preview and claim reset/refresh policies. The refresh/replace option keeps existing claims and schedules fresh research when each artist/release is encountered, avoiding a bulk research backlog.

Research jobs are ordered by article section, with Album before Artist within a section. Queue display is grouped by these subqueues. Auto Playlist work is capped to avoid runaway queues; the owner previously proposed only enqueueing more autopilot research when the queue is empty. Off-air research cadence has a two-level window: every 60 seconds until Wiki average latency is at or below 15 seconds, then every 30 seconds. The owner monitors station behavior and runs Docker commands locally; do not run Docker commands for them.

Track-level Genius connections (samples/covers/writer/producer) are being matched against local library tracks by a background connection-library worker. Verified local matches are prioritized for Sparks and retained unresolved connections remain available for the Graph. See [the connections/library handover](2026-10-12-sleeve-notes-connections-library.md).

### The Station Brain

The Connections visualizer is named **The Station Brain**. It opens at artist scale using local library artists, with connections as neural pathways. It uses the 2D `react-force-graph-2d` renderer; 3D was removed. It has a full-screen overlay, manual refresh, target-current-artist/track actions, double-click artist/album drilldown, layer navigation, layout choices, map-key filters (including library artists not yet encountered), and a slider limiting how many reachable connections are highlighted from the selected node. The controller read is bounded and cached; local library artists can appear without generating encounters or research jobs. See [the Station Brain visualizer handover](2026-10-12-dj-brain-connections-visualizer.md).

## Recommended starting point for a fresh chat

1. Read this handover plus the two linked 12 October handovers before editing.
2. Confirm `git status`, current branch and PR head. The current branch already tracks the PR head after the last push.
3. Keep upstream remote `origin` pointed at `perminder-klair/subwave`; the PR remote is `jaz666`.
4. Ask the owner before any new Docker/rebuild action; they run those commands locally.
5. Continue with the owner's next requested task rather than expanding the current housekeeping scope. The immediate open housekeeping question is whether to update stale controller typecheck fixture/call-site errors so `npm run typecheck` passes end to end.
