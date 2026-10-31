# Sub/Beats session handover — 2026-10-30

Superseded direction, 31 October: the owner chose to return to the earlier
16-bar stem preview. See `docs/internals/sub-beats.md` for current browser behavior.
The annotated results below remain listening evidence.

Read this first when resuming. It records the current accepted behavior; older
phrase-planner and rollback sections in the internal notes are historical.

## Where we stopped

The owner has finished today's session. The annotated browser preview is
implemented, tested, pushed to `feat/sub-beats`, and integrated into the test
station checkout. **Latest feedback: 16 bars sounds OK for 1998 → Universal
Nation.** Both 16 and 32 bars are valid listening references for that pair.
The 32-bar version was preferred earlier; do not turn that into a rule that
32 bars is always required or that the shorter version failed.

This is still preview-only. Station playback, picker selection, Sub/Flow joins
and normal transition fallback are unchanged. No automatic phrase planner was
restored. The next work should build on the accepted browser mixer, rather than
starting another unverified automatic planner or recreating the prototypes.

## Listening outcomes

| Pair / trial | Outcome | What to retain |
| --- | --- | --- |
| 1998 (Matt Darey mix) → Universal Nation (Ferry Corsten 99 remix), initial 16/32-bar comparison | 32 bars preferred; rhythm faded away too soon | Musical fade duration and rhythm handover are separate controls |
| Same pair, 32 bars with sustained outgoing drums+bass | Accepted: “that's great” | Hold rhythm through the incoming release, then hand over across one bar |
| Same pair, final browser preview at 16 bars | Accepted: “16 bars sounds ok for that pair” | Both lengths work; no requirement to use 32 for every transition |
| Diving Faces → Beachball, 4 bars | Accepted: “the second is fine” | Same rhythm-handover approach also works for a short entry |
| Mystery Land → 1998, 16 bars | Rejected as unnatural | An outgoing repeating musical pattern disappears at preview 0:04 |
| Same failed pair, loop the complete four-bar pre-outro pattern | Still rejected | An unwanted effect repeats with the useful pattern; owner considers this combination incompatible for this approach |

Mystery Land → 1998 is a **negative pair reference**, not a global exclusion of
either track. Do not assume tempo difference caused its failure. No automatic
incompatibility detector or pair blacklist is implemented. The owner expects the
later selection process to rule unsuitable combinations out and use normal
Subwave transitions when Sub/Beats is unsuitable or uncertain.

## Musical requirements and corrections

- These recordings come from a pre-mixed compilation. File zero and the first
  detected kick are not verified bar-one or phrase origins.
- Use the owner's source timestamps as reference anchors. MixMeister's displayed
  bar counts are estimates because its detected first beat can change numbering.
- **Diving Faces resolve is 00:27**, with a suitable 16-bar window. Its displayed
  count of about 15 does **not** establish a missing bar. The intermediate 00:25
  / shortened-intro interpretation was superseded.
- Work backwards from the incoming release by complete suitable windows: 4, 8 or
  16 bars, with 32 explicitly allowed for Madagascar and Universal Nation.
- Keep a continuous driving beat to the release. Preserve the outgoing natural
  audio and extend beyond EOF with phase-continuous drums+bass when necessary.
- A sustained kick grid establishes tempo/phase evidence, not musical phrasing,
  vocal safety, loop purity or pair suitability.
- Madagascar's independently measured **140.30 BPM** agrees with the owner's
  MixMeister **140.3**. The cached 105.25 BPM is a 3:4 tracking alias. Its preferred
  01:36 release avoids a long repetitive drum passage before musical variation;
  earlier resolves may exist and should not be declared invalid.
- Keep user effort low: “set up and go.” Today's annotation fixtures are a
  development aid, not the intended permanent need to mark every track manually.

Canonical fixture: `controller/scripts/subbeats-reference-tracks.json`.
Do not reintroduce a second divergent copy under `docs/`.

| Track | Incoming release | Suitable intro bars | Outgoing outro start |
| --- | --- | --- | --- |
| Mystery Land (original mix) | 00:57 | 16 | 04:00 |
| Suburban Train | 00:27 | 16 | 03:54 |
| 1998 (Matt Darey mix) | 00:41 | 16 | 03:39 |
| Diving Faces | 00:27 | 16 | 03:54 |
| Beachball | 00:20 | 4 | 04:20 |
| The Orange Theme (Moonman's Orange Juice mix) | 00:14 | 8 | 04:00 |
| Madagascar (Ferry Corsten remix) | 01:36 | 16 or 32 | 03:54 |
| Universal Nation (Ferry Corsten 99 remix) | 01:08 | 16 or 32 | 03:39 |

## Implemented browser behavior

Library → Sub/Beats automatically uses reference mode when **both** chosen
prepared tracks have annotations. It shows the saved outgoing outro and incoming
release, offers only the incoming track's supplied lengths, and defaults to the
longest available one. Thus Universal Nation currently defaults to 32 but can be
changed to 16; the latest acceptance did not request changing that UI default.
Other prepared pairs retain the previous 16-bar stem preview and manual ±2-bar
shift. Reference mode does not apply that shift.

The accepted reference mixer is a **full-mix musical blend with drums+bass
support**, not Stem Blend. It uses quarter-note fits to align the source-time
annotations, stretches incoming audio to outgoing tempo, and blends over the
chosen window. As outgoing musical audio fades, a four-bar drums+bass loop fills
the lost rhythm. Rhythm continues to the incoming release and fades over the
following bar. If the outgoing source ends earlier, its original ending blends
into the loop over one beat. A fixed 10ms loop seam does not shorten beat cycles.
Only a constant composite loop gain and a constant output headroom gain are
applied; there is no independent stem leveling or dynamic limiter.

Incoming tempo remains matched for the whole preview. Native-tempo return and
more elaborate vocal/stem handling are not implemented by this increment.

The seekable timeline reports source entry points, loop support and source,
original EOF extension when used, incoming annotated release and the handover.
Changing a track or length, leaving the page or losing auth cancels/discards the
browser audition. Completed audio can be replayed without rendering again.

### Source and cache behavior

Existing prepared head/exit stems often do not cover the natural file ending or
the desired incoming followthrough. Reference previews therefore also fetch the
complete original recordings serially, on CPU, with a 256 MiB cap per temporary
source. They decode from sample zero and remove downloads on success/failure.
This does **not** request new separation or GPU models, rewrite prepared bundles,
or use the ordinary stem cache.

Source duration must match preparation. Exact source hashes are accepted; if
container/tag bytes differ, the first eight seconds must match the restored
prepared head reconstruction within 10% relative RMS error at the same clock.
Several actual downloads differ in byte hash but passed this audio check. Do not
replace this with hash-only rejection without addressing those recordings.
Silent/mismatching heads and incomplete sources are declined.

Preview format is **version 5**. Fingerprints include renderer/library version,
prepared manifests, playback gains, reference timestamps and chosen length;
source URLs/credentials are excluded. Cache hits need no source download. An
older analyzer response without `timeline.kind = reference` is declined instead
of silently returning the older mixing method.

Previews are under `state/subbeats/previews`, capped at 200 MiB. When needed,
the renderer recycles the oldest verified generated preview folders under the
preview lock. It checks fingerprint-directory identity, file hashes and exact
folder contents before removal. Unknown files and prepared/regular stems remain
untouched. This was necessary because development auditions filled the preview
cache. It is **not** a general prepared-stem eviction policy.

Last reported preparation state was 49 prepared tracks. Existing prepared stems
are FLAC with restored storage gains. No recheck is needed for this preview
change. General ordinary stem-cache prioritization/improvements remain deferred
on this feature branch, as previously agreed.

## Code map

- `controller/scripts/subbeats_reference_preview.py`: accepted reference renderer,
  source checks, four-bar rhythm loop and timeline.
- `controller/scripts/subbeats_preview.py`: version-5 publication/cache handling;
  preserved legacy renderer; reference dispatch and safe preview recycling.
- `controller/scripts/subbeats_reference.py`: read-only reference audit and
  sustained-kick tempo proposals, including 3:4 alias checks. It keeps ambiguous
  alternatives explicit; this is not a phrase detector.
- `controller/scripts/subbeats-reference-tracks.json`: the eight owner fixtures,
  including estimated displayed bar counts and Madagascar notes.
- `controller/src/music/subbeats-references.ts`: preview-only projection of those
  fixtures; never imported into picker/broadcast policy.
- `controller/src/routes/library/subbeats.ts`: admin/prepared/blocklist guards,
  server-owned annotation selection and normal playback gain resolution.
- `controller/src/music/analyzer.ts`: sidecar/local transport and old-analyzer
  response guard. Original-recording URLs are created here, not accepted from UI.
- `controller/src/schemas/subbeats.ts`: request, view and timeline contracts;
  web mirror generated through `npm --prefix controller run gen:schemas`.
- `docker/analyzer/server.py`, `controller/scripts/analyze_worker.py`,
  `docker/Dockerfile.analyzer`: request forwarding, bounded original downloads
  and packaged CPU helpers. Default analysis download semantics are preserved.
- `web/components/admin/SubbeatsPanel.tsx`: reference length/source points UI.
- `web/components/admin/library/useJoinPreview.ts`: shared browser audition hook;
  Sub/Flow's existing endpoint and behavior remain intact.

## Validation completed

- Controller Sub/Beats suites: 18 tests passed.
- Registered analyzer Python suites passed, including five new reference checks,
  rhythm-envelope/one-bar release, full-cycle fractional-sample looping, source
  verification and cleanup, secret-free cache reuse, safe preview recycling,
  sidecar forwarding/model-use checks and explicit download cap semantics.
- Controller and web lint/typechecks passed; controller has existing warnings.
- Web Library: 29 tests; admin-query: nine tests; static query audit passed.
- Library search browser checks and all six query-cache browser checks passed.
- Desktop/mobile reference preview checks passed: length defaults/options, source
  and EOF markers, seek/replay, cancellation, four-bar case, legacy shift and no
  horizontal overflow or page errors.
- New renderer reproduced the two accepted offline WAVs within one PCM16 sample
  step; repeated requests reused the saved clip without fetching originals.

Run heavy checks **serially**. Test runners use a single substring filter;
passing multiple filters does not run both. Relevant commands, each separately:

```bash
npm --prefix controller test -- subbeats
npm --prefix controller test -- analyzer-python
npm --prefix controller run lint
npm --prefix web test -- library
npm --prefix web test -- audit-admin-query
npm --prefix web run lint
node web/scripts/audit-admin-query.mjs
```

Browser verification used an isolated fixture API/web on 7791/7793 with temporary
state and test:test auth, never the station's library state. Both temporary
servers were stopped afterwards; transient Next-generated `next-env.d.ts`
changes were restored. The real-source smoke wrote only dedicated preview cache
artifacts; its two newly generated directories were assigned to analyzer UID/GID
10001 so they remain readable after rebuilding.

## Branches, deployment and operator preferences

- Development: `/home/jaz666/codex/subwave-sub-beats`, branch `feat/sub-beats`.
- Test station: `/home/jaz666/Docker/subwave`, branch
  `test-station/sleeve-notes-clean-20261014`.
- Implementation pushed on the owner's `jaz666` remote as `ae35e560`.
- Test-station implementation cherry-pick: `082b494f`; reference-audit/notes
  prerequisites were also cherry-picked as `f0704787` and `3699ffa9`.
- Earlier rollback remains intentional: development `5b16c11a`, station
  `207f2e1f`. Do not restore the rejected automatic planner.
- Source was integrated cleanly. This handover is an additional documentation
  commit after the implementation commits above.
- End-of-session read-only runtime check confirmed installed analyzer preview
  **version 5**, controller reference-preview support and the shipped annotation
  fixture. The web container started at **2026-10-30 22:16:12 UTC**. The owner's
  latest 16-bar listening feedback follows that rebuild; deployment is no longer
  merely a source-ready proposal.
- **The owner runs rebuilds. Do not run Docker builds or service restarts.**
  The agent supplied the command below; latest user feedback is that the 16-bar
  version sounds OK. Do not rebuild again merely to publish documentation.
- Keep existing compose overlays, CUDA setup and separate caches intact.

Rebuild command already supplied, if the owner needs it later:

```bash
cd /home/jaz666/Docker/subwave
docker compose --parallel 1 \
  -f docker-compose.yml \
  -f docker-compose.analyzer-gpu.yml \
  -f docker-compose.discord.yml \
  up -d --no-deps --build analyzer controller web
```

## Evidence and audition files

Local development artifacts live outside Git at
`/home/jaz666/codex/driving-beat-evaluation-20261028/`:

- `reference-1998-to-universal-32-bars-held-beat.wav`: accepted sustained-rhythm
  control. Mix starts 0:04, outgoing original ends 0:17.95, incoming release
  0:58.75, rhythm handover ends 1:00.46.
- `reference-diving-to-beachball-4-bars-held-beat.wav`: accepted short entry.
  Mix starts 0:04, release 0:10.83, rhythm handover ends 0:12.53.
- `reference-mystery-to-1998-16-bars-held-beat.wav` and
  `reference-mystery-to-1998-16-bars-looped-pattern.wav`: rejected pair controls.
- `render_held_beat_reference.py`, `render_more_held_beat_references.py`,
  `render_pattern_reference.py`: original experimental renderers. Production
  preview implementation is now in the repository; do not depend on these paths.
- `reference-held-beat-results.json`, per-pair reference JSON,
  `eight-reference-audit.json`, `HELD-BEAT-FOLLOWUP.md`: diagnostic history.
- `subbeats-browser-reference-results.json`: new renderer versus accepted audio.
- `subbeats-reference-browser.py`, `subbeats-reference-browser-fixture.mts`,
  `subbeats-reference-browser-checks.json`, `subbeats-reference-desktop.png`,
  `subbeats-reference-mobile.png`: repeatable UI fixture and verification evidence.

The earlier `reference-1998-to-universal-16-bars.wav` is the initial comparison,
not a saved copy of the subsequently accepted version-5 16-bar browser preview.
Do not label every similarly named earlier prototype as the latest accepted mix.
Analyzer `/tmp` copies and local test logs are expendable, not durable fixtures.

## Resume plan

1. Start from the current browser implementation and these accepted/failed
   references. The 16-bar browser result is now accepted too; no immediate repair
   or further annotation collection was requested at session end.
2. Discuss/choose the next small validation or detection step with the owner.
   A useful direction is testing more supplied reference pairs through the page,
   retaining both musical successes and failures to guide later pair selection.
3. The larger unsolved problem is choosing musical release/outro/loop points and
   assessing pair suitability automatically. Keep candidate evidence distinct
   from approval. Mystery Land → 1998 is the important negative example.
4. Near-source-edge incoming windows remain uncertain: Suburban Train nominally
   starts about 1.13 seconds before zero and Diving Faces about 0.36 seconds before
   zero at the annotated whole-second release times. Do not clamp these to zero
   or infer odd phrase lengths. Version 5 declines such a window pending a timing
   check. Mystery Land's head lacks a unique sustained kick fit; its working
   outgoing tempo does not establish a valid incoming entry.
5. Longer original-audio windows now avoid the old head-stem coverage limitation
   for Madagascar/Universal Nation previews, but do not claim new separated stem
   coverage or automatic release detection. Existing structure maps are evidence
   only; the rejected phrase planner remains removed.
6. Once broader references justify it, improve automatic timing/pair selection
   and normal-transition fallback. Live playback integration, native-tempo return,
   stem/vocal handling and ordinary stem-cache priorities remain future work;
   do not silently fold them into the completed preview change.
