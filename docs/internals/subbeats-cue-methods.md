# Sub/Beats cue-point preparation and preview

This optional test-station method brings the November listening/repetition
experiments into the existing preparation queue and browser preview. Normal
Stem Blend analysis and broadcast selection are unchanged. The current
16-bar Sub/Beats preview remains available for comparison.

## Operator workflow

1. In **Sub/Beats → Preparation**, select completed tracks, choose
   **Beat This! small · cue points** or **Beat This! full · cue points**, then
   **Recheck/retry selected**. The same method control is beside Prepare in
   Explore. Existing verified stems are reused; the selected source is fetched
   for cue analysis. Neither method implies that the full model is better.
2. In **Preview**, choose **Cue points · opening and tail blend**. Choose an
   outgoing and incoming track that have saved candidates, then select their
   outgoing rhythm-handover and incoming musical-arrival points. Defaults are
   ranked suggestions; another saved point can be selected without reanalysis.
3. Play and compare. The incoming source starts at its opening, with its
   vocals/other content retained. Its drums/bass take over around the selected
   arrival; overlap length follows that arrival rather than always being
   sixteen bars. Outgoing vocals/other continue through a separate tail fade.
4. If the pair's tempo, grid, vocal arrangement or available stem coverage does
   not suit the preview, select another cue/pair or return to **Current ·
   16-bar stem exchange**. A failed cue preview does not silently render a
   different method. There is no automatic library-wide recheck or broadcast
   admission.

For the exact research references, Urban's accepted musical/last-word boundary
22.38s and Gusto's accepted groove release 22.94s are retained among runtime
candidates. They are not hard-coded IDs or timestamps in the algorithm. Longer
saved regions also produce additional candidates. Gusto's low background-vocal
groove is in `other`; its later vocal passage around 54s is a separate event.

## Preparation and persistence

`subbeatsPreparationMethodSchema` accepts `classic`, `small0`, `final0`; missing
method retains current preparation. The controller persists the requested
method per admission and forwards it to the managed analyzer operation.
Existing short-window library analysis is not rewritten. The result adds
`cuePoints` with model, artifact key and up to eight candidates per role.
An older analyzer cannot silently report successful cue preparation without
returning the new data. Assess suitability remains a saved-stems-only action.

`subbeats_cues.py` uses official Beat This! 1.1.0 on the original complete mix,
CPU float32, no DBN, two Torch threads during inference. The previous thread
count is restored afterward. Each candidate needs continuous four-beat bars
and a local linear beat fit; gaps and changing bar counts are not projected
through. Tempo comes from the local accepted beat sequence. Small/full choices
can produce different positions and tempos.

Within the prepared head/exit coverage, the existing energy, mel and chroma
features describe arrangement change. Ordered 1/2/4-bar block comparisons
describe breaks in repetition. Absolute heuristic evidence floors permit no
candidates in flat/unsupported material. Nearby alternatives are suppressed,
then the eight strongest are retained. Scores are descriptive, not calibrated
phrase or mix-safety probabilities. No forced four/eight/sixteen-bar section
segmentation or source-zero phrase origin is added.

Cue artifacts are immutable integrity-checked bundles beside existing stem
and structure artifacts in the shared track cache. Their identity includes
source hash, stem-manifest hash, algorithm/model/version and pinned checkpoint
hash. Their byte growth uses the existing shared allowance, writer lock and
atomic-publication path. Switching models adds a small analysis artifact,
not another stem separation. Preview loads the saved artifact and checks that
it still belongs to the selected stem manifest. A replaced source invalidates
queue cue evidence along with its stem bundle.

## Preview scope and limits

The API accepts a method and two bounded candidate indices. It takes artifact
keys and source positions from the saved server records, not supplied URLs,
arbitrary times or client-provided artifacts. The new mode rejects mixing
reference fixtures, bar shifts or Find matches plans into the same request.
The existing authentication, availability/blocklist, serial rendering, cache
integrity and loudness-gain paths remain in force.

`subbeats_cue_preview.py` auditions existing head/exit stems only. It adjusts
the incoming tempo within 8%, keeps source-zero opening content, exchanges
drums/bass over one bar before the selected arrival, and carries outgoing
`vocals` **and `other`** beyond that event. The outgoing continuation is at
least two bars; observed vocal passages can extend it. A half-second final fade
follows the measured passage padding. No loop is created. Incomplete coverage
or a preview longer than 120s is refused with a cue/pair recovery message.

This is a practical listening method, not a guarantee of complete sung phrases,
sample decay or compatible simultaneous voices. Energy gating can miss samples
in `other`; the two-bar continuation is a bounded audition default, not a
certified tail length. Both incoming voices/background groove and outgoing
voices are retained, so vocal overlaps require listening. Incoming tempo stays
matched through the end of the preview. Stretching can alter transient timing;
this first version does not run another neural tracking pass after stretching.

Ideas from djcues (separate musical cue roles) and automatic-cuepoints (barwise
structural comparison) inform this method. Their applications/code are not
dependencies. CBM segmentation and the external All-in-One/Modal route remain
possible later methods, rather than controls that pretend to work today.

## Build and rollback

Heavy analyzer/AIO builds install `beat-this==1.1.0` alongside the existing
Torch/Torchaudio stack. A fixed-source build helper downloads both official
checkpoints and verifies their pinned SHA-256 hashes. Runtime preparation never
downloads weights. Lean images do not gain Torch/models. The advanced local
runtime override is `SUBBEATS_BEAT_THIS_MODELS`, a directory containing
`small0.ckpt` and `final0.ckpt`; hashes are still required. Missing/invalid
weights instruct the operator to rebuild the heavy analyzer or use current
preparation. Code and released weights are attributed in `CREDITS.md`.

Update controller, web and heavy analyzer together. The owner performs Docker
build/restart. To stop using the experiment, choose the current preparation and
preview methods; saved classic stems remain valid. No general analysis flag or
station setting needs changing, and no library-wide analysis command is needed.

## Validation

Focused checks cover weak repetition changes versus constant material,
rejection of missing-beat spans, artifact-to-stem integrity, source-prefix and
post-handover voice preservation, tail/coverage errors, durable method/results,
invalid method/index requests and server-owned artifact forwarding. Tests run
through the repository's isolated `npm test` wrappers. Real-model offline
checks use the exact Urban/Gusto sources and saved stem manifests outside the
station, retaining both accepted later boundaries among the candidates.

The implementation session records exact checks and station source status in
its final handoff. Docker images and station audio require the owner's rebuild
and listening; successful source checks do not establish a running deployment.

### November 3 source checks

The development candidate incorporates upstream `v1.30.0` (`03a48c21`). Its
cache integration retains selective cleanup protections and the release's
same-recording quarantine checks. Head-only or mismatched quarantines are
held rather than restored without evidence. The new upstream pick-time stem
setting remains off by default; it does not enable these cue methods.

An isolated browser fixture verified preparation-method forwarding, saved cue
selection, cue-preview requests, method switching and a 390px mobile layout.
Library search and all six query-cache browser checks passed. The UI detector
reported no deterministic findings. The fixture used temporary state and mock
preview audio, not the station's queue or library.

Separately, the actual cue renderer produced a 53.148s Urban → Gusto audition
from hash-verified copies of the existing stems, using Urban 116.620s outgoing
and Gusto 22.940s incoming cues. Incoming tempo adjustment was +2.9524%; the
outgoing voice continuation extended the result beyond the minimum two bars.
This verifies rendering, not an owner listening approval of the pair. The
artifact remains outside Git in the November research workspace.

The station-source candidate passed controller and web lint/typechecking, the
controller `subbeats` (59), `sub-flow` (49), `explicit` (101), `pick-stems`
(51), `orphan-purge` (84), `stem-cache` (61) and `analyzer-python` wrapper
checks, plus web `library` (37) and `audit-admin-query` (9) tests and the
admin-query audit. Controller lint retains existing warnings. Schemas were
regenerated from the station's full schema set. Heavy commands ran serially.
Docker builds, CUDA/AIO builds and running-station listening were not performed.

Station rebuild, from `/home/jaz666/Docker/subwave`:

```sh
COMPOSE_PARALLEL_LIMIT=1 docker compose -f docker-compose.yml -f docker-compose.analyzer-gpu.yml -f docker-compose.discord.yml up -d --build analyzer controller web broadcast
curl --fail http://localhost:7700/api/health
```

Broadcast is included for the release's sweep-level fix; rebuilding it briefly
interrupts the stream. Source rollback is `e4e22d34`; restoring running
behaviour also requires rebuilding the affected services from that source.

Outgoing cue choices display seconds relative to the library track duration: negative before the end, zero at the end. Incoming cues retain source-start timing; rendering still uses the original saved cue positions. This display-only follow-up was made without tests or checks at the owner’s request.

## Outgoing-first listening step

The owner requested two stages: establish the outgoing closing passage first,
then choose the incoming opening to fit it. In cue-point Preview, **Choose the
outgoing finish** works with one prepared track. Select the outgoing track and
cue, then **Listen from this cue to the end**. The browser auditions the complete
original recording from that position at its original speed, without an added
fade or an incoming track. This lets the operator hear whether the candidate
begins a complete ending or whether another major section still follows.

The authenticated controller proxies the original audio with a 256 MiB cap and
five-minute download deadline, keeping source credentials server-side. It does
not run the analyzer, write shared audio state, or change broadcast playback.
The first Listen loads the original recording; comparing another cue reuses it
in the browser. Native audio controls allow pause/seek. Cue changes pause the
audition; changing the track or leaving the page cancels loading and releases it.
Outgoing and pair auditions stop one another. An unavailable source or an
unsupported browser codec reports an audition error.

The chosen outgoing cue stays in the existing Sub/Beats workspace selection
while navigating its pages; it is not a durable approval or automatic natural-
finish classification. Incoming selection/ranking remains a later step. This
audition uses the original mix; the existing pair preview still uses stems.
No tests or checks were performed for this follow-up, as requested. Rebuild
controller and web together; no new cue preparation or analyzer rebuild is
needed solely for the outgoing audition.
