# Clean upstream baseline and Sleeve Notes integration — 14 October 2026

## Checkouts and safety copies

- Station directory: `/home/jaz666/Docker/subwave`.
- Vanilla branch: `test-station/upstream-develop-20261014`, exactly upstream `origin/develop` at `2a08f0c6f1c7c4fcdf30fea451c955cfaccaa523` (1.23.0).
- Clean feature branch: `test-station/sleeve-notes-clean-20261014`, prepared separately at `/home/jaz666/subwave-sleeve-clean-20261014`.
- Complete previous station: `backup/station-before-clean-sleeve-rebase-20261014` at `9711824a`. This includes the committed pass-rotation fix and all earlier station work.
- Draft PR: https://github.com/Jaz666/subwave/pull/5, fork branch `feat/extended-sleeve-notes`, base `develop`.

The clean feature branch is rebuilt on upstream rather than replaying 151 accumulated station commits. Track Shortlist and Musical Leanings are now upstream; this branch retains Sleeve Notes, Station Brain and the helpers needed for research admission, pacing, sources, settings, diagnostics and speech tracking. It excludes older station-only picker changes, provider overrides, speech-file logging, transition diagnostics/effects, footer branch labels and other debug experiments. Their history remains on the safety branch; existing state/log files were not deleted.

Newer upstream request guards, pick-window semantics, genre-run/anchor behaviour, provider compatibility detection and recovery remain intact. Sleeve Notes only adds use-ID handoff hooks to `dj-agent.ts`. Integration preserves upstream's author-aware speech label stripping and intro budgeting, and its `showAt` enqueue option. The Sleeve Notes data store/migrations are unchanged from the saved station branch.

## Station-local Discord overlay

`docker-compose.discord.yml` was tracked on the old station branch but is absent upstream. It is referenced by the owner's `.env`. It has been restored byte-for-byte to the station directory and excluded locally through `.git/info/exclude`, so it survives switching between the vanilla and clean feature branches without becoming part of the feature PR. A second copy is retained at `/home/jaz666/subwave-review-notes/housekeeping-20261014/docker-compose.discord.yml`.

The station `.env`, settings, credentials, library/research databases and existing audio were not changed. Do not edit or save station settings during the brief vanilla check if those settings depend on the feature branch.

## Validation

- Controller and web TypeScript checks passed. The ten previous fixture errors are absent on this upstream base.
- 187 targeted controller tests passed, covering Sleeve Notes, vocal runway, speech labels/years, enqueue show boundaries and agent activity.
- All 171 web tests passed.
- Production web build passed.
- Changed-file web lint passed; controller lint's one unused-variable error introduced by removing the old speech logger was corrected and the affected files passed on rerun. Existing `any` warnings remain.
- Schema mirror regenerated from the controller; whitespace check passed.
- Full controller suite: 3,458 tests, 3,456 passing and two stale fixture assertions (link-prompt task text and the settings-schema key inventory). Both fixtures were corrected. All 122 tests in the affected files and speech/enqueue integration reruns passed, including a new regression ensuring Spark fit checking does not strip a speaker label twice. The full suite was not repeated after those fixture corrections.
- Final controller TypeScript check and changed-file lint reruns passed.

No Docker commands or live provider/research operations were run by the agent. The owner confirmed that the vanilla rebuild completed. The station checkout is being returned to the clean feature branch; the feature controller/web rebuild remains an owner action.

## Owner deployment sequence

The vanilla rebuild is confirmed complete. The station checkout is returned to the clean feature branch after publishing it. The commands below also provide a repeatable baseline/feature sequence.

1. Build and run upstream code from `/home/jaz666/Docker/subwave`:

   ```bash
   SUBWAVE_BUILD_VERSION=1.23.0 docker compose up -d --build controller web broadcast
   ```

   Compose continues to use the owner's `.env`, including the Discord overlay selection. Check normal playback and the admin interface before returning to the feature.

2. Once the vanilla baseline is healthy, switch to the prepared feature branch and rebuild controller/web:

   ```bash
   git switch test-station/sleeve-notes-clean-20261014
   SUBWAVE_BUILD_VERSION=1.23.0 docker compose up -d --build controller web
   ```

The broadcast code on the clean feature branch is upstream's, so it does not need another rebuild for step 2. Research resumes from the existing store under the existing settings. Do not run Docker on the owner's behalf.
