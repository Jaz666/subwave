# Sub/Beats cue-point preparation and preview

This optional test-station method brings the November listening/repetition
experiments into the existing preparation queue and browser preview. Normal
Stem Blend analysis and broadcast selection are unchanged. The current
16-bar Sub/Beats preview remains available for comparison.

## Intended destination in Subwave

Owner decision, 3 November 2026: preparation and browser preview are the development
surface for an eventual unattended Sub/Beats transition capability. They are not
the final product boundary. The two intended integration stages are below;
neither is connected to broadcast or picking today.

### Minimum: assess already queued pairs and upgrade suitable transitions

Assess adjacent queued tracks for Sub/Beats compatibility, regardless of which
picking path selected them. When a suitable, prepared pair plan is available,
Sub/Beats takes over that join from the default transition methods. Otherwise
retain the existing transition plan, including any eligible normal Stem Blend.
Do not reorder or replace already queued tracks merely to obtain a Sub/Beats mix.
Protected Sub/Flow internal joins remain outside this capability.

The integration belongs at the existing pair-aware queue handoff, alongside the
current Stem Blend opportunity (`broadcast/stem-blend.ts` and the queue's pair
drain). The controller remains responsible for queue order, eligibility, deadlines,
cue publication and fallback. A rendered Sub/Beats clip and its seam/cue changes
must be validated together before publication; a failed or late attempt leaves
normal playback intact. This records the integration boundary, not a decision to
reuse the browser endpoint or to impose every current Stem Blend setting on
Sub/Beats. Activation/settings and exact clip-seam integration remain to be designed.

### Ideal: shared follow-up discovery in both picking paths

Add a Sub/Beats follow-up discovery source/tool to both **Agentic Tools** and
**Track Shortlist**, through their shared discovery machinery. With a prepared
Sub/Beats track currently playing, it should find suitable prepared follow-ups
and offer them to the picker with pair-specific compatibility evidence. Existing
show, availability, blocklist, request, repetition and other picker constraints
still apply; compatibility does not itself enqueue a track or override editorial
selection. No suitable results means normal discovery continues.

Use the intended predecessor as the comparison anchor. With no intervening queue
entries, that is the currently playing track. If the new pick will be appended
behind queued tracks, it must fit the track it will actually follow, rather than
claiming a usable join against the on-air track. Recheck the actual adjacent pair
before playback if the queue or prepared evidence changes.

### Consequences for development now

- Build one pair compatibility assessment for preview, queued-pair admission and
  discovery. Its useful result is a specific outgoing/incoming cue plan with
  evidence and reasons for decline or uncertainty, not two independent “suitable
  track” flags. Discovery can rank candidates with that assessment; queue admission
  must also confirm the audio and deadline requirements for the chosen plan.
- Keep competing vocal passages apart while preserving complete vocal endings
  and entries. Tempo/grid fit, musical passage fit, valid source identity and
  sufficient stem coverage also constrain a plan. Duration matching and 8/16-bar
  labels guide candidates; they do not establish compatibility. Harmonic/Camelot
  key compatibility is a later addition.
- Preserve automatic cue selection as the eventual normal path. Manual auditions
  and the owner's pair-specific preferences are evaluation evidence, not a
  requirement for an operator to approve every future join.
- Prepare/cache sufficient audio ahead of playback. Preview may currently extend
  stems on demand, but discovery must not launch heavy separation and a live
  handoff must not wait for the preview's potentially 30-minute preparation path.
  Missing, uncertain, stale or late evidence means no Sub/Beats upgrade.

Vocal-aware assessment and saved-evidence discovery now run in the cue preview
(see below). Validate the suggestions by listening before enabling queued-pair
upgrades, then expose follow-up discovery to both picking paths.

## Planned refinement after The Launch auditions — 4 November 2026

**Recorded for implementation; current detector, renderer and cache policy are
unchanged.** The owner accepted the offline head/tail metronome auditions for
DJ Jean — The Launch, then requested a long-beatless-intro investigation next.
See [the reference and requirements](../investigations/subbeats-research-20261103/launch-grid-evaluation.md)
for exact timings, diagnostic evidence and audio locations.

The planned direction is a first-downbeat-anchored musical grid plus a natural
musical ending reference, with phrase-aligned 16/8-bar closing choices. File end
and the final detected beat are separate from that musical endpoint. The outro
section can support the decision without being a mandatory detection. Phrase
alignment need not be a bar number divisible by eight: the accepted closing
markers for The Launch are bars 92/100 within the 84 → 92 → 100 → 108 sequence.
These are listening references, not track-specific constants for the algorithm.

Narrow cached mixing stems and selectable cues towards the opening and closing
16-bar passages, reusing them for 8-bar choices. Preserve source-zero pickups,
natural ending decay, necessary seam handles and incoming continuation while
the outgoing finishes. Separation context need not all be retained. Lightweight
full-track grid/structural evidence may remain without becoming selectable cues.
The existing 130/120-second coverage is conservative current behavior; replace
it only alongside compatible selection, rendering and vocal checks. No automatic
cache deletion or bulk recheck follows from this plan.

Before implementation, evaluate the long beatless intro. Preserve its complete
opening and distinguish source zero from the first established beat; do not
assume sixteen bars starts at file zero or discard unmetered audio to fit a cache.

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

## Cue coverage preparation and upgrades — preview version 10

Before a larger batch, rebuild analyzer/controller/web together. **Beat This!
small · cue points** is the default preparation choice; full remains available,
and classic preparation remains an explicit option. Cue preparation now saves
reusable coverage and vocal measurements after detecting cues. These are not
claims that a track or every pairing is approved.

For existing cue-prepared tracks, use **Upgrade cue coverage** on Prepared tracks
(up to 100 missing entries) or select entries on Preparation and use its upgrade
action. The queued upgrade retains the original stem bundle and cue artifact,
uses their saved model choice, and skips Librosa/structure/Beat This! preparation.
It fetches the original to verify source identity, reuses sufficient cached stem
regions, separates missing regions, and saves incoming/outgoing vocal passages
with breath/release padding. A source change requires a normal recheck. Read-only
**Assess suitability** still checks the older classic windows; it is not this
coverage upgrade. Tracks without saved cues need a cue-point recheck first.

`subbeats_coverage.py` publishes an immutable `cue-coverage` artifact alongside
existing per-track bundles, under the shared cache budget and writer lock. Its
identity binds the source, base manifest, cue manifest and separator settings.
Publication is atomic; a failed/budget-limited build preserves existing bundles.
The controller-owned queue stores the coverage key and role measurements. Source
invalidation removes that evidence, and queued/interrupted coverage upgrades
retain the base bundle for retries and cache protection.

Coverage is bounded by the currently supported pair geometry: incoming source
zero through at most 130 seconds, and outgoing through the natural recording end
from at most 120 seconds before it. Only roles with detected cues are prepared.
For a preview at most 120 seconds long and an incoming rate at most 1.08, incoming
source use is at most 129.6 seconds; the outgoing start cannot precede EOF minus
120 seconds. These bounds cover all accepted cue combinations, without assuming
that every detected cue can satisfy the 120-second preview limit. Longer future
transition policies must revise this coverage contract. Continuous regions are
separated with normal context/reconstruction checks; partial old/new estimates
are not spliced. Legacy base regions remain available for classic previews.

Candidate search prefers these saved vocal measurements. Cue previews verify
and reload the coverage artifact, then slice it for the selected combination,
so different cue choices reuse the prepared stems. Version 10 includes coverage
keys/manifests in preview identity. Actual audio is still checked for vocal
clashes before playback. Legacy tracks without this artifact can still use the
temporary, on-demand extension path; that temporary work does not upgrade their
saved discovery evidence. Use the explicit upgrade to persist reusable coverage.
No automatic bulk recheck, cache cleanup, broadcast or picking is enabled.

## Playlist preparation and preview ordering

In Explore, choose **Collection → Playlist**, then a playlist. Only that playlist's
tracks already present in the local library are shown. Existing search, genre,
status, suitability and sort filters combine with playlist membership before
pagination, counts and bounded bulk selection. Duplicate entries appear once;
unknown library IDs are omitted. An empty or unselected playlist yields no rows;
an unavailable playlist fails the read rather than falling back to the library.
Playlist scope and ID survive URL refresh/bookmark navigation. The shared
playlist query reuses the existing Library cache. Playlist contents are not
modified, and cue-preview discovery remains across all prepared tracks.

Both preview track dropdowns are ordered by artist, then title, with stable ID
ties. Cue options and candidate suggestions retain their existing relevance
order. The owner's pair-specific 8-bar preference is not a global default.

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

Within the prepared incoming head and the original recording’s second half
for outgoing cues, the existing energy, mel and chroma features describe
arrangement change. Earlier outgoing context is used for comparison only. Ordered 1/2/4-bar block comparisons
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

## Next selection constraints: vocals, then key

Owner direction after auditioning the passage preview: keep competing vocal
passages apart. Prefer cue combinations whose outgoing vocal ending and incoming
vocal entry do not overlap, preserving complete passages rather than muting words
to force a fit. The existing `subbeats_vocals.py` passage estimates are reusable
for checking the actual tempo-adjusted pair timeline; they are not
used as an automatic pair approval. The version-9 renderer now refuses detected
overlaps using the same timeline assessment as discovery. Detection is an
estimate, not proof of vocal safety:
Gusto's low background-vocal groove can live in `other`. Listening remains needed.
If measured passages overlap, the cue preview refuses that combination and asks
for another incoming cue or outgoing finish. It does not suppress or trim words.

The owner preferred the 8-bar incoming in the Rozalla → Gusto pair they auditioned.
This is a pair-specific listening reference, not a global 8-bar preference or an
identified cue timestamp/edition. Duration fit remains a suggestion, subordinate
to musical fit and vocal separation.

Later, consider harmonic compatibility using the library analyser's Camelot key
evidence. Verify the existing key data and its reliability before wiring it into
selection. Key compatibility is deferred; it does not replace the vocal constraint.

## Find suitable candidates in the cue preview — version 9

Choose an outgoing track and closing cue, then **Find suitable candidates**.
The search compares all saved incoming cues of each other prepared, available,
unblocked track against that selected finish. It returns one suggested cue per
track and displays the first ten ranked tracks. **Use this suggestion** selects
the track and its original server cue index; **Play preview** auditions it.
Manual incoming choices remain available. Changing the outgoing cue, track or
saved evidence hides the old results until another search is requested.

`subbeats_cue_matching.py` shares `passage_plan` with the renderer and applies
`assess_vocal_pair` to the actual incoming placement/tempo ratio. Observed vocal
passages, including existing breath/release padding, must not intersect on the
shared timeline. Known clashes are excluded even when coverage elsewhere is
incomplete. Complete measurements with no detected clash rank first, followed
by uncertain/incomplete/missing measurements, then smaller tempo adjustment and
closer complete-opening/closing lengths. Empty detections do not establish a
vocal-free passage; missing coverage is explicitly labelled. No harmonic key
ranking or automatic word removal is applied.

Search reads only the saved queue measurements: no source fetch, separation,
stem-cache scan, model work or preparation queue mutation. The authenticated
`GET /library/subbeats/cue-matches` validates outgoing ID/index, filters library
availability and blocklist, and passes only server-owned jobs to the existing
analyzer match operation. Old analyzers cannot silently return classic matches.
Suggestions are not playback admission or source-integrity approval.

Before a cue preview renders, it measures the actual covered/extended stems,
reuses the same vocal timeline assessment, and rejects detected overlaps before
time stretching or mixing. Both complete vocal passages remain intact when a
pair passes. Version 9 invalidates old cached previews that allowed clashes; cue
reanalysis is not required just for this renderer change. Saved measurements may
be incomplete, so a suggested audition can still be refused after its full
coverage is prepared. Background vocals in `other`, detector misses, phrase fit
and harmony still require listening. Classic/reference preview behavior is
unchanged. No broadcast or picker integration is enabled.

## Preview scope and limits

The API accepts a method and two bounded candidate indices. It takes artifact
keys and source positions from the saved server records, not supplied URLs,
arbitrary times or client-provided artifacts. The new mode rejects mixing
reference fixtures, bar shifts or Find matches plans into the same request.
The existing authentication, availability/blocklist, serial rendering, cache
integrity and loudness-gain paths remain in force.

`subbeats_cue_preview.py` now plans the selected closing/opening passages in
original source seconds. For a closing candidate, the incoming arrival meets
its later `phraseEndSeconds`; an unlabelled outgoing point retains its rhythm-
handover meaning. Incoming source zero is retained. Its start follows from the
chosen arrival after tempo adjustment, so 8/16-bar alternatives need not enter
at the same time. Drums/bass exchange over the last bar before that meeting point; outgoing
`vocals` and `other` continue to EOF. The preview includes
at least two incoming bars beyond the handover. Version 9 refuses detected vocal
clashes before mixing (above). Voices/background grooves still
need listening, including Gusto's groove in `other`. There is no loop or automatic
broadcast/pair approval.

Saved stems are sliced and reused when they fully cover the required window.
Otherwise the preview fetches the complete original (256 MiB limit), requires
its source SHA-256 to match the prepared bundle, and separates a contiguous
required window with the existing four-second context and normal Demucs model.
The extension must reconstruct the source within the existing tolerance. A
changed source or separation model/overlap requires an explicit track recheck.
Late tails use saved cue tempo rather than requiring the old percussion fit.

New and upgraded cue preparations save reusable coverage in the shared per-track
cache (above). For legacy entries without saved cue coverage, on-demand extensions
remain temporary preview work; another selection can need another separation. Repeating the exact pair/cue/gain/manifests uses the verified
cached WAV and performs no fetch or separation. Temporary stems are deleted on
success/failure. The existing 200 MiB preview-cache cap still covers published
WAVs; staging/decoded/model memory is separate. Source URLs never enter saved
fingerprints/manifests. Output remains bounded to 120 seconds and 8% incoming
tempo adjustment. Oversized or unsupported pairs are refused without trimming
away their original opening or natural ending. Incoming tempo remains matched
through the preview. Classic/reference previews keep their existing behavior.

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

## Historical algorithm 2: final-quarter outgoing selection and fades

Owner correction: an outgoing cue must lie in the final quarter of the actual
recording. Algorithm version 2 searches that part of the original full mix,
with up to 32 seconds of preceding context. It no longer restricts detection
to the old exit-stem window, which may stop at an earlier loss of percussion.
The 75% cutoff is applied before ranking and limiting to eight candidates, so
strong earlier changes cannot crowd out legitimate ending candidates.

A supported downbeat may also be a fade candidate when bar-level energy begins
a gradual decline, the ending is at least 6 dB lower, and the level does not
recover. The first supported onset gets a separate label and is retained ahead
of ordinary changes. This is an energy-based suggestion, not proof of a phrase
boundary or a complete vocal ending. Flat or unsupported endings may have no
candidates; there is no fallback to an earlier section or an invented beat grid.

New results include decoded recording duration for the countdown labels. The
web filters older choices to the final quarter without changing their saved
indices, and the pair API enforces the same bounds. If older results have no
eligible cue, the menu asks for a recheck. Versioned cache identity ensures a
Beat This! recheck computes fresh cue evidence while reusing verified stems.
Both selected tracks need refreshed cue artifacts for the stem pair preview.

The original-recording audition can play these later cues independently of stem
coverage. Existing exit stems can still end too early for a newly detected cue;
the pair renderer reports that coverage limitation. Extending stem coverage and
fitting the incoming opening belong to the next stage, not this outgoing fix.

Focused verification passed: seven cue Python cases through the analyzer-Python
wrapper, sixteen route cases, six web selection cases, controller/web type
checks and targeted lint. On the source/hash-verified Rozalla research recording
(213.600s), the final quarter starts at 160.200s. Reusing its previously saved
small0/final0 inference, both models yield a structural candidate at 163.040s
and a fade candidate at 188.900s, with all candidates inside the final quarter.
The owner's approximate outro reference is 161s; no track timestamp is hard-coded.
This is not a fresh model run or owner approval of either new candidate. Local
probe evidence is retained in the November research workspace as
`final-quarter-rozalla.json` and `probe-final-quarter.py`.

Rebuild controller, web and analyzer together, then recheck the selected tracks
with a Beat This! preparation method. Older analyzers that omit decoded
duration are explicitly refused with an update message. No library-wide
reanalysis is required.


## Closing-passage guidance: algorithm 3

The owner clarified that the final quarter was a rough estimate. Outgoing search
now covers the second half, with up to 64 seconds of earlier comparison context.
This is a bounded search window, not a universal DJ convention. Both browser
filtering and pair-request validation use the same second-half bounds and retain
original saved indices. Incoming selection and rendering are unchanged.

Outgoing ranking first considers pairs of existing structural candidates exactly
8 or 16 observed four-beat bars apart. Every intervening bar must be complete,
with continuous timing. The later change must lead to a sustained quieter ending:
its initial level is 1–6 dB below the passage median, at least 75% of subsequent
measured bars remain at least 1 dB below that median, and no two-bar average rises
above it. A candidate beginning inside the detected fade gets no closing-phrase
promotion. Boundary strengths rank qualifying alternatives, with a small 16-bar
tie preference. No timestamps are manufactured by subtracting bars from EOF.

These are **closing-phrase hypotheses**, not section/vocal recognition. The later
change may be a reduction within the outro or fade, rather than the musical end.
The menu labels `8-bar closing candidate` / `16-bar closing candidate`, and the
selected cue explains its later change separately from file-end zero. Ordinary
structural alternatives remain available; the first recorded fade onset has one
reserved alternative slot and no automatic first-place preference. Unsupported
tracks retain ordinary candidates or an empty result, without forced phrase labels.

Optional `phraseBars` and `phraseEndSeconds` accompany promoted cues. Public
payload version stays 1; `algorithmVersion: 3` and immutable cache identity 3
identify refreshed analysis. The controller rejects older analyzers during a
Beat This! recheck. Existing saved choices remain readable; cue-pair rendering
requires refreshed artifacts. Recheck the selected tracks after rebuilding
analyzer/controller/web together; verified stems are reused. Existing exit-stem
coverage limitations still apply to pairs, independently of original-mix audition.

Offline comparison reused hash-verified original audio and previously saved
small0/final0 inference for five tracks (ten model/track combinations). Both models
rank Rozalla 163.040s first, with 16 measured bars to 192.560s, followed by an
8-bar alternative at 177.820s; its fade at 188.900s remains separate. Urban Cookie
Collective and Afro-Left also receive closing candidates. Gusto and Cubik receive
no phrase labels. This checks counting/ranking, not listening acceptance or
proof of phrase origin. See [track evidence](../investigations/subbeats-research-20261103/outgoing-phrase-evaluation.md).


Verification for algorithm 3: nine cue Python cases through the analyzer-Python
wrapper; 59 controller Sub/Beats cases (including six adapter cases); six web
selection cases; controller/web typechecks and targeted lint. An isolated
fixture checked desktop/mobile closing labels, countdowns, later-change text,
8-bar/fade selection and original pair indices without browser errors. Library
search and all six query-cache browser checks passed. The mechanical UI detector
reported no findings. The admin-query audit still reports the pre-existing
imperative original-audio download in `OutgoingCueAudition.tsx`; that action is
unchanged and intentionally loads audio only on Listen. No services, shared
library state or live preparations were changed by these checks.


## Incoming opening passages: algorithm 4

After previewing outgoing tracks, the owner authorized the equivalent incoming
selection/audition stage. Within the existing saved incoming head, arrivals can
now carry `phraseBars` (8/16) and `phraseStartSeconds`: the measured passage starts
at the first complete learned bar or an existing structural boundary, and ends
at an independently supported arrival change. All intervening four-beat bars
must be continuous; an energy reduction over 1 dB is not promoted as an arrival.
Phrase ranking considers structural strength, energy growth and earlier entry.
Three strongest spaced original changes retain menu places so phrase hypotheses
do not remove useful unconstrained cues. No phrase boundary or vocal safety is
claimed. Outgoing algorithm-3 ranking is unchanged.

Incoming labels count forwards from original source zero. **Listen to this opening** auditions the full original recording from zero until
two bars after the selected arrival, at its original speed, without an added
fade. It preserves quiet prefixes and Gusto's `other`-stem groove. Changing cues
pauses/resets playback and reuses the downloaded audio. Outgoing, incoming and
pair auditions stop one another; changing tracks/unmounting cancels loading and
releases resources. Incoming-only audition needs one prepared track and no
outgoing selection. The shared `CueAudition` component replaces the outgoing-only
component. The authenticated bounded `/source-audio/:id` proxy supports either
cue role, retaining `/outgoing-audio/:id` as a compatibility alias. No source
credentials, shared audio-state writes or live broadcast changes are added.

When the selected outgoing cue has a later closing change, incoming choices are
ordered by the difference between its closing-passage duration and the complete
incoming opening duration after tempo adjustment (`arrival / (outBpm/inBpm)`).
Out-of-range tempos sort last; original server indices remain intact. The first
choice is selected when choosing an incoming track. A different choice remains
manual, with **Use closest opening length** available. This is a duration
comparison, not automatic compatibility approval. The UI explicitly states that
the existing pair preview still aligns rhythm handovers. It does not claim that
matching the displayed lengths has changed pair placement or solved late exit-
stem coverage. Incoming listening acceptance comes before that rendering step.

Cache identity/preparation responses advance to algorithm 4; public version is
still 1. The controller refuses old analyzers for new cue preparations. Saved
algorithm-3 outgoing choices remain readable and usable in pair requests when
their source/stem integrity checks pass, so accepted outgoing choices need no
mandatory recheck. Rebuild analyzer/controller/web and recheck incoming tracks
with either Beat This! method; existing stems are reused. No automatic or
library-wide preparation is triggered.

See [incoming track evidence](../investigations/subbeats-research-20261103/incoming-phrase-evaluation.md).
Five tracks/two models were compared using saved inference; accepted Urban/Gusto
arrivals remain present, and all ten outgoing result lists remain identical.


Verification for algorithm 4: 10 cue Python cases via the analyzer-Python wrapper,
60 controller Sub/Beats cases (including incoming-only source authentication and
old-alias handling), seven web selection cases, controller/web typechecks and
targeted lint. Browser checks cover full opening playback without an outgoing
selection, cue reset/audio reuse, two-bar stop, all three players' exclusion,
closest-length selection, original pair indices and desktop/mobile layout. The
Library search and six query-cache checks pass. The source-download exception
is now registered narrowly with the admin-query audit; the audit and its nine
self-tests pass. The mechanical UI detector reports no findings.


## Selected-passage coverage and placement: preview version 8

The owner hit the old `closing cue is outside the saved outgoing stems` refusal.
Cue selection itself is retained; only pair rendering/coverage changes. The
controller supplies server-owned original source URLs for both selected tracks,
ignoring client-supplied URLs. The sidecar forwards those URLs only to its worker;
changed-source checks, download caps and sample-clock checks precede separation.
An older sidecar/controller pair needs rebuilding together. No cue recheck is
required solely for this renderer change.

The first cue preview may use Demucs. Its deadline is 30 minutes rather than the
CPU-only three-minute default, and existing managed/standalone bulk preparation
blocks a new cue preview. The normal analyzer pool and model lock schedule
separation. Model-use reporting updates worker idle handling only when coverage
was actually extended; WAV cache hits report no model use. Cancelling closes the
browser request; native separation may finish internally and leave a reusable
cached preview. No library queue, track admission or broadcast control changes.

The first source-verification test used original Rozalla audio with deliberately
missing outgoing coverage, previously verified Gusto head stems and isolated
parent/cue manifests. It selected Rozalla 163.040s → 192.560s and a saved Gusto
16-bar arrival at 30.560s, without assuming a dropdown ordinal. The CPU render
completed in about 91 seconds, extending outgoing coverage only. Its 54.636s
preview retains incoming source zero, aligns the arrival at preview 33.596s with
Rozalla source 192.560s, and carries Rozalla through source EOF 213.600s. Repeating
it used the cached WAV with no source fetch or model use. This is a numerical /
coverage check, not owner listening approval. The host's private station cache
could not be read directly, so the test used isolated parents and prior verified
incoming copies rather than claiming to replay the live station's full bundles.
See [test evidence](../investigations/subbeats-research-20261103/passage-preview-evaluation.md).


Verification: 11 cue Python cases via the analyzer-Python wrapper (including
source integrity, temporary coverage/reuse, settings mismatch, missing models,
full-prefix/full-tail mixing, and 8/16-bar placement); controller Sub/Beats 60
and focused route 17 cases; controller/web typechecks and targeted lint; seven
web selection cases. Desktop/mobile preview controls, source auditions, Library
search and all six query-cache browser checks passed on temporary fixture state.
The UI detector reports no findings. Real Demucs/source test details and its
scope limits are recorded in the linked evidence. No Docker builds or restarts
were run by the agent.
