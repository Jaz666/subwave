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
each available side; the saved stems contain only the requested interval.
`--head-seconds` accepts 40–600 seconds for longer openings. This is an explicit
coverage request, not proof that it suffices for every pair: the later pair
planner must derive its required coverage from the entire timing map and request
more when needed. No fixed 68-second ceiling should reach playback integration.

Bundles are keyed by source SHA-256, algorithm/Librosa version, requested coverage
and separator model/settings/package versions. A manifest records absolute source
sample ranges, reconstruction error, file lengths and SHA-256 hashes. Stem shape,
finite samples, clipping-free storage, written coverage and reconstruction are checked
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

## Preparation error reporting

Station attempts returned HTTP 422 after Demucs selected CUDA on the RTX
3060. The HTTP status alone does not identify the underlying failure.
Sub/Beats now uses the existing sidecar error reader, preserving the worker's
error detail in the managed log and failed queue row. Previously this path
discarded that detail and misleadingly directed the operator to an analysis
log that did not contain it. Retry one failed track after updating the
controller to establish the cause; no GPU-memory or audio-validation changes
are justified without that evidence. Future image rebuilds are run by the
owner, using supplied commands.

Docker build contexts must exclude runtime state after the `.env.example`
exception, including `state/**`. A private prepared bundle exposed traversal
of `state/subbeats/v1` during an owner-run controller rebuild. The final
exclusions prevent inspecting or sending runtime caches; do not broaden
bundle permissions to work around a build-context error.

Correction: final state exclusions alone did not prevent BuildKit traversal.
An isolated context with an unreadable `state/subbeats/v1/private` directory
reproduced the sender error with the previous rules. Replacing the broad
`!**/.env.example` exception with explicit root/controller/web example-file
paths passed the same context-only build. This test rebuilt no station
services and read no real cache files. Cache permissions remain unchanged.

## Over-range separated stems

Ayla preparation exposed a validator rejecting finite separated stems at or
above full scale. Those values can cancel when the stems reconstruct the
source. Preserve over-range stems as 32-bit floating-point WAV, keeping
24-bit FLAC for stems below full scale. Do not clip or independently scale
stems. Validate the saved/reloaded sum against the source, retaining the
existing 10% reconstruction tolerance and finite/shape/coverage guards. The
storage policy is part of the separator cache identity, so existing bundles
are retained but new requests use a distinct key. Consumers must use each
bundle's listed filenames rather than assume every stem ends in `.flac`.

Verification: all 22 Sub/Beats Python checks and the registered analyzer Python suites pass, including over-range cancellation, unscaled float storage and invalid-sample rejection.

## Endpoint rounding after overnight preparation (2026-10-30)

The station queue contains 40 prepared tracks and nine failed tracks, all with
`requested region is outside decoded source coverage`. Independent 22.05 kHz
analysis and 44.1 kHz stem decodes can round their end samples differently.
A real FFmpeg reproduction using 48,001 input samples at 48 kHz gives
22,051 analysis samples and 44,101 stem samples: the inferred stem endpoint
is one sample beyond actual coverage.

Allow at most one analysis sample (two stem samples, about 45 microseconds)
of end rounding, and record the actual decoded endpoint. Do not pad audio or
alter start positions. Larger overruns, negative starts and empty regions
still fail. Existing successful bundles remain valid; no cache identity
change or repeat separation is needed for those 40 tracks. Retry only failed
tracks after the owner rebuilds the analyzer. This fixes a demonstrated
rounding case; successful retries confirm its application to the nine tracks.

## Prepared-library review and consistent FLAC storage (2026-10-30)

All 49 admitted tracks are prepared, each with both head and exit regions.
Their listed artifacts total 4,299,780,520 bytes. The whole versioned cache
including earlier development bundles occupies 4,369,818,223 bytes of the
5 GiB budget. All 49 bundles contain WAVs (106 floating-point stems overall).
The largest saved-stem reconstruction relative error is 0.05723, within the
0.1 guard. Two tracks have late percussion-drop candidates. These results
verify preparation coverage, not four-to-the-floor classification, downbeat
phase, vocal separation suitability or readiness of any transition pair.

New preparations now store all four stems as 24-bit FLAC. For each region,
measure the largest absolute sample across all four cropped stems. When it
reaches full scale, multiply every stem by `0.999 / peak`; otherwise gain is
one. Record this multiplier as `stem_regions[].storage_gain`. A consumer
must divide decoded samples by that value before mixing. Existing bundles
without this field have gain one and may contain floating-point WAVs. Never
normalize stems independently or apply a limiter at preparation time.

Reconstruction validation uses saved/reloaded PCM with the recorded gain
restored, so quantization is included in the check. The storage policy changes
the cache identity to `PCM_24-shared-gain-v1`. Existing bundles are retained,
not rewritten, and the 49 prepared tracks need no repeat GPU work. Readers
must support both versions before pair rendering is integrated. An explicit
CPU-only conversion of existing bundles can be considered separately if disk
pressure warrants it; no migration or eviction is performed by this change.

Verification: the registered analyzer Python suites pass, including all 22
Sub/Beats checks. The shared-gain regression models 24-bit PCM quantization
and verifies restored stem balance and reconstructed source level. No GPU
job, cache migration, image rebuild or station restart was performed.

## CPU-only conversion of existing prepared bundles

`subbeats_convert.py --state-dir PATH` converts the paused preparation list's
verified mixed FLAC/WAV bundles, without downloading tracks or importing GPU
models. It holds the existing preparation lock. The same FLAC writer is used
by new separation and conversion, including saved-sample and restored-level
validation. Conversion checks both individual stems and their summed audio.

Bundle keys and original preparation identity remain stable: identity records
preparation provenance, while `metadata.storage_format` records current
encoding and each region's `storage_gain` records reversible attenuation.
Artifacts and hashes are regenerated; analysis files are copied unchanged.
New preparation requests recognize a verified converted legacy bundle and
reuse it without separation. Prepared queue entries are never rewritten.

Publication uses Linux `renameat2(RENAME_EXCHANGE)` on the same cache
filesystem. Stage and original are hash-checked before exchange, and the
published bundle is checked again before deleting the old files. A failed
post-publication check swaps the original back. If rollback itself fails,
the old staging directory is retained rather than deleted. A killed process
may leave a `.convert-*` directory for inspection; no automatic cleanup is
performed. Unsupported atomic exchange fails before changing the original.
Only conversions which reduce artifact size are published.

The isolated tests exercise retained keys, restored levels, unchanged analysis,
cache integrity, repeated conversion, corrupt input, refused exchange and
pre-publication conversion failure. The registered analyzer Python suites
pass. Live conversion results are recorded after execution.

Live conversion completed 2026-10-30: all 49 prepared bundles converted on
CPU using the analyzer's existing NumPy/SoundFile runtime; no model load,
separation, image build or service restart. Listed artifacts reduced from
4,299,780,520 to 3,346,483,816 bytes: 953,296,704 bytes saved (22.17%).
The whole versioned cache now occupies 3,416,533,383 bytes, including earlier
development bundles. All 392 listed stem files are FLAC. Maximum conversion
sum RMS error was 9.386e-8, below the 1e-6 absolute guard. Every original,
staged and published bundle passed its integrity checks. Analysis files,
source clocks, prepared statuses and bundle keys were retained; no conversion
stages remain. Preparation was paused for conversion then restored to its
previous unpaused state. Controller reports 49 prepared, no active maintenance;
edge health is `on-air`.

All 23 Sub/Beats checks and the registered analyzer Python suites pass,
including post-publication rollback and converted-bundle reuse without
analysis/separation. Source is integrated into the station checkout, but the
running analyzer image has not been rebuilt with the legacy reuse lookup;
avoid Recheck of these completed tracks until a future analyzer rebuild.
No rebuild or recheck is needed to use these converted cache artifacts in the
future pair reader. Next development step: consume verified bundle files and
region storage gains when evaluating beat/phrase alignment, before playback
integration.

## Browser transition auditions

Library → Sub/Beats now offers two prepared-track selectors and a Play/Stop/
Cancel preview button. It reuses Sub/Flow's browser join player, with an
optional endpoint argument retaining Sub/Flow's existing default. Changing
tracks, leaving the page or losing authentication aborts the request and
releases its audio/object URL. Only one audition plays in that player.

`POST /library/subbeats/join-preview` is admin-only. It accepts two distinct
prepared library IDs, checks current availability and the blocklist, resolves
the normal `resolveGainDb` playback gains, and sends only their saved bundle
keys, gains and shared-cache marker to the analyzer. It never calls queue,
picker, source download, ordinary analysis, settings writes or mixer controls.
One controller preview request is admitted at a time; client disconnect aborts
the HTTP wait. A worker already rendering may finish its bounded cached clip.

The analyzer's `/subbeats-preview` endpoint dispatches `preview_subbeats` to
the existing worker. This operation does not request/load GPU models. It reads
and hash-verifies dedicated cached head/exit stems, restores region storage
gains, and uses existing NumPy/SciPy/Librosa/SoundFile packages on CPU. A
low-frequency drum-attack grid must support the first 16 consecutive quarter
notes and at least 85% of a 64-beat span; grid fitting and prepared-coverage
checks can decline a pair. Outgoing BPM is held as master; incoming stems are
pitch-preservingly stretched to match and their kick phase is checked again.
Tempo differences above 8% are declined.

The experimental 16-bar exchange includes outgoing lead and eight seconds of
incoming follow-through. Normal vocal exchange leaves four bars of separation;
when source-zero incoming vocals precede its first beat, this first version
withholds outgoing vocals for the audition rather than overlap them. Drum,
bass and other-stem envelopes and one constant output headroom gain are used.
There is no per-stem normalisation, clipping or output limiter. Playback gains
and both source manifests participate in cache identity, so conversion or
loudness-setting changes cannot reuse an obsolete preview.

This is a bounded listening experiment, not the complete automatic pair
planner. Phrase/downbeat numbering and vocal handling are experimental. It
has no instrumental-loop extension or gradual native-BPM return yet; the
incoming track stays at matched tempo until the clip ends. Insufficient
coverage or confidence produces a readable decline, without changing the
station's normal transition choice. The page states these limits explicitly.

WAV auditions live separately under `<stateDir>/subbeats/previews/`, with a
200 MiB cap and atomic publication; they are returned as no-store audio and
are not added to the prepared queue. There is no automatic preview eviction
in this increment. No new package or analyzer dependency pin is required.
Controller, analyzer and web need rebuilding to expose the feature; the owner
runs rebuilds. Broadcast does not need restarting.

Audition decoding is capped at 90 seconds per region, including long heads
explicitly prepared by development tools; this prevents an unusually long
head from making the pitch-preserving preview allocate unbounded memory.
The full bundle is still integrity-checked and its file coverage verified.

Verification for this increment: 17 controller Sub/Beats tests pass; the
registered analyzer Python suites pass, including 23 cache/conversion checks,
four numerical preview checks and preview sidecar transport/model-use checks.
Controller ESLint reports zero errors (existing warnings), and the final
controller typecheck passes. Web lint/typecheck, 29 Library tests, nine
admin-query tests and the static query audit pass. All 24 browser Library
search checks and six query-cache checks pass against an isolated fixture.
The new preview controls pass play/stop/cancel, duplicate-selection, decline
and overflow checks at 1440px and 390px; no browser page errors or mechanical
UI detector findings. Temporary API/web servers are stopped.

A real full-stdio worker audition of Ayla → Love Stimulation from the
converted cache returns a 39.351-second, 44.1 kHz stereo WAV in about 21 seconds
on CPU (first direct cold render took about 38 seconds). Worker stderr reports
only readiness, with no model load. The experiment used standalone copies in
`/tmp` inside the analyzer; its installed service/image was not changed.
Prepared queue data and on-air playback remain unchanged. No production image
build or service restart was performed. The candidate is copied into the test
station checkout for the owner to rebuild; pre-preview source rollback is
`e6ddfee8` (also retained as `rollback/pre-subbeats-preview-20261030`).

## Testing timeline for browser auditions

Each rendered preview now includes a timeline derived from the same cue,
beat-period and intro-vocal mode used by its mix envelopes. It marks incoming
entry, beat alignment, vocal-gap/fade stages, incoming instruments reaching
full level, outgoing instruments fading, and the incoming-only follow-through.
Simultaneous events share one row. Intro-vocal previews omit the normal vocal
gap labels and explain that outgoing vocals are withheld. These are planned
mix stages, not detected phrases or promises that a vocal stem is non-silent.

The worker stores timing in the preview manifest and returns it on both render
and cache hit. The analyzer and authenticated controller expose validated
`X-Subbeats-Timeline` metadata alongside the existing WAV; it is explicitly
exposed for cross-origin development access. The shared schema checks finite,
bounded, sorted timestamps starting at zero. Preview version 3 gives old clips
a new cache identity, so timings are generated on the next CPU audition; the
49 prepared stem bundles need no further work.

The browser adds elapsed/total time, a seek slider, the current stage, and
clickable timestamp rows. It retains the loaded Sub/Beats clip after the end
for seeking and replay without another render. Stop, pair change, auth change
and unmount still release the audio and object URL. Sub/Flow previews without
timing metadata retain their previous end/cleanup behaviour and do not acquire
playhead-driven UI updates.

Verified: six controller route tests, numerical timeline tests for normal and
intro-vocal exchanges, analyzer transport tests and the registered Python
suites pass. Controller types and web lint/types pass. Desktop/mobile browser
checks cover live position, timestamp seeking, stage highlight, retained timing
after finish, replay without another request, and clearing on pair change;
there are no page errors or horizontal overflow. All 24 Library search and six
query-cache browser checks pass on the isolated fixture. The mechanical UI
detector reports no findings. No deployment build or station restart is run;
the owner rebuilds analyzer, controller and web to expose the timeline.

Real-worker smoke verification: Ayla → Love Stimulation renders a 39.351s
clip whose timing includes beat alignment at 4.000s, the normal vocal gap
starting at 7.419s, incoming vocal fade at 14.257s, and incoming-only playback
at 31.351s. A second request returns identical timing from the verified cache.
The standalone worker completes both requests in about 19s on CPU, with no
model load reported. Temporary fixture servers are stopped. Final focused
controller/web ESLint checks pass; the pre-timeline test-station source is
retained as `rollback/pre-subbeats-timeline-20261030` before integration.

## Preview bar alignment control

Browser auditions offer an incoming bar shift from −2 to +2, default zero.
Negative brings the incoming audio earlier; positive brings it later. Each bar
is four beats at the matched tempo. This moves the actual incoming source and
its instrumental entry ramp relative to the outgoing exchange. Vocal fade
windows remain fixed to preserve the four-bar vocal gap. Opening vocals still
use the original detected cue, with outgoing vocals withheld.

Changing the shift stops/cancels the loaded preview; Play renders or retrieves
that alignment. Changing either track resets the shift to zero. The timeline
shows the shifted incoming beat reference and entry/full-level times. Available
outgoing lead and incoming coverage are checked for every shift; unsupported
coverage declines rather than silently padding or trimming the source.

The authenticated request accepts integer `barShift` in [−2, 2], default zero;
controller forwards `bar_shift` through both analyzer paths. Worker validates
again, stores the shift in metadata, and includes it in the version-4 preview
cache identity. Existing prepared FLAC bundles are reused unchanged. This is
preview-only and does not alter station playback or saved transition settings.

Validation: numerical audio-marker checks cover all five shifts, default-zero
parity and invalid values; authenticated route tests cover forwarding and input
rejection. Analyzer Python suite, controller typecheck, focused controller lint,
full web lint/typecheck and nine query-audit tests pass. Desktop/mobile browser
checks cover all shift requests, clearing stale audio, cancelling pending work,
pair reset, and layout without horizontal overflow.

## Full-recording structural landmark candidates

The requested planning model is destination-first: choose an incoming musical
arrival/natural release, place a 16-bar exchange around it, and sustain an
appropriate outgoing instrumental loop until that destination when needed.
Markers are not restricted to an intro/outro window. Beat matching and multiples
of four beats alone cannot resolve a one-bar phrase ambiguity.

`controller/scripts/subbeats_structure.py` adds an independent CPU-only map to
managed preparation/recheck. It reuses verified full-recording beat evidence,
decodes the complete recording at 11.025 kHz, and uses Librosa STFT, mel spectra
and chroma to measure beat-synchronous energy, bass, texture and harmonic
changes. It compares 4-, 16- and 32-beat contexts around each measured beat and
retains multiple local peaks across the whole recording. There is no first/last
16-bar search restriction or fixed phrase spacing. Candidate context is bounded
by actual measured beats; it does not extrapolate a grid through missing audio.

Each candidate records its source position, beat index, evidence, strength,
available surrounding beats, supported rhythm coverage, and tentative local
four-beat phase support. Confidence is a heuristic low/medium label, not a
calibrated probability. Changes without supported beat evidence remain low
confidence. No candidate claims verified phrasing, vocal safety, a suitable loop
seam, or pair readiness. A track without sufficient evidence reports
`no_clear_landmarks` instead of inventing a resolve point. There is no trained
musical-resolution or downbeat model here; audible validation remains necessary.

Structure maps and compact beat feature arrays are separate integrity-checked
artifacts in the existing `state/subbeats/v1` cache, keyed by source hash,
structure algorithm/Librosa version and rhythm artifact hash. They use the same
budget, single-writer lock and atomic publication as existing bundles. Changing
this detector does not invalidate or rewrite prepared stems. Managed Recheck
adds the map after reusing a valid stem bundle; subsequent rechecks reuse both.
A changed source retains the existing full-preparation invalidation behavior.
The worker exposes the structure artifact key as `subbeats_structure_key` for
development tooling. No preview alignment is changed by this map yet.

For CPU-only development runs on a complete source with matching verified rhythm:

```bash
python controller/scripts/subbeats_structure.py /path/to/complete.audio \
  --state-dir /path/to/state --bundle-dir /path/to/state/subbeats/v1/BUNDLE_KEY
```

Results are `structure.json` (all candidate landmarks) and
`structure-features.npz` (compact energy/spectrum/chroma per measured beat).

Validation: five numerical/isolated-cache tests cover arrivals/releases beyond
intro/outro windows, nearby fill release/arrival preservation, harmonic changes
without a level jump, steady/silent input, invalid data, independent cache reuse,
algorithm invalidation, and unchanged stem files/manifests. The full analyzer
Python suite and controller lint/typecheck pass (existing lint warnings only).

A CPU-only evaluation of the three reference recordings retained:

| Recording | Candidates across full track | After 1 minute | Nearest to owner's reference |
| --- | ---: | ---: | --- |
| Liquid Child — Diving Faces | 48 | 34 | 27.330 s, medium confidence |
| Planet Perfecto — Bullet in the Gun (Saturday remix) | 58 | 56 | 28.050 s, low confidence |
| B.B.E. — 7 Days and 1 Week | 31 | 20 | 24.044 s, low confidence |

These are retained candidates, not 137 verified mix points. In particular,
B.B.E.'s 25-second reference remains unresolved, and Planet Perfecto's nearby
arrival lacks supported local rhythm in this analysis. Repeated runs returned
verified cache hits. Evaluation used temporary analysis-only bundles and did not
load Demucs, change the 49 prepared library bundles, or alter previews/playback.
The next planner still needs to select compatible phrase positions, establish
loop safety/coverage, and validate audible results before automatic use.

## Rejected phrase-counting attempt: pre-mixed compilation sources

The owner rejected the phrase-counted preview implementation after listening.
It has been reverted completely, including its opening-phase assumption, new
loop mixer and post-stretch cue correction. The earlier manual bar-shift preview
and full-recording structure maps remain. Rechecked prepared bundles are retained;
rejected version-6 preview artifacts are no longer selected by the restored
version-4 renderer. No cache files are deleted during rollback.

These tracks come from a pre-mixed compilation. Source zero and the first
sustained kick do not establish a clean musical phrase origin. An edit may have
shortened an intro or outro, and boundaries must be established independently
for each usable region. Preferred 4/8/16-bar mixing sections are a planning goal;
they must not force an edited recording to have a complete sixteen-bar intro.

The owner's revised listening references, explicitly as displayed in MixMeister:

| Recording / role | Reference | Required behavior |
| --- | --- | --- |
| Bullet in the Gun, outgoing | Outro starts 03:41 | Let the recording play naturally while bringing in the next track. When its available audio ends, extend drums and bass with a loop until the incoming full sixteen-bar intro reaches its destination. |
| 7 Days and 1 Week, incoming | Natural complete sixteen-bar intro | Play the existing opening as recorded; do not replace it with a counted reconstruction. |
| 7 Days and 1 Week, outgoing | Natural sixteen-bar outro starts 04:09 | Use that natural outro. |
| Diving Faces, incoming | Natural resolve at the fifteenth bar, approximately 00:25 | Treat this as a shortened intro. Do not snap its destination to the inferred sixteen-bar boundary near 00:27. |

These supersede the earlier Diving Faces 27-second reference and any assertion
that a source-zero kick count establishes either recording's phrase phase.
Before another render, reconcile MixMeister display/clip positions with the
exact prepared source and stem coverage; do not silently equate display time,
raw-source time and preview time. For example, the currently prepared Bullet
recording decodes to about 04:31.8, so the stated short outgoing runway needs
its actual MixMeister clip/end position established. Existing fixed exit stems
must be checked against the owner's earlier outro positions before reuse.

Next development should begin with these manually specified reference cases,
including partial phrases and a drums+bass extension after the actual outgoing
end. Validate those auditions first, then improve automatic landmark selection
against the accepted placements. No replacement automatic planner is deployed
as part of this rollback.

Rollback checks: the restored runtime/UI files match commit `ef969239` exactly;
the analyzer Python suite and Library web tests pass. Read-only cache inspection
also confirms why existing exit stems cannot simply be reused for the corrected
references: Bullet's exit covers source 234.353–271.805 seconds (starts after
03:41), and B.B.E.'s covers 234.009–271.677 seconds (stops before the complete
natural outro from 04:09). Preserve these bundles; prepare appropriate extra
coverage only after the reference/source coordinates are confirmed.

## Annotated browser preview with sustained rhythm

The browser preview now has an explicit reference mode for the eight owner
annotations in `controller/scripts/subbeats-reference-tracks.json`. These are
listening fixtures, not picker rules, track approvals or automatic phrase
analysis. If both selected tracks have references, the page shows the outgoing
outro and incoming release times and offers only the incoming track's supplied
4/8/16/32-bar lengths. The longest supplied length is the default. Other pairs
retain the existing 16-bar stem audition and its manual bar shift. Reference
mode does not apply bar shifts or guess an absolute bar origin from file zero.

`referenceBars` requests are validated against the server-owned annotations.
Clients cannot supply source URLs or substitute timestamps. The controller
continues to enforce prepared status, library availability, the blocklist and
normal playback gains. It supplies raw original-recording URLs privately to the
analyzer for this mode. Old analyzer responses without the reference timeline
marker are declined instead of silently playing the earlier preview method.

The CPU renderer repeats the accepted offline approach: snap annotations only
to the nearby quarter-note grid, work backwards by the selected complete bars,
blend original musical audio over that window, and retain drums+bass support
through the incoming release. The rhythm hands over across the following bar.
The original outgoing recording plays to its natural end; if it ends earlier,
a one-beat blend moves into a phase-continuous four-bar drums+bass extension.
The same loop fills lost rhythm as the musical fade progresses. Its seam is
10ms without shortening the beat cycle. One constant composite loop gain and
one constant output headroom gain are used, without independent stem leveling.
Incoming tempo remains matched through the preview. This is a full-mix blend
with rhythm support, not the earlier Stem Blend vocal policy.

Original sources are fetched serially to bounded temporary files (256 MiB each),
decoded from sample zero, and removed on success or failure. Completeness and
prepared duration are required. An exact source hash is accepted directly;
when container/tag bytes differ, the first eight seconds must match the restored
prepared head reconstruction within 10% relative RMS error at the same sample
clock. Silent or mismatching heads are declined. This permits the raw recordings
used in the accepted auditions without treating a changed recording as aligned.
No source URLs or their credentials enter cache identity, metadata or browser
responses. Cached previews need no source fetch.

The timeline reports actual source entry times, the loop source, original EOF
extension when used, the annotated incoming release and the one-bar handover.
It remains seekable and browser-only. Changing either track or transition length
cancels and discards the current audition, as does leaving the page or losing
authentication. No broadcast, picker, settings or preparation-list writes occur;
no GPU models or new separation are requested.

Preview format is version 5. The 200 MiB preview cache now recycles its oldest
verified generated audition folders under the existing preview lock. Only
hash-valid fingerprint-named folders containing exactly a manifest and the
listed `preview.wav` qualify. Unrecognised files, preparation bundles and ordinary
stems are never removed. A saved clip already downloaded by the browser keeps
playing when its disk cache entry is recycled. Publication stays atomic.

The eight annotations do not establish pair suitability: 1998 → Universal Nation
(32 bars) and Diving Faces → Beachball (4 bars) passed listening. Mystery Land →
1998 failed, including a full-pattern loop trial because an unwanted effect
repeats with the useful pattern. Retain this as a negative reference for later
selection work, not an automatic rule excluding either track with other partners.
Windows before source zero, ambiguous kick grids, unsuitable loop level/coverage
and excessive tempo adjustments produce readable declines. Station playback
continues using its normal transitions; automatic selection and native-tempo
return are separate future work.

Verification: the controller Sub/Beats route/manager suites pass (18 tests), as
do all registered analyzer Python suites, including five sustained-reference
checks and the explicit-download-cap regression. Controller and web lint and
typechecks pass; controller retains its existing lint warnings. All 29 Library
web tests, nine admin-query tests, the static query audit, Library search checks
and all six browser query-cache checks pass. Desktop/mobile browser checks cover
reference defaults and allowed lengths, source/EOF timing, seeking and replay,
cancellation on length changes, the four-bar pair, unchanged legacy bar shifts
and horizontal overflow. Both accepted real-source pairs reproduce their offline
WAVs within one PCM16 sample step; repeated requests use saved audio without
fetching originals. No image rebuild or service restart was run.
