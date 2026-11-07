# Sub/Beats cue-point preparation and preview

This optional test-station method brings the November listening/repetition
experiments into the existing preparation queue and browser preview. Normal
Stem Blend analysis and broadcast selection are unchanged. The current
cue-point preview is the single browser method; the old 16-bar exchange controls
have been removed.

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

## Accepted listening references

The owner accepted original-mix head/tail metronome previews for
[DJ Jean — The Launch](../investigations/subbeats-research-20261103/launch-grid-evaluation.md)
and [Robert Miles — Children](../investigations/subbeats-research-20261103/children-grid-evaluation.md).
The Launch's 16-bar closing cue is bar 92, not a multiple of eight. Children
retains its complete beatless opening from source zero, with projected bar zero
around 14.59s and driving-beat entry/bar 16 at 42.60s. Its final outro beat has
approximately one second of echo beyond the closing phrase. These references
inform the implementation below; audio boundaries and grid markers stay separate.

## Outgoing recovery — algorithm 12

The 6 November audit reproduced all 36 missing outgoing roles: 34 prepared
tracks and two unmeasurable tracks. Nineteen were blocked by the primary
detector's sustained-kick entry rule, seven by its whole-recording fit, and ten
by its ending checks. An unreliable opening must not prevent a separately
measurable closing passage. The incoming detector and primary fitted-passage
detector are unchanged; the new route runs only when no outgoing cues exist.

The fallback projects bar boundaries from stable learned downbeats near the
opening or closing, and the existing fitted clock when available. EOF supplies
a bound, never the beat or bar phase. Candidate endpoints follow the fading
body at 20% of the recording's reference RMS, rather than requiring it to remain
above the primary detector's 40% threshold. Earlier supported endpoints within
the existing 16-second tail allowance can retain lingering vocals/effects after
the rhythm stops. No clear ending decay means no new automatic cue.

Each 16-bar span, or an 8-bar span when sixteen is unmeasured, needs at least
90% of expected learned beats within 80ms, a 95th-percentile error at most
100ms, an observed endpoint within 80ms and 75% supported bar boundaries.
The local refit can change tempo by at most 2% and move the projected endpoint
by at most a quarter beat. It tolerates isolated extra/missed events without
counting them as additional beats. Outgoing starts stay in the latter half of
the recording and the complete original ending is retained. A local clock
does not invent a global bar number when the full-track clock is uncertain.

Librosa independently confirms beat positions inside that closing span using
the last 100 seconds of audio. A measured eight-bar passage must confirm a
sixteen-bar span; four measured bars suffice for an eight-bar span. The complete
learned span still needs the fit above. Full-spectrum timing is tried first,
then 30–250Hz timing if necessary: offbeat hats/claps can otherwise dominate
the independent tracker. Half-beat disagreements are declined without shifting
the learned clock. These are bounded CPU checks on missing roles; no extra
neural model or HPSS pass is added. `decision.json.outgoing` records the fit,
independent phase measurements and the decline/acceptance reason.

The production-code replay recovered 26 of 36 missing outgoing roles, including
the two previously unmeasurable tracks. A fresh station scan then prepared all
109 tracks and confirmed that exactly the same ten still lack outgoing cues.
All 70 hash-verified working outgoing controls reproduced exactly, including
The Launch, Children and Rozalla; three other existing outgoing tracks had no
matching local source copy and were excluded from audio replay. Core incoming
outputs were preserved in all 106 replays. These are measured proposals, pending
owner listening acceptance, not proof of pair compatibility. See [the complete
track results](../investigations/subbeats-research-20261103/outgoing-recovery-v12-results.json).

Ten remain flagged: five lack measured ending decay; Orbital, Praise You,
Bicep and Encore une fois retain disputed timing; Summer of Love lacks a
supported closing span. The local listening pack and replay scripts are at
`/home/jaz666/codex/subbeats-outgoing-evaluation-20261106/`; `AUDITIONS.md` links
all 26 original-mix metronome clips with 16-bar, 8-bar and endpoint tones.

Rebuild analyzer, controller and web together, then recheck the **Missing
outgoing cues** selection with Beat This!. This writes new cue/coverage
artifacts and prepares the newly supported outgoing stems. Old artifacts stay
readable. No broadcast/picker integration or automatic library-wide rescan is
included.

Verification: 35 cue Python cases and the registered analyzer Python suites
pass; the controller Sub/Beats filter passes 63 cases. Controller typecheck and
scoped ESLint pass; the web schema mirror was regenerated.
The source is prepared for owner-run station testing; no services were rebuilt
or restarted and no prepared-library state was changed by the agent. The
previous station source, `2805c464` (algorithm 11), remains the rollback.

## Incoming timing corrections — algorithm 9

The 6 November review found that algorithm 8's later fitting anchor could
displace the offered arrival by seven bars. The later downbeat now supports
the tempo projection while the earliest supported downbeat remains the arrival.
This restores the previous arrival location without claiming that a stable
analysis-window edge establishes the musical release. Playback still starts
at source zero, and the existing fitted-passage route retains priority.

Fallback analysis uses the median tempo of its first eight stable windows.
It checks actual Librosa beat positions against the learned grid in the shared
supported passage, rather than relying on tempo agreement alone. At least 16
slower-grid beats are required; 80% must align, and the 95th-percentile error
must be within the smaller of 80ms and one fifth of the faster beat period.
Half/double-tempo evidence uses the slower beats against the faster grid.

A failed sixteen-bar span fit retains an unlabelled manual audition candidate
with `timingValidated: false`; it no longer advertises a verified sixteen-bar
option. Back-projection does not invent 8/16-bar arrivals inside gaps: the
span needs sufficient observed beats, a nearby endpoint beat and a sound fit.
Uncertain timing stays available under **Play selected cues**, with a review
label. Automatic transition selection and loop proposals skip these candidates
and retain their normal fallback. Previously accepted eight-bar options are
not subjected to the stricter sixteen-bar refit.

Each new cue artifact saves `decision.json`: the route, tempo proposal,
supported regions, selected window, phase-fit measurements and resulting
incoming candidates. It adds no model pass or duplicate source audio. Older
version-5 through version-8 artifacts remain readable; they gain these checks
only when rechecked. New preparation requires analyzer/controller/web version
support to be rebuilt together. No outro detection or live broadcast changes
are included.

Focused verification passed: analyzer Python suite (29 cue cases), six analyzer
adapter cases, 20 route cases, seven web selection cases, controller/web type
checks and scoped lint. Counterexamples cover a half-beat disagreement, failed
sixteen-bar refit, a seven-bar groove followed by a gap, preserved arrival
anchors, and automatic exclusion with manual audition retained. Replaying saved
grids with the same 5 November tempo evidence restores I Feel Love's 44.58s
arrival and Praise You's 61.34s later anchor; these numbers are controlled
regressions, not newly approved musical releases. The primary fitted detector
is byte-for-byte unchanged. No full-library audio reanalysis was run.

## Final incoming timing pass — algorithm 11

Praise You's expected 16-bar arrival at about 35.08s was discarded because a
brief extra Beat This! detection around 30s shifted the exact 65-item slice used
by the phrase refit. Algorithm 10 added a nearest-beat refit, but a preceding
per-event spacing gate still rejected the phrase when the stray detections made
its 95th-percentile error too high. Algorithm 11 lets the 16-bar route rely on
the robust fit instead: each expected beat is matched independently to the
nearest observed beat, and at least 90% plus the endpoint must land within 80ms;
the fitted 95th-percentile error must stay within 100ms and tempo within 2% of
the supported passage. Praise You's saved grid now yields the 16-bar marker at
35.08s, alongside its 8-bar marker at
17.58s and later supported marker at 61.34s. Other phrase lengths still use the
per-event spacing gate.

The latest algorithm-10 rescan still showed Praise You without that 16-bar cue;
I Feel Love retained its validated 44.58s arrival, and Beauty of Silence kept
three manual-review candidates. Replaying the saved Praise You grid through the
algorithm-11 path restored 35.08s. The two focused backprojection tests pass;
the controller Sub/Beats filter passes 63 tests, and controller lint/typecheck
pass. No station rebuild or rescan was run by the agent.

Beauty of Silence remains marked for manual timing review: its stable
Beat-This! grid and Librosa passage differ by about 195ms at 140 BPM, close to
half a beat. The owner-identified driving-beat onset at 5.26s aligns with the
Beat This! grid, but the full supported passage does not independently confirm
that phase. The preview remains available and automatic selection continues to
skip it. This is the final planned intro-detection change; no broader detection
rules or track-specific exceptions are added.

The owner subsequently rescanned all three review tracks on algorithm 11.
Praise You now has validated 8-bar/16-bar cues at 17.58s/35.08s and the later
61.34s marker; I Feel Love retains 44.58s. Beauty of Silence's three incoming
options remain manual-review-only. Algorithm-10/11 artifacts remain readable.
The incoming-detection work is complete; the algorithm-12 work above changes
only missing outgoing detection.

## Phrase preparation and preview — algorithm 6 / preview 13

Rebuild analyzer, controller and web together, then **rescan existing tracks**:
select them on Preparation, choose Beat This! small (or full), and use
Recheck/retry selected. Batches remain bounded to 100. An older cue/coverage upgrade
does not replace cue analysis; older results are excluded from this preview and
the page explains the rescan. Existing immutable artifacts are not bulk deleted.
The ordinary shared cache budget and eviction policy still apply.

New cue preparation creates a small source/decoder/separator identity artifact,
runs Beat This! and detects fitted passages, then separates the selected regions.
It skips the legacy full Librosa rhythm/structure analysis and its broad base
stems on the normal path. If the fitted passage finder finds no incoming cue,
preparation also runs the existing Librosa analysis in a temporary directory
and uses its supported tempo regions and onset strength as independent evidence
for a bounded early-opening fallback. Classic preparation/backend APIs remain
for compatibility; their preview controls, old match query, bar-shift controls
and workspace state are removed from the browser. Normal Stem Blend and live
picking/broadcast are unchanged.

Algorithm 6 addresses incoming gaps where the track's opening grid is usable
but the bass-gated passage finder misses a quiet or filtered beat. It accepts an
early Beat This! grid only when 32-beat windows have a stable fit and repeated
four-beat phase support, Librosa independently supports the tempo, and the grid
continues with the same phase. The selected opening must begin within the first
16 beats; a later phase conflict blocks this fallback. An eight-bar arrival
keeps the local opening rate. A sixteen-bar arrival is refitted from the exact
64-beat passage only when the observed phase, per-beat intervals, tempo and
whole-span residual all pass the conservative fit checks. When that route cannot
support a light intro, an onset-strength check may anchor a later driving beat
and project the original opening grid backwards. Every new marker is evidence
for preview, not an automatic suitability approval.

The existing fitted-passage method still takes priority, so tracks with saved
incoming cues retain those cue choices. The fallback only runs for a missing
incoming role. Version-5 cue artifacts remain readable for preview and matching;
rechecking selected tracks writes version 6. The owner-approved eight-bar
Lovestation and Papua auditions are protected from sixteen-bar correction by
the separate full-span fit: an irregular sixteen-bar run keeps its original
proposal, and no rate adjustment is applied to the eight-bar point. Lonyo's
one-bar-late natural release remains an arrangement-boundary issue, separate
from beat-grid timing.

The fitted grid uses sustained low-frequency pulses to establish an entry,
then robustly fits a constant tempo to the learned beats. It requires at least
85% timing support; observed model downbeats do not reset the established phase
later. A long opening can project backwards while retaining earlier bar-phase
information. Audio start remains source zero. Supported entries that are not 8
or 16 bars remain musical-entry choices without a forced phrase label. An
8-bar point inside a quiet beatless opening is not offered as an arrival; an
earlier point needs low-frequency audio support.
Full beat/downbeat predictions are retained in the cue artifact's `grid.json`.
Grid fit, projected origin, entry and phase disagreements remain estimated data.

For the ending, 50ms full-mix RMS frames distinguish the main body from quieter
fade/echo and the audible endpoint from EOF. The relative main-body threshold is
0.4 of the recording's 75th-percentile frame RMS; audible-tail threshold is 0.01,
both with an absolute -60dB floor. The closest four-bar continuation on the
established phase supplies an **estimated** musical ending, with 16/8-bar starts
before it. This is a phrase hypothesis, not section recognition or proof of
musical resolution. Material still active at EOF, unsupported grids, endpoints
outside the later half or a remaining tail longer than 16 seconds produce no
outgoing choice. Do not promise the accepted two-track precision for every fade.

Cache only the incoming source-zero prefix through the latest arrival plus
`max(17.28 seconds, eight incoming beats)` and a 50ms rounding handle. This covers
two bars and any supported 16-second outgoing tail at the allowed 8% adjustment.
Save outgoing stems from the earliest closing start through original EOF; 8-bar
choices reuse the same region. Demucs still receives four seconds of surrounding
context, which is discarded outside the retained bounds. For The Launch this is
about 46.14s head / 30.84s ending; for Children 59.93s / 36.04s. Broad 130/120-second
stem regions are no longer prepared for new phrase scans. Artifact identities
bind source, parent/cue manifests, separator settings and coverage policy.

Pair geometry retains the complete incoming prefix and aligns its chosen arrival
with the estimated outgoing phrase end. If that prefix begins before the saved
closing stems, preview uses the hash-verified original outgoing mix for the
lead-in, with a 30ms reconstruction seam into the stems. It does not separate or
cache extra lead-in stems. That prefix has unknown vocal content: discovery
refuses an incoming vocal there, and rendering conservatively treats the original
lead-in as vocal energy when rechecking the overlap. Empty vocal detections are
still uncertainty, not proof of silence; background vocals in `other` remain a
listening limitation. Saved coverage/vocal measurements are reused and cache-only
Assess suitability understands the new source/coverage artifacts.

The incoming drums/bass normally rise over the final four beats before arrival.
For a looped plan, that rise begins at the selected earlier loop, bringing its
groove in sooner while the repeated section delays later incoming material. All
outgoing stems retain their natural finish through EOF, including the last
rhythm beat and echo beyond the phrase marker. No phrase-boundary cutoff or
fixed one-second tail fade is applied. Incoming vocals/other and the original
prefix are retained; a fitted vocal-free two-bar drum loop may keep measured
overlapping vocals apart without trimming words. When its opening phrase has a
saved start, the loop uses the earliest vocal-free two-bar grid section before
the selected arrival, so incoming rhythm can enter sooner; rendering still
checks that the prepared drum stem contains usable audio and tries later safe
sections when an earlier one is silent. If no rendered Sub/Beat plan clears the
measured overlap, automatic pair planning falls back to the regular Subwave
crossfade preview. Cue previews remain bounded to 120 seconds and 8% tempo
adjustment.

## Operator workflow

1. Prepare/rescan tracks with Beat This! small or full; wait for completion.
2. In Preview, choose any prepared outgoing and incoming tracks. Track search
   filters both lists; a track with no usable cues can still use regular Subwave.
3. Choose **Find Suitable Transition**. It compares the selected pair's saved
   cue combinations, including supported 8- and 16-bar spans, checks tempo,
   coverage and vocal evidence, and tries the measured two-bar incoming drum
   loop when it can separate a detected clash. It renders the first passing
   plan among the highest-ranked combinations. When no cue plan passes, it
   prepares a preview using the station's configured regular crossfade length
   and curve. This is a preview decision, not queue or broadcast admission.
4. Review the selected plan in the timeline and listen for vocal bleed, phrase
   fit and musical/key clashes. Cue dropdowns and **Play selected cues** remain
   available for manual auditions. Arrival times count from source zero,
   including long beatless introductions; key compatibility is not assessed.

For the exact research references, Urban's accepted musical/last-word boundary
22.38s and Gusto's accepted groove release 22.94s are retained among runtime
candidates. They are not hard-coded IDs or timestamps in the algorithm. Longer
saved regions also produce additional candidates. Gusto's low background-vocal
groove is in `other`; its later vocal passage around 54s is a separate event.

## Previous cue coverage preparation — preview version 10 (superseded)

Historical contract for older artifacts; new preparation follows algorithm 5 above.
Before that earlier larger batch, rebuild analyzer/controller/web together. **Beat This!
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

## Pair transition planning — preview 13

**Find Suitable Transition** evaluates the outgoing and incoming tracks already
selected on the Preview page. It compares the prepared cue combinations and
ranks them by vocal fit, difference between the outgoing phrase and incoming
opening lengths, tempo adjustment and supported phrase span. The button renders
the first valid result among the twelve highest-ranked combinations; it does
not search for a different incoming track.

When saved vocal measurements show a clash, planning can keep the cue pair if a
fitted 8- or 16-bar incoming cue starts with a completely covered, vocal-free
two-bar drum passage. It estimates one or two repeats and requires the measured
incoming vocal passages to clear the outgoing vocals by at least one beat. The
renderer repeats only drums and leaves bass, other and vocals silent during the
inserted bars, then measures the rendered vocal timeline again. Usable drum
energy is required. Loop seam quality, background-vocal bleed and musical fit
still need listening.

If no cue combination exists or each rendered candidate fails its final audio
check, the automatic action prepares a regular Subwave crossfade preview using
the station's current crossfade duration and curve. This also covers prepared
tracks with missing/empty cue artifacts. The fallback is for audition only;
the regular transition path remains responsible for normal station playback.
Preview cache version 13 invalidates renders made with earlier planning rules.

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
