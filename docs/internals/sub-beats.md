# Sub/Beats development

Sub/Beats identifies likely sustained four-to-the-floor tracks, prepares deeper
Librosa analysis and dedicated stem regions, and eventually offers a prepared
beat-matched transition when suitable. The operator selects tracks to prepare;
playback should then run unattended. This is separate from protected Sub/Flow
sequences. Never alter a protected sequence's internal joins.

## Library location

Owner decision, 29 October 2026: place the Sub/Beats page in **Library →
Sub/Beats**, alongside the other library tools. Candidate discovery, queuing
deeper analysis and preparation progress belong on this page. Keep protected
Sub/Flow management separate. This records the navigation requirement; the page
is not implemented by the initial cache increment.

## Agreed audio direction

Development listening favoured a 16-bar stem exchange, four extra bars of vocal
separation, and a gradual 16-bar return to the incoming recording's native tempo.
Preserve the incoming recording from source zero. An established incoming
instrumental loop can hold back incoming vocals; alternatively, outgoing drums
can support incoming vocals before its first established beat. Confirm sustained
kick attacks independently of a beat tracker's grid. Grid evidence alone cannot
approve a driving beat or a pair.

When any Sub/Beats preparation or confidence check fails, return no upgrade to
the existing transition plan. Preserve the normal effects, eligible standard
Stem Blend, cue points, loudness and settings. Commit cue changes only after a
prepared pair passes checks and before publication to the mixer. Keep native
playback untouched until queue integration is implemented and validated.

## Current Library preparation workflow

The development branch now includes **Library → Sub/Beats** at
`/admin/library/subbeats`, linked from the Library page and its navigation group.
It suggests starting points using existing tempo/beat evidence (not a confirmed
drive score), supports artist/title/album search, and queues selected recordings
for deeper preparation. Search can find tracks without existing tempo analysis.

The controller alone owns `state/subbeats/queue.json`, saving admissions, pause
state, per-track attempts and results atomically. Managed children read that file
and report outcomes on the existing stdio/progress channel; they never overwrite
it. This preserves tracks added or paused while another is processing. The saved
list has at most 500 tracks and each admission accepts at most 100 IDs. Only
known library IDs can be admitted. Duplicate queued/running tracks are ignored;
explicit Recheck/Retry can refresh terminal results without automatic retry loops.

Sub/Beats uses the normal tagger/analyzer single-flight process slot, pidfile,
process-group Stop/restart handling, run logs, and quiet-time policy. Preparation
runs one track at a time and waits behind ordinary maintenance. Pause finishes
the current track and leaves the rest queued. The normal Stop control also
pauses the saved Sub/Beats list. On controller restart an interrupted active
track becomes a visible failure requiring explicit retry, while queued work
resumes after normal maintenance recovery. Closing the browser does not stop it.
Sub/Beats completion skips normal catalogue/playlist refreshes and stem sweeps.

The existing analyzer worker and sidecar accept the optional `prepare_subbeats`
operation / `/prepare-subbeats` endpoint. Only an explicitly capable heavy
analyzer is used; older/lean backends are unavailable for this job. It reuses the
normal capped source downloader with a separate 256 MiB / five-minute allowance
for these full-recording jobs (ordinary analysis retains its 12 MiB default). It
requires the complete recording, never a byte
prefix or a URL fallback. A cache UUID marker must match on both sides of the
shared state volume, including a check before publication. Unshared remote
analyzers decline rather than creating a private cache elsewhere. Preparation has
a separate 30-minute request deadline, leaving normal analysis deadlines intact.
The sidecar image includes both preparation modules; no dependency pins changed.

The Library page distinguishes queued, preparing, prepared, unmeasurable,
unavailable and failed results. Prepared means track resources were validated;
it does not mean any pair is ready for playback. Completed results can be
rechecked explicitly, using the cache when source and analysis identities match.
No automatic pair selection or rendered transition has been connected to playback.

Admin-only endpoints:

- `GET /library/subbeats` — saved list and current maintenance progress.
- `GET /library/subbeats/candidates?q=…&offset=…` — bounded discovery pages.
- `POST /library/subbeats/queue` with `{ "ids": ["track-id"] }` — persist selection.
- `POST /library/subbeats/pause` with `{ "paused": true }` — pause/resume admission.

Both container bootstraps prepare `subbeats/` and `subbeats/v1/` for the shared
controller/analyzer users. The cache lock works through a readable descriptor,
so a cache initially created by the developer's user can be reused by the
analyzer without rewriting existing stem files. Runtime folder permissions are
applied only when the owner deploys/restarts; this source change does not operate
the live station.

## First development increment: local preparation/cache (historical foundation)


`controller/scripts/subbeats_prepare.py` is an explicit local development job,
not an installed background service, API or playback hook. It reuses the normal
worker's Demucs separator and uses Librosa for full-recording rhythm evidence.
It writes only beneath `<state-dir>/subbeats/v1/`; source audio, ordinary library
analysis, settings and the regular stem folder are never written. The owner
approved the host development location:

```
/home/jaz666/Docker/subwave/state/subbeats/
```

The recording is decoded from sample zero, independently at 22.05 kHz mono for
analysis and 44.1 kHz stereo for stems. This avoids MP3 seek-offset errors seen
in the experiments. Local input must be a complete recording. Jobs are limited
to 20 minutes of decoded audio and FFmpeg has a 180-second decode timeout.

Analysis stores full-recording onset/beat evidence, supported local 64-beat fits
(timing residual below 35 ms and sufficient onset support), and a conservative
late percussion-loss candidate. These remain experimental measurements, not a
calibrated drive score. Unsupported/silent input records `unmeasurable` and skips
separation. Every result explicitly has `pair_ready: false`.

The initial requested stem coverage is source zero through 68 seconds, plus an
exit region ending at the latest supported grid before any detected sustained
percussion loss. The exit includes a 16-bar overlap plus eight seconds of lead
and two seconds of tail. Separation includes four seconds of source context on
each available side; the saved FLACs contain only the requested interval.
`--head-seconds` accepts 40–600 seconds for longer openings. This is an explicit
coverage request, not proof that it suffices for every pair: the later pair
planner must derive its required coverage from the entire timing map and request
more when needed. No fixed 68-second ceiling should reach playback integration.

Bundles are keyed by source SHA-256, algorithm/Librosa version, requested coverage
and separator model/settings/package versions. A manifest records absolute source
sample ranges, reconstruction error, file lengths and SHA-256 hashes. Stem shape,
finite samples, PCM clipping, written coverage and reconstruction are checked
before publication. A source change during preparation fails the job. Cache
reuse verifies the manifest and every saved file; damaged bundles are declined
with their path for inspection, never silently trusted or overwritten.

A nonblocking local file lock allows one preparation at a time. Complete bundles
are published by directory rename; failed jobs clean their own staging files.
A killed process may leave a `.pending-*` directory, which remains unpublished
and counts against capacity. Automatic cleanup of abandoned staging directories remains later cache
maintenance work. Managed queue recovery does not adopt incomplete bundles.

The initial budget is **5 GiB**. Existing bundles are never automatically evicted
in this increment: a full cache declines new work, and publication beyond the
budget fails and removes the new staging directory. Staging can temporarily
exceed the budget during a job, so allow 1–2 GB of working headroom. Model weights
remain in the analyzer's model cache, outside this budget. No prepared pair
clips are retained by this increment.

Run with an analyzer environment containing Librosa, SoundFile, FFmpeg and,
for stems, the existing heavy Demucs dependencies and model cache:

```sh
nice -n 10 /path/to/analyzer/python controller/scripts/subbeats_prepare.py \
  /path/to/complete-recording.mp3 --state-dir /path/to/station/state
```

`--analysis-only` needs no Demucs and produces a separate, small analysis bundle.
It does not require a Librosa upgrade or change normal analysis defaults. The
Librosa 1.0 variable-rate rendering used in auditions is a separate future
integration concern; this preparation step does not render transitions.

## Later development on this feature branch

1. Broaden driving-beat validation and negative fixtures, and evaluate the
   existing-data candidate ordering. Preparation/page integration is implemented
   above; it still needs owner deployment and listening-led development.
2. Derive/expand stem coverage from the pair timing map, confirm four-bar kick
   loops, validate source-zero release and vocal separation, and prepare pair
   clips before playback deadlines. Apply the normal shared loudness gain.
3. Integrate successful prepared upgrades into the queue, preserving the normal
   transition plan on every decline and protecting unpublished proposal rollback.
4. Improve the **general stem cache**. Existing priority-based preparation and
   eviction (#1622/#1630) ranks beat-grid usefulness, airplay and curation, but a
   full cache stops backfill and only over-budget data is swept. Allow valuable
   missing tracks to replace lower-value unused entries within the budget,
   consider upcoming demand, and prevent repeated separation/eviction churn.
   This is explicitly deferred; do not clear the current cache as part of early
   Sub/Beats development.

Near-real-time rendering remains a later measured experiment. Broad automatic
library preparation and a production-ready drive score remain unproven.

## Verification

`subbeats_prepare_test.py` runs through the existing `analyzer-python.test.ts`
shim under `npm test -- analyzer-python`. It covers atomic publication/reuse,
changed identities, corrupt/missing artifacts, failure cleanup, budget refusal,
concurrent writer refusal, separation from ordinary state, and supported exit
coverage including early calm outros. Real recording preparation and reuse are
checked separately during development; numerical checks do not replace listening
validation of eventual rendered pairs.

### First increment evidence — 29 October 2026

Development branch `feat/sub-beats` starts at `jaz666/feat/sub-flow` (`03fc02c6`),
with its original plan retained. Worktree:
`/home/jaz666/codex/subwave-sub-beats`.

A selected real recording, Sash! — La Primavera, was prepared at the approved
state location. Its analysis again identified the sustained percussion drop at
180 seconds of a 213.53-second recording. The 68-second head and 38.22-second
exit region produced eight validated FLACs; analysis and stems together occupy
69,832,005 bytes (about 70 MB, plus the small manifest). Relative stem
reconstruction errors were 0.0222 and 0.0284. A second invocation returned a cache
hit with identical file hashes and no separation. A separate analysis-only job
under the existing Librosa 0.11.0 also succeeded, finding the same drop and using
79,247 bytes. The full stems trial used the isolated Librosa 1.0.0/Demucs 4.0.1
CPU environment from the listening experiments. No model download was needed.

No broad library preparation, normal-cache sweep, database change, station
source deployment, Docker rebuild/restart or playback integration was performed.
The only runtime writes were the approved new Sub/Beats cache and local evidence
logs. Existing ordinary stems and analysis remain in place.

Verification for this increment: `npm test -- analyzer-python` passed, including
20 new cache/preparation checks and the existing analyzer Python suites;
`npm run lint` passed (existing warnings, no errors, including TypeScript checks);
Python compilation and `git diff --check` passed. The full controller/web suites
and production builds were not run for this local Python development entrypoint.

That increment established the local cache foundation. The next increment
implemented the managed preparation/page workflow described above. Pair-render
integration and general-cache replacement policy remain separate later work.

### Managed preparation and Library page evidence — 29 October 2026

The next increment adds the workflow above without operating the station.
Verified with isolated state and fixture audio/analyzer endpoints:

- 14 Sub/Beats checks: admin-only routes, bounded/validated admission, discovery
  with missing or malformed existing analysis, durable state and retries, real
  managed-child stdio delivery, admissions during an active job, pause/resume,
  Stop preserving queued work, and a refused process-lock write failing safely.
- 45 analyzer checks, including the existing Python suites and 21 cache/
  preparation cases. New contracts cover unsupported/older backends, shared
  cache proof, complete-source requirements, sidecar forwarding, actual heavy
  model-use accounting, and larger job-specific downloads leaving normal caps
  unchanged.
- 50 existing tagger checks, 16 bootstrap checks (both container entrypoints),
  and 14 quiet-time checks passed.
- 29 web Library checks and nine admin-query audit checks passed; the static
  admin-query ownership audit passed. Controller and web `npm run lint` passed,
  including TypeScript (controller retains its pre-existing lint warnings).
- Existing browser scripts passed: all 24 Library search checks and all six
  query-cache checks, including tagging/blocking cache propagation, tab reuse
  and signed-out request behaviour. They ran against the temporary fixture
  library on ports 7791/7793, with no live library or service credentials.
- Desktop (1440 px) and mobile (390 px) screens rendered without horizontal
  overflow or uncaught page errors; admission survived a reload. Empty candidate
  and failed-progress states were exercised; unknown queue state disables
  admission. A bounded follow-up confirmed the shared checkbox controls and
  Library/Sub/Beats breadcrumb. The UI detector reported no findings.
- A real Python worker protocol smoke test used hard-linked copies of the
  validated La Primavera cache in a temporary state directory. It advertised
  support, verified the matching cache marker and returned the same prepared
  bundle with `subbeats_used_models: false`. No fresh separation was needed.

Temporary preview servers were stopped. Screenshots/logs remain in the isolated
experiment directory, outside Git. No full production build, deployment, station
restart or real playback test was performed. Normal transitions and general stem
cache retention are unchanged. Pair planning/rendering and playback integration
remain the next development stage.

## Test station deployment — 2026-10-29

The preparation UI/queue candidate from `feat/sub-beats` (`6969aab8`,
`b5146aa1`, `0d1b47d4`) is integrated onto the station's existing
`test-station/sleeve-notes-clean-20261014` branch. The station's Sub/Flow
routes, Library card and schemas are retained; its retired original plan
document is not restored. Both remotes were fetched before integration.

The route is `/admin/library/subbeats` (Library → Sub/Beats), behind the
existing admin login. No tracks are automatically admitted by deployment.
Preparation remains separate from playback. The state/cache location is
`/home/jaz666/Docker/subwave/state/subbeats/`.

Rollback source is `rollback/pre-subbeats-20261029` (`8f55bffa`). Original
controller, web and CUDA analyzer images are retained locally as
`subwave-local/{controller,web,analyzer}:pre-subbeats-20261029`. The running
Compose configuration uses `docker-compose.yml`,
`docker-compose.analyzer-gpu.yml` and `docker-compose.discord.yml`. Recreate
only controller, web and analyzer for this deployment; broadcast stays live.
The two new cache directories receive the same writable permissions as the
updated bootstrap script, without requiring a broadcast restart.

Pre-integration verification is recorded above. Deployment checks and final
service status are appended after the candidate is built and started.

Operator preference (2026-10-29): for future deployments, provide the exact
rebuild and health-check commands for the owner to run; avoid spending agent
usage waiting on image builds. The current deployment was already building
when this preference was given.

Deployment completed: controller, CUDA analyzer and web images built
successfully and were recreated with `--no-deps --no-build`. Broadcast was
not restarted and retains two active stream mounts. Edge health is 200
`on-air`; both Library Sub/Beats and Sub/Flow pages return 200. Authenticated
Sub/Beats state/candidate reads return 200, with 50 candidate rows and more
available. Preparation list is empty. Analyzer health reports
`analyze_subbeats_capable: true`; controller capability remains unknown until
its normal lazy backend probe, with admission available. No audio job was
started for deployment verification.

Integrated checks: all 14 Sub/Beats tests passed; web lint/typecheck and its
production build passed. Controller ESLint has zero errors, but its full
typecheck remains blocked by 13 existing missing-`artists` errors in four
show test files. Those files and `show-candidates.ts` are byte-identical to
rollback source; no Sub/Beats type errors were reported. Controller runtime
build and health passed. Previous feature-branch verification is preserved
above. The next acceptance step is selecting a small batch in Library →
Sub/Beats and checking preparation results; playback integration remains
future development.
