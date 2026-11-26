# New Style Stems: wider tempo admission, EQ and clash control

Date: 25 November 2026. Status: implementation proposal; no playback, settings,
preparation data or station images changed by writing this plan.

## Outcome and implementation order

Make Stem Beats available to more genuinely beat-compatible pairs, with a
smoother tempo journey and more audible movement through the transition.
Then widen Regular Stem Blend admission while controlling competing rhythms,
vocals and instruments through the mix instead of adding more rejection gates.

Deliver in this order:

1. Establish the actual tempo limits, then implement and audition wider Stem
   Beats admission with a complete tempo/timeline plan.
2. Add independently auditionable bass exchange and brightness automation to
   Stem Beats. Compare longer ramps and, subsequently, longer overlaps.
3. Add coordinated rhythm and vocal handoffs to Regular Stem Blends, then
   widen its BPM gate in the offline comparison path.
4. Select the treatments by listening, verify the production path and deploy
   a bounded New Style candidate after separate station authorization.

The existing eight-bar intro/outro guideline is the first comparison baseline.
A transition can remain eight bars long while its competing rhythm sections
overlap for only a small part of that time. Compare sixteen-bar Stem Beats
overlaps later, using suitable measured passages rather than extending every
transition automatically. Bars always mean musical bars, not individual beats.

Legacy Stems retains vanilla settings, preparation and playback. Keep New Style
behind the existing mode switch. Do not restore the retired V1 Sub/Beats queue,
preparation jobs, endpoints or renderer to support these experiments.

## Baseline, source selection and existing evidence

The attached development checkout is
`/home/jaz666/codex/pr10-integration-20261118`, branch
`codex/subbeats-role-policy-station-20261120`, committed at `58a59a803` with
substantial uncommitted work. Preserve it. The locally available draft-PR
reference inspected for this plan is `jaz666/feat/subbeats-draft` at
`710e256b1f2984837e4e8f82a02c910d4ae30084`. Its 25 November
[handover](https://github.com/Jaz666/subwave/blob/feat/subbeats-draft/docs/plans/2026-11-20-stem-blends-subbeats-handover.md)
is newer than this checkout's historical handover. The station also contains
uncommitted GPU/provider and pick-time work which is not all in that PR.

Before implementing, fetch and identify the current draft head and select a
development base containing the reviewed prerequisites. Do not copy the whole
dirty integration or station diff, push this stale branch over the draft, or
deploy unrelated edits. Record the actual source revision and local additions.

Specific baseline facts found in the inspected source:

- Stem Beats already checks `abs(outgoingBpm / incomingBpm - 1) <= 0.08` in
  TypeScript pair admission and Python passage planning. The timing schema also
  restricts the incoming rate to `0.92..1.08`. Widening Stem Beats therefore
  starts from approximately eight-percent incoming adjustment, not three.
- The current V2 planner keeps the outgoing track at native tempo, adjusts the
  incoming track, then returns it to native tempo. The live V2 path uses a
  16-beat return, although older helper defaults use eight beats. Verify the
  effective deployed value rather than treating either as sixteen bars.
- TypeScript and Python independently calculate extraction/timeline positions.
  Both must agree after any timing change; preview helpers have further limits.
- Regular Blend policy on the draft reference still uses its approximately
  three-percent tempo gate and measured eight-bar windows. Existing experiments
  delay incoming drums, rhythm or vocals; they do not fully coordinate the
  corresponding outgoing stem's disappearance.
- Stem Beats prep stores source-bound cue/grid evidence in V2 artifacts under
  the configured stems root, with shared grid evidence also in the library DB.
  It is not a database-only process. Pair-specific stem separation happens later.
- The owner heard rhythm clashes in Dance/Dance and Dance/Electronic samples,
  vocal clashes in Indie/Rock, and preferred the Rock sample. They also prefer
  a gentler tempo transition than the shared 127-to-123 BPM Hot Mix sample.

These observations justify audition candidates; they do not establish that a
particular wider gate, EQ curve or ramp is already acceptable on air.

## 1. Wider Stem Beats admission and a complete tempo plan

### 1.1 Separate pair gap, per-track stretch and grid suitability

Use distinct quantities in policy, schemas, logs and tests:

- Current one-sided rate: `outgoingBpm / incomingBpm`.
- Symmetric pair gap for new trial ranges:
  `100 * (max(outgoingBpm, incomingBpm) / min(outgoingBpm, incomingBpm) - 1)`.
- Actual rate and maximum adjustment applied to each track.

Reversing a pair changes the current directional rate percentage. Do not
silently reinterpret old boundary cases as the same numeric percentage under
the new symmetric definition. Preserve regression fixtures for both directions.
Do not fold half/double tempo readings unless the measured beat/bar mapping
supports the resulting musical placement; a numeric BPM match alone is not
proof that the phrases or grooves agree.

Use a provisional **12% symmetric pair-gap ceiling for offline experiments**,
with no track moving more than 6% from native speed in the split case. This is
an audition range, not an approved production default. Keep the existing
single-sided route as a baseline. Require split adjustment for newly admitted
pairs beyond its supported rate range; optionally compare it within that range.
Do not ship a simple replacement of every `0.08` with `0.12`.

The 127/123 example already fits the current eight-percent rule. Use it to
compare smoothness, not as evidence that widening admission found a new pair.
Include real pairs previously excluded specifically by tempo in the new cohort.

Retain source identity, measured grid/coverage, cue, decoded-boundary and
deadline checks. Do not relax grid reliability or expand Dance Candidate genre
and absolute-BPM discovery rules in the same change. Count discovery exclusions
separately so the effect of widening pair admission remains measurable.

### 1.2 Add split tempo without breaking the source clock

For split adjustment, let `T = sqrt(outgoingBpm * incomingBpm)`, with playback
rates `rOut = T / outgoingBpm` and `rIn = T / incomingBpm`. Reject the split
candidate if either actual rate exceeds its tested per-track limit. For
120/134 BPM, the symmetric gap is about 11.67%, while each rate moves less
than 6%; both track orders must be tested.

Plan an outgoing ramp that reaches `rOut` before the synchronised overlap.
Hold both rates through the overlap and any remaining audible outgoing tail.
Return the incoming track to native speed only after outgoing audio is gone.
Do not independently stretch stems from the same track with different clocks.

Represent each track's rate profile explicitly. Source position advances by
the integral of playback rate over output time; cue positions, complete source
end, stem offsets and original-track resume must all follow that mapping.
Keep source seconds, output frames, beats and bars distinct in the protocol.
Do not reuse the current native-outgoing timeline algebra for a ramped track.

Prefer one authoritative pair plan which the renderer validates and consumes.
If controller planning remains in TypeScript and rendering in Python, define
one versioned contract and run shared golden timing fixtures through both.
Preview and pick-time rendering must use the same plan and treatment behavior.

### 1.3 Make ramp duration an audible experiment

Compare the existing timing against outgoing ramps of four and eight bars,
and incoming returns of eight and sixteen bars. Start with the gentler
eight-bar candidate; measure its required audio and total rendering time.
Avoid testing every combination: choose the ramp first with EQ bypassed.

Retain source-start pickups, complete outgoing phrases and the final original
audio joins. Check coverage before extraction. A plan that exceeds the current
120-second source/clip limits should decline or choose a supported shorter
profile, with an explicit reason; do not truncate audio, invent coverage or
silently increase all limits to make it fit.

**Prep implications:** widening the pair gate alone needs no rescan. Existing
source-matching cues and grids remain useful. Earlier outgoing ramp starts and
longer incoming releases require different pick-time extraction windows and
may require evidence beyond the saved cue's validated passage. Audit the
prep-time `1.08`, `TAIL_SECONDS`, 130-second cue limits and fixed coverage
allowances: some encode old extraction assumptions rather than musical
suitability. Change them only where the new timeline proves it necessary.

## 2. Stem Beats EQ and stem automation

### 2.1 Bass exchange

Create a treatment with an explicit bass handoff downbeat:

1. Incoming non-bass instruments enter while outgoing bass remains the main
   low-frequency foundation.
2. Near the selected handoff, reduce outgoing bass and introduce incoming bass.
   Compare a short, smooth exchange against a longer outgoing reduction.
3. Continue the wider instrumental blend while the outgoing recording clears.

Control the separated `bass` stem independently. Account for kick energy in
`drums` and low-frequency leakage in `other`; bass-stem gain alone does not
guarantee a clean low end. First use mild shelving on relevant residual low
bands, and audition before adding more decomposition or analysis.

Do not remove both basslines for most of a long overlap by default. Judge
whether the result preserves energy, avoids a doubled bassline, and produces
a satisfying arrival. Hot Mix's 140 ms bass opening and up-to-eight-bar build
are references to compare, not values to copy unquestioningly.

### 2.2 Brightness change

Add a separate treatment that gradually softens departing cymbals and bright
instrumentation over the final two to four bars, leaving room for the incoming
track. Start with approximately 3–6 dB of high-shelf attenuation above 6–8 kHz.
As a separate stronger effect, audition a low-pass movement from roughly
12 kHz toward 4 kHz. These are starting values for listening, not final presets.

Apply principally to outgoing `drums` and `other`. Keep vocals natural.
Incoming brightness should reach its native response before the source join;
do not make both recordings progressively duller through the entire transition.
Audition bass-only, brightness-only and combined treatments independently.

### 2.3 Rendering requirements

- Use the existing numerical/audio stack where possible; add no new model or
  LLM decision to choose an EQ curve.
- Process stereo consistently and preserve filter state through processing
  blocks. Smooth parameter/gain changes; do not concatenate independently
  reset filter chunks or introduce resonant boosts in the first pass.
- Restore neutral gain/EQ before the incoming original-audio join. Preserve
  the existing original-audio seam guards and source clock.
- Account for any filter latency or phase response when checking drum
  alignment; compare bypass against treated output on real percussion.
- Preserve station loudness gains. Check peak headroom and energy around the
  handoff; a limiter or whole-clip attenuation must not hide an audible dip.
- Version the render recipe separately from cue preparation. Include recipe,
  tempo plan and treatment parameters in rendered-artifact identity, while
  reusing an identical raw extracted window where its identity still matches.

**Prep implications:** fixed EQ and stem gain curves require no prep changes
and no library rescan. They use the stems already extracted for the pair.
Only additional source coverage or a new measured cue/feature changes prep
requirements. Do not bake a chosen EQ treatment into reusable raw stem files.

## 3. Regular Stem Blends with a wider BPM gate

### 3.1 Coordinate both sides of the rhythm handoff

Implement two explicit offline variants before choosing a default:

- **Incoming rhythm takes over early:** remove outgoing drums and bass as
  incoming rhythm arrives, then retain suitable outgoing instrumental material
  through the longer fade.
- **Outgoing rhythm carries the transition:** hold incoming drums and bass
  back, introduce suitable incoming non-rhythmic material, then clear outgoing
  rhythm before the incoming rhythm starts.

At native tempos, bar lines drift apart. Choose the incoming downbeat as the
takeover reference and complete the outgoing rhythm exit immediately before
it. Use a brief declick envelope; do not claim the pair is beatmatched.
Suppressing lows alone is insufficient because snares and hi-hats remain.
Listen for rhythmic synths and percussion leakage in `other` as well.

Keep the initial eight-bar reference window and existing cues. Record whose
bars define its output duration: eight outgoing bars and eight incoming bars
are different durations at different BPM. Extract enough incoming source for
the actual output span; never pad a short source with silence as coverage.

After the new mix works on the known pairs, compare the existing three-percent
gate with provisional six- and ten-percent ranges offline, in both track
orders. Choose the initial production range from listening results. A wider
gap should steer the treatment toward a shorter competing-rhythm overlap,
rather than automatically ruling out all longer instrumental overlap.

### 3.2 Vocal handoff

Reuse Stem Beats' vocal measurement on the actual Regular head/tail stems
after their required extraction. Reuse one separation and one measurement per
window; do not run another Demucs job or require a full Stem Beats prep result.

Locate usable phrase/activity endings and incoming pickups. Prefer a completed
outgoing vocal phrase before incoming vocals become prominent. Where phrases
conflict, compare retaining the incoming vocal while reducing the outgoing
voice against a nearby supported handoff; avoid introducing the incoming vocal
mid-word or withholding its pickup simply to fit a fixed late-vocal envelope.

Vocal activity is not guaranteed lyrical phrase recognition. Missing evidence,
instrument bleed or a clipped measurement must remain distinguishable from a
confirmed instrumental window. Use a conservative single-prominent-vocal
treatment when uncertain, rather than another automatic pair-rejection gate.
Do not change main-library vocal safety or DJ talk-over evidence as a side
effect of these pair-local measurements.

### 3.3 Instruments and high-frequency congestion

When both `other` stems dominate, reduce the departing instrument earlier and
audition a modest midrange reduction. Prefer exchanging melodic prominence
over automatic pitch shifting. Existing key estimates may guide a treatment,
but do not add a hard key gate or whole-library harmonic scan in this pass.

Use mild high-frequency attenuation on the departing drum stem when hats or
snares compete. Preserve the Rock pairing that already sounded good as the
control; a treatment should not be applied more strongly simply because it
exists. Keep pronounced sweeps as an audition variant until approved.

**Prep implications:** fixed handoff/EQ rules need no shared-grid rescan. Vocal
activity can be measured from pair-time stems. A future four-bar fallback is a
separate admission/window change: try a valid eight-bar window first, then
four when eight cannot fit. It is not required for this initial eight-bar
audition and must not be bundled into the first tempo/EQ comparison.

## 4. Preparation and compatibility checklist

| Change | Required preparation work | Existing data / rescan policy |
| --- | --- | --- |
| Wider pair BPM gate | None by itself; pair policy only | Reuse current source-matching cues and grids. No bulk rescan. |
| Split tempo / longer ramps | Plan exact source windows and validate local grid support over all audible rhythmic overlap | Re-extract only changed windows. Refresh a role's evidence only if required support is absent. |
| Fixed bass/EQ automation | None; renderer treatment | Reuse raw stems. Invalidate rendered clips by recipe version only. |
| Vocal-aware Regular Blend | Measure existing extracted head/tail vocal stems | No mandatory Stem Beats or whole-library prep. Cache only with matching window/source/detector identity. |
| Longer or alternative phrase cues | Re-derive cues if the current saved alternatives cannot support the requested span | Bump cue/prep algorithm version only if cue semantics change. Preserve prior results; selectively reprepare. |
| Optional kick/band/energy evidence | Add only after fixed treatments demonstrate a need | Measure pair-time stems first. Persist optional, source-bound fields only if repeated cost justifies it. |
| New grid backend/model/preprocessing | Separate grid-quality task; not required for EQ or a wider tempo gate | Invalidate only evidence whose provenance changed; do not require this for the current plan. |

For every prep change:

- Keep discovery, cue readiness, pair admission and successful rendering
  distinct. A cue-ready track is not a promise that every neighbour can mix.
- Validate the actual transition span using available beat measurements.
  Do not add a new whole-track constant-tempo-fit requirement for a local mix.
- Prefer supported saved cue alternatives before requesting new analysis.
  If the saved V2 record lacks local-grid detail required by the new planner,
  make the evidence extension explicit and version it; do not infer reliability
  merely from a cue BPM or import Hot Mix's fitted segments as if identical.
- Distinguish preparation algorithm version, evidence schema version, raw
  extraction identity and rendered-recipe version. Pure renderer changes must
  not make the whole prepared library stale.
- Inspect the current-version indexes before any prep version bump: a bump can
  make every existing result appear due. Preserve old reads where meaningful
  and make targeted refresh behavior explicit, including no-cue and failed roles.
- Honour the configured stems root, including remaps and missing old files.
  Missing artifacts are recoverable preparation/extraction misses. Never fall
  back to a retired V1 path or a hard-coded station mount.
- Keep new directories under `stembeats` or `stemblends`; do not create new
  `subbeats` storage or move current data as part of an EQ change.
- Preserve pick-time priority over manual and library prep. Check priority
  between jobs and after downloads, without killing an already running model
  request. Do not chain full cue prep and extraction into one first-use pick.
- Respect the selected pick-time CPU/GPU setting and normal library analyzer
  device selection. EQ is ordinary DSP; it must not force unrelated scans to CPU.

## 5. Integration points and observable results

Confirm the current filenames on the selected implementation base; these are
the inspected entry points, not a request to modify every file:

| Area | Starting points |
| --- | --- |
| V2 pair admission, extraction bounds and style choice | `controller/src/music/subbeats-pair.ts`, `controller/src/broadcast/subbeats.ts` |
| Python passage/timing planning and live rendering | `controller/scripts/subbeats_cue_preview.py`, `subbeats_cue_matching.py`, `subbeats_live.py`, `subbeats_handoff.py` |
| Prep cue derivation, legacy coverage assumptions | `controller/scripts/subbeats_prep_v2.py`, `subbeats_cues.py`, relevant coverage helpers still used by V2 |
| Prep persistence/current-result selection | `controller/src/music/subbeats-prep-v2-store.ts`, `subbeats-prep-v2-library.ts`, `controller/src/schemas/subbeats-prep-v2-server.ts` |
| Exact extraction identity and metrics | `controller/src/music/subbeats-picktime-extraction.ts`, `stem-extraction-metrics.ts` |
| Protocol and validation | `controller/src/schemas/subbeats.ts`, analyzer request/response parsers and Python dispatch |
| Regular admission, windows and rendering | `controller/src/broadcast/regular-stem-policy.ts`, `regular-stem-needs.ts`, `regular-stem-runtime.ts`, `stem-blend.ts`, `controller/scripts/analyze_worker.py` |
| Vocal evidence reuse | `controller/scripts/subbeats_vocals.py`, `subbeats_vocal_confidence.py`, pair-local render callers |

Keep the production order: Stem Beats first for a usable prepared pair;
Regular Stem Blend assesses the complete pair independently after a decline;
ordinary pair-aware transition when neither can finish. Keep asynchronous
preparation, existing deadline/cancellation ownership and stale-pair checks.
Never combine one Stem Beats role with one Regular role in a new hybrid renderer.

Log pair/source identity, selected cues, grid provenance, pair gap, both rates,
ramp and overlap lengths, vocal/rhythm handoff times, treatment/version,
extraction time per side, render time and remaining deadline. Distinguish:

- tempo outside trial policy or per-track stretch limit;
- missing/stale prep or local grid evidence;
- no supported cue/span or insufficient decoded/extracted source coverage;
- supported vocal conflict versus uncertain activity evidence;
- cancellation, queue/pair change or deadline exhaustion;
- renderer/DSP failure and the fallback actually selected.

Extend existing diagnostics/metrics where necessary rather than creating a
new dashboard. Retain device and window-size context so extra source coverage
is not mistaken for a CPU/GPU regression. Add concise treatment labels to the
existing diagnostic/preview output; a Mixing Desk redesign is outside this plan.

## 6. Verification and listening gates

### Technical checks before listening

Use the repository's `npm test -- <filter>` runner for relevant controller
tests, the existing analyzer Python harness, applicable typechecks/lint and
`git diff --check`. Run heavy commands sequentially. Check the actual runtime
path, not just a standalone audition helper.

Cover directional and symmetric tempo boundaries; accepted old pairs; newly
admitted pairs; both orders; unsupported/octave readings; and stable grid
coverage without invented markers. Golden timing fixtures must agree between
controller and renderer on ramp start/end, overlap, source consumption,
extraction endpoints, source resume and total length.

Use synthetic impulses and known signals to check aligned transformed beat
positions throughout the overlap, consistent stem clocks, neutral/bypass EQ,
filter continuity across blocks, stereo preservation, finite output and peak
headroom. Preserve original-audio joins and test fractional decoded EOF.
Measure aligned impulses rather than correlate unrelated musical waveforms.

Exercise stale evidence, source replacement, cache reuse after a recipe-only
change, expanded-window misses, cancellation, changed successor and deadline
fallback. Confirm Legacy/off paths and library device selection stay unchanged.

### Offline listening sequence

Use the already selected and extracted Dance/Dance, Dance/Electronic,
Indie/Rock and Rock pairs, plus a known successful Stem Beats pair. Record
artist/title/recording identity and exact cues before rendering. Add a small
cohort of tempo-rejected, cue-ready pairs spanning the newly proposed range,
including vocals and music beyond the narrow instrumental dance examples.

1. Stem Beats: compare the existing rate profile with wider/split tempo plans,
   EQ bypassed. Choose ramp smoothness before combining effects.
2. Stem Beats: compare bass exchange alone, brightness alone and both, with
   the same accepted tempo plan and cue windows.
3. Regular Blends: compare existing audio against each rhythm-handoff
   direction; then test vocal handoff and instrumental/high-frequency treatment.
4. Regular Blends: repeat approved treatments at wider BPM differences and in
   reverse order. Keep the Rock control in every audition batch.
5. Compare eight- and sixteen-bar Stem Beats overlaps only on passages with
   sufficient measured support. Distinguish overlap length from tempo-ramp length.

Provide labelled playable files, short original context on both sides, and a
manifest containing cues, rates, stem/EQ envelopes, output duration and timings.
Keep station gain consistent; do not independently peak-normalise each variant
in a way that masks an energy dip. Supply plots/timelines as optional aids,
not another Audacity setup task for the owner.

Accept a treatment only after the owner judges rhythm, vocal continuity,
low-end weight, tonal overlap, tempo movement and the final source join.
Technical passes do not establish that a musical transition sounds good.

### Station rollout and rollback

After offline approval, integrate only reviewed prerequisites and accepted
treatments. Preserve Extended Sleeve Notes, Sub/Flow, Sub/Shows and the station's
other testing changes. Record source revisions, effective New Style settings,
current images and rollback images; avoid broad resets or blind cherry-picks.

Provide the owner the exact rebuild command for affected services, including
analyzer changes, unless explicitly asked to run deployment. Start with known
prepared pairs and monitor actual treatment/rate/deadline logs while the owner
listens. Then observe naturally selected pairs and preparation/extraction times.
Return to the previous New Style recipe/range if the candidate regresses;
retain valid cue/grid preparation and raw extractions. Legacy Stems remains a
separate selectable behavior, not the only rollback mechanism.

Promote the wider gate and combined treatment only after audible acceptance
and stable production timing. Update draft PR #10 with the selected finished
changes when requested; do not import historical V1 experiments as dependencies.

## Research references and limits

- [Hot Mix bass control](https://github.com/Lefuneste83/subwave/blob/develop/controller/src/music/bass-pot-policy.ts),
  [tempo/seam plan](https://github.com/Lefuneste83/subwave/blob/develop/controller/src/music/hot-mix-seam.ts),
  [phrase placement](https://github.com/Lefuneste83/subwave/blob/develop/controller/src/music/phrase-mix-policy.ts)
  and [safe transition](https://github.com/Lefuneste83/subwave/blob/develop/controller/src/music/safe-out-policy.ts).
  Local research snapshot: `9f694b12da368e9d104abe9edc81796d5715b2b0`.
  This is the strongest live integration reference, but it mixes whole tracks
  and its genre/sample scope does not establish vocal-heavy stem-mix quality.
- [AI-DJ-Mixing-System renderer](https://github.com/kckDeepak/AI-DJ-Mixing-System/blob/main/mixing_engine.py):
  progressive filtering and filtered echo-tail ideas. Its main path uses echo
  transitions; the overlapping beatmatch helper is not wired into that path.
- [mixx-dj-mcp handlers](https://github.com/sandraschi/mixx-dj-mcp/blob/master/src/mixx_dj_mcp/tools/transitions.py):
  transition vocabulary, not a demonstrated timed EQ/stem automation engine.
- [Demucs automix](https://github.com/facebookresearch/demucs/blob/main/tools/automix.py):
  synthetic cross-song stem construction with rhythm/pitch matching, not a
  station transition renderer or evidence for adopting its 15% tempo allowance.

Echo/reverb exits, automatic pitch shifting, new structure models, a whole-track
steady-tempo admission test and a configurable public preset catalogue are
deferred. None is needed to test wider admission, coordinated stem handoffs
and EQ using the existing preparation and extracted audio.

## First implementation task

On a development base reconciled with the current draft and reviewed station
prerequisites, implement the versioned offline Stem Beats tempo plan and its
cross-language timing fixtures. Prove existing pairs retain a valid path and
produce a wider-gap split-tempo sample with complete source coverage and no EQ.
That audible/timing result gates the EQ phase; no station change is implied.

### Progress — 2026-11-25

Started locally from draft PR head `710e256b1` on
`codex/stembeats-tempo-eq-20261125`. The offline planner now preserves the
current directional 8% incoming-only profile, offers symmetric split-tempo
plans up to 12% pair gap with no more than 6% adjustment per track, and maps an
8-bar outgoing ramp plus a 16-bar incoming return to source positions and
clip-relative frames. Shared TypeScript/Python fixtures cover 127/123 and both
orders of 120/134; focused parity tests pass. Live pick-time and station code
remain untouched. Renderer integration and an actual audible sample are still
pending; the station's current Stem Beats state exposed run metadata but no
prepared audio windows in the inspected state path. The existing V2 extraction
planner still applies the 8% gate and calculates the outgoing window from the
native-outgoing timeline. The audition renderer must derive tail/head extraction
coverage from the versioned timeline's earliest outgoing source point and
incoming resume point before it can safely render a split-tempo pair.
