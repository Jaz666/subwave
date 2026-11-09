# Sub/Beats live integration plan

Agreed direction, 9 November 2026. This is an implementation plan, not a
description of live functionality already delivered. Preparation, automatic
cue-plan search and four mixing styles currently work in browser auditions;
Sub/Beats does not yet upgrade live queue transitions or influence discovery.

## Implementation checkpoint: complete handoff auditions

The shared plan can now be rendered through the existing operator-only
`POST /library/subbeats/join-preview` route. Use `method: "cue-points"`,
`autoPlan: true`, `handoff: true` and the two `trackIds`; omit manual style,
cue/reference/match overrides. The controller assesses the pair, uses its first
ranked plan and automatic style, then rechecks the evidence fingerprint after
rendering. There is no new browser button yet. Existing preview requests retain
their previous behaviour and cache identities.

`subbeats_handoff.py` loads verified saved bundles/cue coverage and both original
recordings. It recalculates the proposed clock from saved cues, remeasures lyric
activity and checks any inserted loop before rendering. Missing coverage causes
refusal rather than fresh separation. Original source bytes, or matching saved
audio windows after a byte change, establish source agreement through the
existing source-verification helper.

Rubber Band R3 applies a common input/output time map to all four stereo stems
in one multichannel process, with no pitch shift. The map samples the planned
linear-rate release every 50ms and supplies the overall duration separately.
It omits an explicit zero anchor because that can trigger a ratio reset in R3;
reset warnings and inconsistent length/level/sample data are rejected. See the
[complete handoff audition record](../investigations/2026-11-09-live-handoff-auditions.md)
for the reproduced fault and corrected final outputs.

The renderer reuses the existing stem envelopes with audition edge fades and
whole-clip normalization disabled. Both sources use the supplied station gains.
The first 300ms is the decoded outgoing original, followed by a 250ms join into
the stem mix. Once incoming tempo is native, a 250ms join returns to the original
incoming recording; its remaining native bar includes the final 300ms guard.
The cached WAV is float PCM so overlap peaks are retained without clipping or
changing source levels. Live limiter/codec behaviour remains to be checked.

The response timeline has kind `subbeats-handoff` and a validated `handoff`
result containing the clock, evidence fingerprint, engine and source-verification
flag. It remains `renderReady: false`: this is an audition, not a queue admission.
The preview cache is evictable; live publication must protect/copy the clip into
the queue's transition ownership and honour the actual commitment deadline.
The worker's stretch process has a 180-second limit; the controller audition
request allows 240 seconds. This download/decode/render path must not be inherited
as an unbudgeted live handoff.

Analyzer and AIO images now include `rubberband-cli`; local workers need it on
PATH for adjusted-tempo handoffs. No Python stretching wrapper or new model is
required. Handoff renderer cache version 2 and the tool version enter its cache
identity; source/cue/stem caches and ordinary preview identities are unchanged.

Three real complete handoffs rendered in isolation, covering +3.32%, −0.09% and
−5.85% incoming tempo adjustments. All final 300ms source guards matched exactly.
The reverse Insomnia → Encore une fois direction was declined because the saved
incoming cues are explicitly invalid. On 9 November the owner accepted all three
final auditions ("They sound fine") for their tempo return and audio joins.
These Short exchange examples do not establish other styles, looped transitions,
station loudness or live playback. No full test suites or station operations
were run for this milestone. Queue integration is next.

## Implementation checkpoint: read-only pair planning

The first implementation adds `music/subbeats-pair.ts::assessSubbeatsPair` and
the operator-only `POST /library/subbeats/pair-plan` diagnostic. Supply
`{"outgoingId":"prepared-outgoing-id","incomingId":"prepared-incoming-id"}`.
The route changes no queue, preparation or playback state and needs the updated
controller and analyzer. It is not yet a browser control or a live queue hook.

The controller selects Long blend for compatible library key estimates and
Short exchange for mismatched/unknown keys, using the existing Camelot maths.
Both remain estimates, including any leading-window fallback for an unmeasured
ending. It attaches source-bound lyric evidence and sends only the two selected
preparation records through the existing model-free match operation, with a
five-second request budget. It fingerprints the evidence/style and rejects
changes during the request. This is not a substitute for final queue/show
eligibility or validating the actual audio/source before publication.

The analyzer reuses `plan_pair_transitions`, also used by automatic auditions,
then filters proposals by the additional live handoff coverage requirements.
The response contains up to twelve ranked plans, or an ordinary-transition
reason. It proposes sample positions at 44.1 kHz for incoming entry, handover,
outgoing end, tempo release, clip end and original incoming resume. Inserted
drum-loop samples are removed when calculating the original source position.
Frame offsets refer to clip time; source samples refer to original file time.

The initial release contract is a linear change in playback rate over eight
outgoing beats, beginning after the outgoing recording, tonal exchange and any
inserted loop finish. One incoming bar at native tempo (at least one second)
follows before the original-track handoff. Equal-tempo pairs have no release
ramp. These are proposed parameters to render and audition, not a listening
approval. Head coverage must reach the calculated original resume position;
the planner does not extend stems. Any outgoing original-mix prefix is recorded
as `originalLeadInSeconds` for later source/audio validation.

Every pair-plan response has `renderReady: false`. No audio is rendered, no models or
lyric lookups run, and no cache-file integrity or audible seam is claimed.
`subbeatsLiveTimingSchema` validates ordering and consistency of the proposed
source resume with the tempo/loop map; `subbeatsPairAssessmentSchema` owns the
controller response and its generated web mirror. The browser audition API
and its manually selected styles retain their existing behaviour.

Checks for this slice: controller and web type checks, focused controller lint,
Python syntax parsing and documentation/diff checks. Runtime pair fixtures,
audio rendering/listening, full test suites and station deployment are not
part of that first checkpoint. The complete-handoff renderer above now consumes
this contract. Queue publication, playback timing and live enablement remain
the next implementation stage after the complete-handoff listening exercise.

## First trial: a temporary strict-playlist show

The owner will use a temporary show with strict playlist selection containing
only Sub/Beats-prepared tracks. Use the existing show and playlist controls;
no separate picker mode or prepared-track selection bonus is needed for this
trial. Check usable preparation for each playlist entry before the trial,
including source identity, incoming/outgoing cues and actual stem coverage.
Membership alone does not guarantee a feasible transition between every pair.

Confirm that automatic selection and recovery honour the strict playlist.
If ordinary request or coast behaviour can introduce other material, identify
that before the trial and configure the test accordingly; do not silently
rewrite those existing contracts. A prepared pair which cannot support a
Sub/Beats plan still airs through the existing transition path. The trial must
record actual Sub/Beats usage and fallback reasons, so acceptable playback is
not mistaken for evidence that Sub/Beats was used.

The first milestone is a complete prepared-to-prepared transition on air,
including clean joins into and out of the rendered clip, normal incoming
playback afterward, correct track timing and dependable fallback. Mixed
prepared/regular pairings are the next rollout stage.

## 1. Integrate at the shared pair-aware queue handoff

Let the existing picker choose the tracks, then assess the actual adjacent
pair. Reuse `broadcast/queue.ts`, its pair drain, `broadcast/stem-blend.ts` and
`broadcast/stem-seam.ts` rather than creating another queue writer or mixer.
This reaches agentic, shortlist, pool recovery, operator and request queue
entries through their existing guards. Preserve request order and existing
eligibility, show, repetition, blocklist and length rules. Protected Sub/Flow
internal joins remain outside this capability.

Use the pair's real predecessor, which may be a queued track rather than the
currently playing track. Revalidate adjacency and eligibility after asynchronous
work and immediately before publishing linked audio/cues. A selected pair
does not get reordered or replaced merely because a nicer transition exists.

Fallback order: a usable Sub/Beats transition, otherwise an eligible existing
regular Stem Blend, otherwise the existing pair-aware crossfade. Do not render
the preview's regular-crossfade fallback and then label it a Sub/Beats upgrade.

## 2. Share assessment and choose a style

Reuse the saved-evidence cue planner and actual stem renderer used by auditions.
Avoid independent preview, discovery and broadcast compatibility rules. A plan
needs valid timing, source identity, sufficient audio, supported tempo adjustment
and a feasible musical handover. An 8/16-bar label alone does not prove fit.

Start with deterministic automatic style selection:

| Evidence | Initial choice |
| --- | --- |
| Plausibly compatible keys | Long blend available |
| Apparent harmonic mismatch | Prefer Short exchange |
| Key unknown or unreliable | Keep eligible; Short exchange as the conservative starting choice |
| Bass swap | Keep as an optional audition/editing choice initially |
| Drums first | Add selective automatic use after the basic live path is established |

Use existing key evidence honestly. Leading-window library keys and diagnostic
section estimates are not confirmed ending keys or probability scores. Do not
promote confidence just to choose a style. The owner preferred Short exchange
in five of six harmonic comparisons, with one tie. Bass swap tied in both of
its comparisons; Drums first had one tie and one preference. These are small
listening samples, not universal guarantees. See the
[harmonic](../investigations/2026-11-09-harmonic-auditions.md) and
[style](../investigations/2026-11-09-stem-mixing-styles.md) audition records.

Retain the current head/tail confidence policy: synced lyrics from the music
server first, then version-ranked on-demand lookup during preparation/refresh,
with saved evidence read during pairing. Plain lyrics are not timed boundaries.
Use the library vocal/instrumental flag as evidence without treating it as a
guarantee. Preserve reviewed corrections bound to the prepared recording.

Allow estimated lyric overlap up to the existing two-second allowance. Low or
unknown lyric confidence alone does not block airing or routinely request
operator review. For longer conflicts supported by high-confidence evidence,
try another cue or a measured, vocal-free drum loop; otherwise use the fallback
transition. Do not cut or duck lyric stems to force a fit. Main-library vocal
ranges and DJ talk-over safety remain governed by their existing rules.

## 3. Define a live render result and complete both handoffs

Do not play the browser preview response as a live clip unchanged. Return a
lossless clip with exact outgoing cut and incoming resume positions, source and
analysis identities, chosen cues/style, loop offsets, tempo mapping and stem
envelopes. Validate the clip and cue changes together before publication.

The incoming preview currently stays stretched to the outgoing tempo until the
preview ends. Live rendering must include a smooth return to the incoming
recording's native tempo before handing back to its original audio. Derive the
resume source position from the actual tempo mapping and inserted loops, not
clip duration. Account for the release's audio requirements in coverage checks;
if it cannot fit, try another plan or fall back. Audition this release as part
of the complete transition before enabling live playback.

Use the station's resolved per-track gains and headroom handling. Audit preview
edge fades and whole-clip normalization so they do not introduce level dips or
fight the live seam crossfades. Retain the outgoing recording's complete ending
and natural decay. Reuse codec cue-landing compensation and require a clean
join from the original outgoing audio into the clip and from the clip into the
original incoming audio.

Keep the render result's timing/envelope data usable by a later DJ Booth viewer
and cue/fade editor. Building that UI is outside this milestone.

## 4. Bound work and preserve recovery

- Live commitment uses cached stems and saved evidence. No fresh Demucs,
  Beat This!, Silero or network lyric lookup in the handoff. Any required source
  lead-in must be available and identity-checked within the render budget;
  otherwise fall back. Auditions can currently extend missing stems on demand;
  that behaviour must not be inherited by the live route.
- Reuse the existing pair-drain deadlines and worker-contention policy. Account
  for actual load, stretching and encoding cost, not only cache presence. A
  timeout must prevent late publication and bound/stop abandoned work so it
  cannot hold up subsequent transitions.
- Reject stale plans after source replacement, cue/evidence changes, queue
  removal or reorder. Cache identity must include the audio/evidence versions,
  cue choices, style, gains, tempo/release and loop plan, and renderer version.
- Respect incoming silence trim, outgoing trim/caps, show boundaries, speech,
  beds and already-committed queue items. Where the clip cannot honour them,
  keep the existing transition rather than weaken those rules.
- Preserve cancellation, restart reconciliation and clip-as-track recovery.
  Protect pending clips from cleanup; remove only unreferenced artifacts.
  Check consecutive A-to-B and B-to-C plans for conflicting cuts/resume points.

An unavailable analyzer, missing coverage or exhausted budget loses the
Sub/Beats upgrade, not the selected music. Preparation can run ahead through
its existing queue; live playback never waits for a rescan.

## 5. Keep playback identity and diagnostics accurate

A Sub/Beats clip may begin with outgoing-only audio before the incoming entry.
Do not blindly switch Now Playing to the incoming track at clip start. Specify
the logical track change and source position, then carry that mapping through
elapsed time, listener lyrics, DJ speech and the original-track resume. Keep
live-edge timing distinct from the listener stream buffer delay. Preserve
single-delivery play/history/request accounting through the clip handoff.

Expose compact operator diagnostics: actual transition kind, selected cues,
style, phrase length, tempo adjustment/release, loop use, lyric confidence and
fallback reason. Keep these behind existing operator surfaces and out of
listener-facing speech. Count attempts, rendered/committed upgrades, observed
playback and fallbacks separately; a plan is not proof that its audio aired.

## 6. Controlled rollout and acceptance evidence

1. Implement shared planning and diagnostics that can be inspected without
   changing playback. Confirm the real queue boundary and fallback decisions.
2. Render and audition complete prepared-to-prepared handoffs, including tempo
   release and resume. Existing mid-transition auditions do not cover this seam.
3. Add one persisted live Sub/Beats enable switch, initially off. Retain the
   current DJ-mode/pair-drain prerequisites; document its relationship to the
   ordinary Stem Blend switch without changing that feature's saved meaning.
4. The owner enables the temporary strict-playlist show and the live feature.
   Record the candidate revision, rollback switch, actual transition usage,
   audio observations and timing results. Station rebuild/restart is a separate
   owner-run step after the candidate is ready.
5. Before widening the rollout, cover compatible/mismatched/unknown keys,
   high/medium/low/unknown lyric evidence, standard and looped transitions,
   long incoming openings, outgoing natural tails, consecutive transitions,
   cancellation/reorder, requests, trims/boundaries, restart, missing/stale
   stems, busy/offline analyzer and render timeout.
6. Add mixed pairings in both directions, then consider shared follow-up
   discovery for Agentic Tools and Track Shortlist. Compatibility remains a
   soft offer/preference, subject to the same constraints as other candidates.

Use focused isolated checks for changed policy, settings and queue/render
contracts, plus the owner listening trial. This documentation-only update does
not run the application or full PR test suites, as requested. Broader validation
for the eventual implementation is recorded when that candidate exists.

## Later mixed pairings and cache implications

Regular analysis defaults to a 40-second head and 20-second tail. Sub/Beats
coverage is cue-owned and variable; check actual files, exact source offsets and
timing evidence per role instead of assuming a length from a preparation flag.

| Pairing | Coverage constraint |
| --- | --- |
| Sub/Beats outgoing, regular incoming | Regular head may fit; establish reliable entry timing and enough release/resume audio |
| Regular outgoing, Sub/Beats incoming | Shorter regular tail may require a shorter plan or existing drum carry |
| Neither side has a feasible Sub/Beats plan | Existing regular Stem Blend or normal crossfade |

No global cache resize or Demucs rerun is required by this plan. Sixteen bars
at 90 BPM span 42.67 seconds before any natural decay or handoff allowance,
but the current cue path accepts 60–190 BPM: 90 is not an enforced floor.
Continue calculating coverage from the actual selected plan. Broader stem
preparation changes should follow measured shortcomings, not a fixed universal
tail length.
