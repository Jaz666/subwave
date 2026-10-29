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

## First development increment: local preparation/cache

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
and counts against capacity. Automatic recovery/cleanup is deferred to worker
queue integration.

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

1. Connect preparation to the existing worker/job infrastructure, with persistent
   queued/running/failed/unavailable states, pause/restart and bounded retries.
   Add demand-led candidate controls on the Sub/Beats page. Keep production
   worker and sidecar capability negotiation explicit.
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

Next: connect this preparation job to the existing managed worker infrastructure
and persist job progress before adding the Sub/Beats candidate/analysis page.
Keep the initial cache work independent of general-cache replacement policy.
