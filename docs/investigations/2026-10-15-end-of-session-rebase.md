# End-of-session upstream rebase — 15 October 2026

## Checkouts and recovery

- Station checkout: `/home/jaz666/Docker/subwave`.
- Active feature branch: `test-station/sleeve-notes-clean-20261014` (name retained).
- New vanilla baseline branch: `test-station/upstream-develop-20261015`, exactly upstream `origin/develop` at `a078b90c` (1.23.0).
- PR: https://github.com/Jaz666/subwave/pull/5, draft, fork head `feat/extended-sleeve-notes`, base `develop`.
- `backup/sleeve-notes-before-session-save-20261015` preserves the previous published head `fc5341d3`.
- `backup/sleeve-notes-before-rebase-20261015` preserves the full session checkpoint `21a8591f`, including previously uncommitted work.
- `/home/jaz666/subwave-review-notes/housekeeping-20261015/` contains an independent tracked patch, an archive of the untracked session files, the prior refs and checksums of the station-local configuration. These are recovery artifacts, not station state backups.

All 73 changed/new session files were committed before rebasing. The two feature commits were replayed onto the 33 new upstream commits. The active station checkout contains the rebased feature; switching to vanilla and rebuilding is unnecessary for this update.

## Integration decisions

Conflicts were limited to the settings-schema inventory, speech-render integration, named-agent wrapping, LLM failover/telemetry and lockfile key ordering. Upstream's per-clip voice levelling and `finishClip` path remain intact, with Sleeve Notes speech tracking following successful rendering. Upstream's removed experimental `speakExchange` helper stays removed; conversations continue through ordinary per-speaker rendering and confirmed air callbacks.

Named agents retain upstream's phase timings and native director silence acceptance while wrapping their work in the research-priority marker. Failover retains upstream's sticky down-primary routing, timeout/answer distinctions and backup diagnostics. Explicit research deferrals carry their cause/signal through every failure-recording path, including an already-sticky backup route. Both upstream and feature failover tests are retained as separate top-level tests.

The schema and theme mirrors were regenerated without drift. Station `.env` and the ignored `docker-compose.discord.yml` overlay still match their pre-rebase checksums. Settings, databases, audio and service state were not modified. No Docker commands or live research/generation calls were run.

## Validation and publication

All 4,466 controller tests and 184 web tests passed, with no failures or skips. All four package lint/type checks passed (controller, web, app and MCP); controller lint retains existing warnings. The production web build, schema/theme mirror checks, admin-query audit and its nine tests passed. Browser checks against the production build covered the dashboard segment control, Overview Run Now outcomes, full/partial Heard on Air conversations, feedback and mobile layouts. Tests used temporary state and mocked provider responses. The isolated preview server was stopped, generated Next environment declarations have no diff, and the final station configuration checksums still match.

The PR description is rewritten as a feature introduction, retaining the existing screenshots and covering Story Sparks, native conversations, same-day confirmed connections, Heard on Air transcripts/feedback, Station Brain coverage and queue controls, and the current operator workspace. It identifies automatic feedback tuning and Programme show scheduling as future decisions and does not present retired operator web research as an available feature.

A read-only merge-tree check against the fork's `develop` succeeded. The fork includes additional onboarding documents, so that branch is preserved rather than rewritten. The feature's code base remains Perminder's upstream `develop`.

## Owner deployment

The owner runs Docker commands. Because this upstream update changes compose and `liquidsoap/radio.liq`, rebuild broadcast as well as controller and web from the station checkout:

```bash
cd /home/jaz666/Docker/subwave
SUBWAVE_BUILD_VERSION=1.23.0 docker compose up -d --build controller web broadcast
```

The station's existing `.env` continues to select its Discord overlay. No checkout change is needed before the rebuild.
