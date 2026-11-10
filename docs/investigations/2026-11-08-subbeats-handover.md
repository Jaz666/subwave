# Sub/Beats handover — 8 November 2026

## Latest web experiment — 10 November: on-air waveform corrections

`NowPlayingWaveform` remains on the experimental WaveSurfer page. Browser
reproduction found the missing playhead at x = -154.5px: it was inside the
element whose `scrollLeft` advanced, so increasing z-index could not fix it.
The playhead now sits outside the moving layer. Animation translates that
layer by fractional pixels, without rounding through native scrolling.

History, current and next segments now share one keyed React list. The old
separate history list destroyed the outgoing WaveSurfer instance and fetched
its recording again after it was no longer eligible for the protected audio
endpoint. The revised handoff retains the same canvas, clips it at the audible
handoff point and releases it once it is 30 seconds behind the playhead.
Decoded duration stays authoritative when a queued track becomes current.

The test page suppresses the global paper-grain blend overlay while mounted;
theme colors remain in use. The canvas uses smooth image sampling during
translation. Dynamic geometry is applied through DOM refs, and local file
lane labels use theme utilities; neither component needs JSX inline styles or
an ESLint exemption.

An isolated Chromium harness exercised the actual component and stylesheet
with mocked station/auth hooks and generated WAV responses. It verified a
stationary center marker at desktop and mobile widths, fractional animation,
unchanged canvas identity and colors through a handoff between different
recording lengths, one audio fetch per track, retention before 30 seconds and
release afterward, light/dark themes, and restoration of grain on unmount.
Focused ESLint and TypeScript checks are recorded with the candidate. No full
PR suite or live broadcast test is implied. Station integration is source-only;
the owner rebuilds `web`. Previous station source candidate: `8870839c`.

## Latest work — 10 November: live queue candidate

The shared pair drain now tries Sub/Beats before enabled regular Stem Blend and
the ordinary crossfade. `transitions.subbeatsLive` defaults off and is exposed
on Settings → Stems. It requires DJ mode/pair drain and does not change which
tracks the picker selects. The controller and analyzer source must both be
built from this candidate before an owner-run strict-playlist trial.

Read the [current implementation checkpoint](../internals/subbeats-live-integration.md).
Live rendering runs in a bounded CPU process, kills its process group on
cancellation/deadline, and publishes two lossless parts under one queue-owned
transition identity. Their identical 300ms overlap changes metadata at incoming
entry. The source clock, tempo release, loops, lyrics, native resume, committed
gains, cleanup and restart publication share this record. Existing trims,
speech, caps, show boundaries and pair eligibility retain precedence.

Two real isolated live-worker runs produced audio matching the accepted
auditions exactly (Sash! → Insomnia and Insomnia → El Nino). Focused checks and
measurements are recorded with the implementation. This is a development
candidate: no station source/settings/services have changed, and actual mixer
playback and listener timing still need the owner-run trial. Disable Live
Sub/Beats to roll back future upgrades without changing the ordinary Stem Blend
setting. The precise next step after source review is to integrate this
candidate into the station checkout and let the owner rebuild it for that trial.

## Latest work — 9 November: complete handoff renderer and auditions

The next slice implements `subbeats_handoff.py`, reached by the existing
operator join-preview API with `method: cue-points`, `autoPlan: true` and
`handoff: true`. It consumes the first shared pair plan, verifies saved coverage
and original audio, rechecks lyric activity, applies Rubber Band R3's common
time map to all stems, releases tempo and matches original-audio guards at both
ends. Results remain `renderReady: false`; queue publication is not implemented.
Ordinary previews, prepared stems and live station behaviour are unchanged.

Read the [handoff audition record](2026-11-09-live-handoff-auditions.md) and
[live integration checkpoint](../internals/subbeats-live-integration.md).
Three final auditions cover +3.32%, −0.09% and −5.85% incoming tempo changes;
the 300ms source guards matched exactly. The reverse Insomnia → Encore une fois
direction has invalid saved incoming cues and was declined. A reproduced Rubber
Band zero-anchor reset was corrected and all audio regenerated with handoff
renderer cache version 2. On 9 November the owner accepted all three final
auditions ("They sound fine") for their tempo return and audio joins. This
acceptance covers these Short exchange examples; it does not establish live
playback, other styles or higher lyric/key confidence.

Live integration has one additional playback-clock requirement: auditions begin
with outgoing-only audio before the incoming entry. A live handoff must split
its clip at the planned incoming-entry frame so Now Playing, lyrics and elapsed
time change with the incoming audio, then resume its original recording at the
planned source sample. The existing single-clip stem-blend marker cannot
represent that internal identity change.

Both analyzer/AIO image recipes include `rubberband-cli`; local workers need the
command for adjusted-tempo handoffs. Only an isolated audition image was built.
No station source, settings or running service changed. The next step is
queue publication/timing/recovery and
an initially disabled live switch before the strict-playlist station trial.

## Next work — 9 November: live integration and strict-playlist trial

First implementation checkpoint: `music/subbeats-pair.ts::assessSubbeatsPair`
and operator-only `POST /library/subbeats/pair-plan` return a read-only
proposal using the shared audition cue planner. Key estimates select a style;
sample-based timing includes a proposed eight-beat tempo release, native bar,
and loop-corrected source resume. A response is always `renderReady: false`;
source/audio integrity and rendering were pending at that checkpoint; the
complete-handoff audition implementation above now supplies them for previews.
No station source/settings/services were changed. The maintained plan records
the contracts, checks and remaining live admission work.

The owner has agreed to plan live queue integration. Read the maintained
[live integration plan](../internals/subbeats-live-integration.md) before
implementation. First upgrade already-selected prepared pairs through the
existing pair drain and rendered-clip handoff; do not bias track selection.
The first owner-run trial will use a temporary strict-playlist-only show whose
playlist contains prepared tracks. Check playlist preparation and selection
recovery, log actual upgrade/fallback usage, and audition complete clip joins
including the return from adjusted incoming tempo to normal playback.

Mixed prepared/regular pairings in both directions follow the initial trial.
Keep lyric uncertainty permissive and reuse the existing regular Stem Blend /
pair-aware crossfade when a Sub/Beats plan cannot fit. The future DJ Booth can
consume the same timing/envelope plan; its UI is separate work.

The earlier documentation-only update was committed as `44873c79`. The owner
explicitly waived a full PR test run at this stage. The first planning slice
adds a callable diagnostic and timing contract; it does not implement live
audio rendering or queue publication. Continue in `feat/subbeats-draft` before
moving an approved runtime candidate into the station checkout.

## Latest follow-up — 10 November: automatic style and Queue labels

The owner auditioned the 16-out/8-in Drums First plan on two pairs whose
library-key estimates fall outside the usual Camelot matches; both sounded
fine. The shared automatic style rule now uses Drums First for mismatched key
estimates, Long blend for compatible estimates, and keeps Short exchange when a
key is unknown. **Find Suitable
Transition** uses the same automatic style rule as live;
**Play selected mix** still uses the operator's selected style and cue markers.
The Queue row now distinguishes a committed Sub/Beats transition from ordinary
Stem blend. No station runtime was rebuilt or restarted. Tests and type checks
were not run for this follow-up; `git diff --check` passed.

## Latest work — 9 November: four selectable stem mixing styles

The approved next step is implemented in `feat/subbeats-draft`: Long blend, Short exchange (the preferred B), Bass swap and Drums first are selectable in cue-point preview. Both preview actions honour the selected style; changing it clears old audio, and the returned timeline names the actual style. The long-blend default preserves existing clients while these profiles are auditioned. Automatic style choice/variation and live Picker integration remain later work; automatic cue-plan search uses the operator-selected style now.

Bass swap exchanges bass across one beat while retaining longer melody overlap. Drums first normally brings incoming drums in over up to eight bars (earlier when an inserted drum loop requires it), then uses B's four-beat bass/`other` exchange. Vocal envelopes and the current vocal-overlap policy apply to every style. The owner has reviewed all four [style comparisons](2026-11-09-stem-mixing-styles.md): both fine for 1–3, with differences hard to hear, and Drums first preferred for 4 (El Nino → Everyday). Bass swap has no demonstrated preference yet; keep it optional. Drums first has one preference and one tie. No repeat review is required. The earlier preference for Short exchange remains the basis for an apparent-mismatch default. Next: connect automatic preview style selection, keeping unknown keys eligible and avoiding routine operator review; live Picker integration remains separate.

Development implementation: `4e8d0852` on `feat/subbeats-draft`, pushed to draft PR #10. The approved source has been applied to `/home/jaz666/Docker/subwave`; source rollback baseline `3deda1e6`. No live rebuild/restart was performed. The request and timeline schemas, both analyzer transports, Pydantic request forwarding and preview-cache version 16 include the style. An old analyzer cannot silently substitute Long blend for a requested new style. No new analysis or stem preparation is required. The maintained contract is in `docs/internals/music.md`.

## Latest work — 9 November: harmonic handover investigation

Read [the harmonic audition sheet](2026-11-09-harmonic-auditions.md). The owner clarified that the previous six passes may have applied only to the vocal-overlap exercise; the earlier feedback did not confirm harmonic suitability. The review scope is corrected in the earlier report and JSON. Six A/B extracts now compare the current envelopes with a four-beat exchange of bass and `other`, retaining the current vocal/drum envelopes. Audio lives locally under `/home/jaz666/codex/subbeats-harmonic-auditions-20261109`; source keys, measurements and exact input are documented in the new report/JSON. No product code, library state or running service was changed. The owner has now reviewed all six: B slightly wins 1, 2, 3 and 6, clearly wins 4 (The Key, the Secret → Insomnia), and both versions are fine for 5. This supports B as the candidate default for apparent mismatches; it does not verify the key estimates or prove that B benefits only incompatible pairs. No repeat review of these extracts is needed. Next: integrate the auditioned four-beat bass/`other` exchange as a Sub/Beats option, recommending it for apparent mismatches through the existing Camelot helper while keeping unknown keys eligible.

## Latest work — 9 November: head/tail confidence

Completion: confidence/automatic-refresh implementation committed as `aa621f25`, with the source-audition audit registration in `b180a38b`, and pushed to `jaz666/feat/subbeats-draft` (draft PR #10). The station candidate is committed and pushed as `2d8af4ea` on `test-station/sleeve-notes-clean-20261014`. The canonical development checkout is clean. The research checkout retains its documented pending cue/Silero experiments; the station retains two unrelated prompt/skill edits, excluded from these commits.

Controller type checks passed in the draft and station checkouts, and focused lint passed for the refresh/preparation modules. No additional tests or auditions were run for this final follow-up. No service was restarted. The running controller/analyzer had the earlier confidence implementation; the final refresh/storage additions need only an owner-run controller rebuild. No stem or lyric rescan is needed. Source rollback baseline: station `0998785f`; preserve unrelated local edits when reverting this candidate.

Next action from `/home/jaz666/Docker/subwave`:

```sh
docker compose --parallel 1 -f docker-compose.yml -f docker-compose.analyzer-gpu.yml -f docker-compose.discord.yml up -d --no-deps --build controller
curl --fail http://localhost:7700/api/health
```

The audition change is consolidated on `feat/subbeats-draft` in `/home/jaz666/codex/subbeats-draft-pr`, with candidate source in `/home/jaz666/Docker/subwave`. This research checkout retains separate pending cue/Silero work. Read [Head and tail confidence changes](2026-11-09-head-tail-confidence.md) for the policy, current evidence, six pairings and the rebuild command. Codex did not rebuild or restart services during implementation; the owner runs station rebuilds. Earlier source-identity and lyric-only notes below are retained as history.

The owner subsequently auditioned all six proposed pairings and reported that all sound fine (9 November). All six are recorded as acceptable for the vocal-overlap exercise in the report and its JSON shortlist. The owner subsequently clarified that these original passes applied to the vocal-overlap exercise. The later, separate harmonic A/B review is recorded at the top of this handover and in the harmonic audition sheet. This supports allowing short/uncertain overlap and retaining confidence as a ranking signal. It does not supply measured lyric-overlap durations or exact tail endpoints; do not promote timing confidence or demand additional reviews for these accepted mixes. No policy threshold or main-library cue was changed in response to this feedback.

Head and tail are assessed separately using prepared stem activity, source/version evidence and optional reviewed boundaries. A two-second total overlap allowance replaces the old any-intersection refusal. Longer high-confidence overlap steers automatic planning to another cue/loop; uncertain overlaps remain auditionable. Manual selected mixes can report and play a reviewed conflict. Confidence and overlap measurements are returned in the preview timeline and displayed in the web UI.

The isolated refreshed scan has already saved `state/subbeats/lyric-evidence.json` on the station, with metadata for selected versions, independent head/tail disagreements and the owner's 16 reviewed head onsets bound to their prepared recording keys. No Demucs pass or main-library cue update was performed. Version selection recovered Show Me Love at 9.13s. Of 109 tracks, head confidence is 16 high, 22 medium, 70 low and one unknown; tail confidence is 22 medium, 86 low and one unknown. High overall pair confidence requires reviewed tail evidence too, which has not yet been supplied. Do not promote metadata/energy agreement to high or invent probability percentages.

Preparation now refreshes lyric evidence automatically on successful preparation/coverage upgrade, using the same lookup as the explicit scan. The scan awaits candidate lookups, prints progress and accepts `--save`; strict reads and an exclusive save lock protect existing reviewed corrections. Read failures leave pairing uncertain; lookup/save failure never fails usable stems. Subsequent saves preserve reviewed boundaries for an unchanged prepared key. Matching/preview reads this saved evidence without network requests. The listener lyric cache and ordinary acoustic analysis remain separate. Preview cache version 15 includes the lyric evidence in its fingerprint. The station has later cue algorithms/earlier-loop handling than this research checkout; those station differences were preserved while applying these changes.

This note supersedes the immediate next steps in the [earlier handover](2026-10-30-subbeats-handover.md). It captures the source-identity fix now pushed to the draft PR and station branch. The ongoing phrase-detection research in this checkout is separate and must be preserved.

## Historical source-identity task and next step

The owner asked to prevent preview cache upgrades from making users rescan every prepared track. The code fix is complete and pushed to both the draft PR and the test-station branch. The station source has **not** been rebuilt or restarted; the owner runs station rebuilds.

Next, the owner can rebuild only the analyzer from the station checkout and retry the preview that previously reported `The original recording changed`:

```sh
cd /home/jaz666/Docker/subwave
docker compose --parallel 1 \
  -f docker-compose.yml \
  -f docker-compose.analyzer-gpu.yml \
  -f docker-compose.discord.yml \
  up -d --no-deps --build analyzer
```

No rescan should be needed when the downloaded recording still matches its saved stem audio. If the preview succeeds, record that result and continue pair testing. If it still fails, capture the exact message and selected pair; only a real audio mismatch or insufficient saved evidence should require rechecking.

## Vocal overlap handling — revisit today

The current policy is **detect and avoid vocal overlap while keeping the stems intact**. It does not duck, mute, or cut vocal stems to make a pair fit. The first pair check uses persisted incoming/outgoing vocal activity from cue coverage when available; otherwise it uses measurements from the selected prepared passages. The renderer loads and measures those passages as well. A preview only tries a drum loop when it detects an overlap.

Measurements are energy estimates, not voice recognition. `subbeats_vocals.py` measures 50 ms RMS frames from the separated `vocals` stem and the reconstructed full mix. The shared gate in `analyze_worker.py` requires energy to clear both 15% of the vocal stem's 90th-percentile level and 6% of the mix's 90th-percentile level. It bridges gaps up to 400 ms and discards runs shorter than 300 ms. A second, lower gate extends the ends of already detected activity; passage boundaries get 200 ms padding. Coverage-edge passages are marked uncertain. This can miss quiet/background vocals, especially content that Demucs places in `other`; it cannot establish that a passage contains words. Gusto's low background-vocal groove in `other` is a known example where listening remains essential.

`assess_vocal_pair()` maps incoming passage times onto the outgoing clock using the selected tempo ratio, then checks intersections over the actual transition window. It reports `conflict`, `estimated`, `uncertain`, `coverage`, or `unassessed`. Missing/incomplete measurements and empty detections do not prove silence. When the natural outgoing lead-in starts before saved exit stems, the renderer copies that original stereo lead-in into the outgoing vocal-analysis channel conservatively. Thus any audible lead-in energy may be treated as possible outgoing vocal activity, and an incoming vocal over it can be refused even if that lead-in is instrumental.

On a measured conflict, the planner may extend the incoming opening with one or two repeats of a **two-bar, grid-aligned, vocal-free drums-only** passage. The cue must not be explicitly invalidated, must use a fitted/opening/onset grid, and must have an 8/16-bar phrase. The candidate loop must fit before its natural arrival, have saved coverage and usable drum energy, and contain no measured incoming vocal passage. Bass, `other`, and vocals are silent in the inserted bars. Incoming passages after the loop are shifted by the added time; the planner requires them to clear the outgoing activity with at least a one-beat gap. The renderer inserts the loop, remeasures the resulting incoming stems and checks the pair again before mixing. It still preserves both vocal stems and lets the outgoing recording finish naturally.

If a manual cue selection conflicts and no safe loop works, the preview returns an error. **Find Suitable Transition** can try other cue combinations, then prepares the configured regular crossfade preview if none render. That crossfade preview does not run this vocal-avoidance planner; it is only an audition of the regular fallback. The eventual Picker integration must defer to Subwave's regular transition selector. Loop timing and actual drums are checked, but seam quality, Demucs bleed, background vocals, and musical fit still require listening. The looped stems are remeasured before tempo-stretch and their source-coordinate activity is mapped by the tempo ratio; the final stretched mix is not independently passed through another vocal detector.

Useful questions for today's review:

- Should an unmeasured outgoing original-mix lead-in continue to be treated as entirely possible vocal energy, or should it get its own measurement/coverage?
- How should low-level or background vocals in `other` be detected and represented without treating Demucs bleed as a sung passage?
- Should `uncertain`, `coverage`, and `unassessed` pairs remain previewable with a warning, or should some of those states block an automatic Sub/Beat choice?
- Is repeating only incoming drums acceptable when it delays the natural vocal arrival, and should the final tempo-stretched audio receive an additional vocal check?

Relevant implementation and tests: `controller/scripts/subbeats_vocals.py`, `subbeats_cue_matching.py`, `subbeats_cue_preview.py`, and `subbeats_cues_test.py`.

## Branches and worktrees

- Draft PR: [Subwave PR #10](https://github.com/Jaz666/subwave/pull/10), branch `feat/subbeats-draft`, worktree `/home/jaz666/codex/subbeats-draft-pr`, pushed head `cd439fa8` (`fix(subbeats): verify changed containers against saved stems`).
- Test station: branch `test-station/sleeve-notes-clean-20261014`, checkout `/home/jaz666/Docker/subwave`, pushed head `0998785f` with the same fix cherry-picked. Working tree was clean after the push.
- This checkout: `/home/jaz666/codex/subwave-sub-beats`, branch `feat/subbeats-phrase-evidence-20261102`, based at `4b7295c0` when checked. It has many modified and untracked cue-detection, cue-coverage, planner, UI and research files, including a modified 3 November handover. Those are separate ongoing work; do not reset, overwrite, or merge them as part of the source-hash fix. This new handover file is additive and uncommitted.

## What changed for the scan-once issue

Preparation stores a byte-level SHA-256 of the Navidrome raw source. Cue preview previously required that exact hash whenever it fetched original audio. A preview-cache version bump invalidated cached WAVs and forced a new render, which exposed this strict check. A different container/tag byte stream could be rejected even when its decoded audio still matched the prepared stems.

In `subbeats_reference_preview.py`, the exact hash remains the fast path. When it differs, the renderer now checks decoded audio against the sum of saved stems at the start, middle, and end of each available passage, using up to eight seconds per window and a 10% relative-RMS limit. It accepts only if at least one non-silent window is usable and every checked window matches. Cue preview callers pass their saved coverage into this comparison. A genuine audio change, duration mismatch, or lack of usable saved evidence still declines the preview and can require rechecking. The preview cache version bump itself does not change source identity or require rescanning.

Focused verification passed on the PR branch using the existing analyzer CUDA image with the working-tree scripts mounted read-only:

- `subbeats_reference_preview_test.py`: 5 tests passed.
- `subbeats_cues_test.py`: 38 tests passed, including verification that cue previews use saved coverage.
- `git diff --check` passed.

The host Python lacks NumPy, so these tests were run inside the analyzer image. No station build, restart, or rescan was performed.

## Broader Sub/Beats direction

The preview work is still a development milestone, not live Picker integration. The eventual behavior should assess the already selected outgoing/incoming pair, use a suitable Sub/Beat stem transition when one can be prepared (including the supported bar combinations and drum-loop handling for vocal separation), and defer incompatible pairs to Subwave's existing regular transition selector when integrated into the selection path. Key-clash analysis is now being investigated separately from vocal overlap. Do not turn preview fallback behavior into a new live crossfade rule.

For Beat This!/Librosa cue detection and the owner's listening notes, continue from the 3 November handover and its linked research artifacts. Keep those detector investigations distinct from the current source-identity fix; the owner had asked to stop chasing perfect intro detection while moving on to outro work.

## New direction: lyric boundaries

The next detection work is about **where lyrics begin and end**, not expanding vocal/instrumental classification. Keep lyric timing separate from `introMs`, `outro.startMs`, and Demucs/Silero vocal ranges so it cannot silently change musical cues or playback policy.

Use this source order:

1. Synced structured lyrics from Navidrome.
2. If absent, Subwave's existing on-demand LRCLIB lookup, but only if it supplies synced lyrics. Its lookup is asynchronous in the listener path; distinguish `pending`, unavailable, and a timed result rather than treating the first pending response as a miss.
3. If neither source supplies usable timing, leave the lyric boundary unknown. Plain lyrics and Subwave's vocal/instrumental flag can provide context, but cannot supply timestamps.

The first timed lyric is an onset. The final timed line's timestamp is only its onset, not its end; do not publish it as an exact lyric end. Keep source and uncertainty alongside the timing. Use Subwave's vocal/instrumental flag as supporting evidence: a timed lyric that conflicts with an instrumental classification remains usable and records a disagreement.

Uncertain lyric evidence must not block a track from airing. Keep current playback and cue behavior when evidence is missing or unclear. Flag only exceptional cases for later review, and preserve manual corrections across future analysis runs. The initial comparison should report lyric boundaries beside existing intro/outro measurements for the 92 lyric-enriched tracks without changing those measurements or Demucs/Silero vocal ranges.

Implementation boundary: `lyrics-sources.ts` already owns Navidrome-first lyric choice and LRCLIB's on-demand cache for the listener route. `analyze.ts` currently reads Navidrome lyrics directly for vocal-range derivation. Implement lyric-boundary evidence as a separate path; do not route LRCLIB timings through `deriveVocalFromLyrics`, since alternate-edit mismatches can make estimated vocal ranges unsafe.

The first report-only slice is `controller/scripts/lyric-boundary-scan.ts`. From the controller container, run `npm run lyrics:boundaries -- --prepared` to inspect prepared Sub/Beats tracks, or pass `--ids id1,id2` / `--ids-file PATH`. It reports the first and last lyric-line starts, source/status, Subwave's instrumental verdict, and existing intro/outro cues. `lastLyricEndMs` is deliberately null because the synced line timestamp does not provide a line end. A pending LRCLIB lookup can be picked up by rerunning the scan after it completes. This may populate the existing external-lyrics cache, but it does not write acoustic analysis, cues, or playback state.

### Listening feedback — 2026-11-09

The settled 109-track report found 55 timed lyric results (16 music-server, 39 LRCLIB), 21 untimed, 31 without lyrics, and two explicit instrumental lyric results. The owner reviewed the 16 first-onset disagreements of at least five seconds: nine preferred the lyric timestamp, four preferred the existing cue, and three needed a separate correction. Both sources produced errors; this selected disagreement sample is not an overall accuracy estimate. The full feedback and approximate reviewed onsets are recorded in `2026-11-08-synced-lyric-boundary-scan.md`.

Explicit corrections: N‐Joi — Anthem 6.0s; Steve Angello & Laidback Luke feat. Robin S — Show Me Love 9.0s; Armand van Helden — My My My 14.0s (slow fade in, first detectable word). These are documented evidence, not yet applied library overrides. Source order remains a lookup preference, but a synced timestamp is only an onset candidate until checked against the recording. Investigate word matching against the audio for confirmation; do not assume the first timed line includes the first audible lyric, or revert to energy/Silero alone as a lyric recognizer. Uncertainty remains non-blocking and does not require a review for every disagreement. No outro listening judgements were supplied.

The owner then raised LRCLIB version mismatches. An audit of the six rejected LRCLIB candidates found a useful alternative for Show Me Love: selected record 9747087 starts at 6.5s; record 33069994 starts at 9.13s, close to the owner's 9.0s correction, and names the same compilation. Both records are 182s versus the station's 184s. The current client accepts a synced `/api/get` result before considering alternatives, and its fallback search takes the first synced artist/title/duration match without album/edit ranking. Other rejected tracks had exact duration matches; Feels Like Heaven also matched album/title/artist, so metadata cannot prove audio timing. The report's LRCLIB version audit records selected IDs, metadata and alternatives. Investigate matching and provenance before adding a recognizer; version mismatch remains a hypothesis rather than a diagnosis for every failure. No matching policy or station data was changed by this audit.
