# Sub/Beats live integration plan

Agreed direction, 9 November 2026. This is an implementation plan, not a
description of a completed station trial. Preparation, automatic cue-plan search
and four mixing styles work in browser auditions. The live queue candidate is
now on the station-based `test-station/subbeats-live-queue-20261110` branch; its
switch defaults off. Discovery continues to use the existing picker. The
owner-run station trial remains outstanding.

## Implementation checkpoint — 10 November: live queue candidate

`broadcast/queue.ts` now offers the actual adjacent pair to
[`broadcast/subbeats.ts`](../../controller/src/broadcast/subbeats.ts) before
ordinary Stem Blend. It reads the same saved evidence/harmonic style choice as
the pair diagnostic. Compatible library keys choose Long blend; mismatched or
mismatched keys choose Drums First; unknown keys retain Short exchange as the
conservative default. **Find Suitable Transition** now uses this same automatic
style rule; its cue search remains an audition plan. The one-shot
[`subbeats_live.py`](../../controller/scripts/subbeats_live.py) uses the shared
`plan_live_pair` and complete-handoff renderer. Missing preparation, unsuitable
cues, insufficient coverage, supported lyric conflict or a render failure keep
the selected music and fall through to enabled ordinary Stem Blend, then the
existing crossfade. No new selection, ranking or playlist mode is introduced.

The persisted switch is `transitions.subbeatsLive`, shown as **Live Sub/Beats**
on Settings → Stems. It requires DJ mode and pair-aware transitions, and is
independent of `transitions.stemBlends`: turning Sub/Beats on does not enable
ordinary Stem Blend. Turning it off revokes unpublished proposals; committed
audio finishes coherently. A cold/unavailable analyzer is probed in the
background while the current pair falls through.

Live rendering has a separate CPU-only process rather than occupying a model
worker. Both analyzer transports enforce an absolute deadline: the smaller of
the existing render budget, 120 seconds and time to the drain's hard fallback
minus ten seconds. The default render budget is 60 seconds. Busy analysis and
short/unknown queue clocks decline early. Cancellation/deadline kills the whole
process group, including downloads, ffmpeg and Rubber Band. There is one live
render lane per sidecar, with immediate busy refusal. Source reads and all
scratch work are inside that budget; no model loading, stem extension or lyric
lookup occurs. The controller rechecks pair order, eligibility, saved evidence,
gain settings, trims and show boundaries before publishing linked cues.

The renderer writes two float WAV parts into owned `state/transitions` storage,
with identical samples across a 300ms overlap at the incoming entry. The first
part carries outgoing identity; the second carries incoming identity. An entry
at frame zero needs only the incoming part; a nonzero outgoing-only segment
under one second declines to avoid requests swallowed by the mixer buffer.
The existing clip seam and codec cue-landing compensation complete the native
resume. Live cue positions retain sample precision. Both sources use resolved
station gains, and native continuation retains the committed incoming gain.

Both parts share one durable transition record. Cleanup keeps pending parts,
cancellation removes the pair's pending clip requests, and restart publication
checks actual mixer requests before adding missing parts. A queued incoming
part never gets an old outgoing lead appended after it. If the outgoing track
and both parts have disappeared, an unsent incoming track resumes its ordinary
opening. Mixer metadata observes the incoming entry once, preserving play and
request bookkeeping through native continuation. Recovery can reconstruct entry
time when its first marker is the outgoing lead or resumed original.

[`subbeats-clock.ts`](../../controller/src/broadcast/subbeats-clock.ts) maps
source positions through the linear tempo release and inserted drum loops.
Queue forecasts/progress use elapsed playback duration; current and recent-play
lyric replies map timed lines to that same clock while retaining the operator's
offset control. No listener client change is needed. Existing spoken heads,
beds, silence trims and show boundaries take precedence; pending generic speech
holds for another boundary when a committed Sub/Beats opening owns this one.

The queue row labels committed prepared handoffs **Sub/Beats**, distinct from
ordinary **Stem blend**. Operator mix logs distinguish `attempt`, `rendered`, `committed`, `observed` and
`fallback`, including style, tempo, loop and lyric-fit evidence. An observed
metadata entry is not a listening result. **Sub/Beats** is also the upcoming
transition label. The first strict-playlist trial must confirm both audible
joins and listener timing on the running mixer.

Two isolated live-worker renders completed in 24.849s and 15.695s, respectively,
for Sash! → Insomnia and Insomnia → El Nino. Their split overlaps and original
source guards had zero sample error; reconstructing their complete audio
matched the accepted auditions with zero error. These used unity gains and
explicit Short exchange, not automatic controller style selection. Read-only
source/stem mounts, no network, two CPUs and 4 GiB RAM were used. See the
[validation measurements](../investigations/2026-11-10-subbeats-live-queue.json).
Focused source checks accompany this candidate; full suites, HTTP/browser and
live Liquidsoap playback are not established by the offline renders. The
station checkout has the source candidate, while its settings and running
services remain unchanged until the owner rebuilds the controller, analyzer
and web images and enables the switch for the strict-playlist trial. The
rollback source is `813094ba`.

Focused validation for this candidate: 90 controller cases (live queue and both
transports, existing seam/recovery, length-policy, pick-time stem and lyric
contracts) and 15 web settings cases passed. The live cases include real child
process deadline/disconnect cleanup and a local HTTP sidecar fixture. Controller
and web type checks and targeted lint passed; existing shared-module lint
warnings remain. Schema generation, Python parsing, evidence hashes and local
documentation links were checked. Full suites, an actual HTTP analyzer render,
browser interaction and live mixer playback remain outside these checks.

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
incoming cues are explicitly invalid. Owner listening and live playback are
pending; no full test suites or station operations were run for this milestone.

## Implementation checkpoint: read-only pair planning

The first implementation adds `music/subbeats-pair.ts::assessSubbeatsPair` and
the operator-only `POST /library/subbeats/pair-plan` diagnostic. Supply
`{"outgoingId":"prepared-outgoing-id","incomingId":"prepared-incoming-id"}`.
The route changes no queue, preparation or playback state and needs the updated
controller and analyzer. It is not yet a browser control or a live queue hook.

The controller selects Long blend for compatible library key estimates and
Drums First for mismatched/unknown keys, using the existing Camelot maths.
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
this contract. The live queue candidate above adds publication and playback
timing. Station enablement and the owner-run trial are still outstanding.

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

Automatic style selection uses:

| Evidence | Initial choice |
| --- | --- |
| Plausibly compatible keys | Long blend available |
| Apparent harmonic mismatch | Drums First |
| Key unknown or unreliable | Keep eligible; Short exchange |
| Bass swap | Keep as an optional audition/editing choice initially |
| Drums First | Use for mismatched/unknown keys; builds incoming drums before the bass/other exchange |

Use existing key evidence honestly. Leading-window library keys and diagnostic
section estimates are not confirmed ending keys or probability scores. Do not
promote confidence just to choose a style. The owner preferred Short exchange
in five of six harmonic comparisons, with one tie. Bass swap tied in both of
its comparisons; Drums First had one tie and one preference. Since then, the
owner accepted the 16-out/8-in Drums First preview on two pairs classified
outside the usual Camelot matches. These are small listening samples, not
universal guarantees. See the
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

The audition renderer confirms that the clip's first event is outgoing original
audio and that the incoming recording enters later. The queue's current
single-clip stamp gives the whole clip the incoming identity, so it would switch
Now Playing and lyrics too early. Before live admission, split the lossless
handoff at `incomingEntryFrame`: publish the pre-entry segment with outgoing
identity and the post-entry segment with incoming identity, then resume the
incoming original at `incomingResumeSample`. Keep both segments under one
transition ownership record so cancellation, restart recovery, cleanup and
single-delivery accounting treat them as one seam. The incoming entry event,
not clip start, owns the incoming track clock and listener metadata.

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
contracts, plus the owner listening trial. The current candidate records its
focused checks and isolated render measurements above; full PR suites and
live station acceptance remain separate gates.

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
