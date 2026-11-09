# Complete Sub/Beats handoff auditions — 9 November 2026

## Candidate and evidence

The new `subbeats_handoff.py` renderer consumes the shared pair planner's
sample-based clock. It uses Rubber Band R3 for pitch-preserving tempo changes,
retains the existing Short exchange stem envelopes, releases the incoming
tempo over eight outgoing beats, and joins back to verified original audio.
This is an offline audition milestone. It does not connect the live queue.
The generator explicitly chooses Short exchange to isolate handoff behaviour;
the controller's automatic style selection is not exercised by these renders.

[Recorded results and code hashes](2026-11-09-live-handoff-auditions.json).
Generator: [subbeats_handoff_auditions.py](subbeats_handoff_auditions.py), which
calls the production `render_preview(..., handoff=...)` path with read-only
prepared stems and local originals. The source fetch callback makes temporary
copies; source verification still runs. No network, new separation, lyric
lookups, station source changes or playback writes were used.

Three complete renders succeeded. A fourth planned direction was declined
because the incoming track's saved opening cues are explicitly invalid.
Listening remains pending; numerical seam agreement does not establish that
the tempo release or musical blend sounds good.

| Case | Pair | Incoming tempo during blend | Release in audition | Native tempo reached | Outcome |
| --- | --- | --- | --- | --- | --- |
| 1 | Sash! — Encore une fois → Faithless — Insomnia | +3.32% | 39.13–42.79s | 42.79s | Rendered |
| 2 | Faithless — Insomnia → Sash! — Encore une fois | — | — | — | No valid saved incoming cue; ordinary transition retained by policy |
| 3 | Agnelli & Nelson — El Nino → Everyday | −0.09% | 28.22–31.77s | 31.77s | Rendered |
| 4 | Faithless — Insomnia → Agnelli & Nelson — El Nino | −5.85% | 24.87–28.64s | 28.64s | Rendered |

The table's times refer to the exported MP3 auditions, including the four-second
original-audio lead. The JSON holds exact timing; these values are rounded.
Case 2 records a planning decline, not an exercised live fallback.

## Listening files

Files are in `/home/jaz666/codex/subbeats-handoff-auditions-20261109/`:

- `01-complete-handoff.mp3`: Sash! → Insomnia.
- `03-complete-handoff.mp3`: El Nino → Everyday.
- `04-complete-handoff.mp3`: Insomnia → El Nino.

Each contains four seconds of the original outgoing recording before the clip
and eight seconds of the original incoming recording after it. Listen especially
to the last fifteen seconds: the tempo release, the internal join to original
audio, and the continuation after the clip. The outer audition edges have a
20ms fade; the two internal joins are untouched.

Per-source gains are unity for this experiment. One peak reduction applies to
each complete audition, including both original context sections; MP3 exports
are 192 kbps. This does not establish station loudness or Liquidsoap codec seam
behaviour. Cached handoff WAVs use float samples without whole-clip normalization
or edge fades. The first/last 300ms matched the decoded originals exactly in all
three final WAVs (maximum absolute sample errors `[0.0, 0.0]`).

## Timing-map fault found and corrected

The first implementation included an explicit `0 0` timing-map anchor. On
Rubber Band 3.1.2 R3 this triggered a non-finite ratio warning and a reset to
unity. The larger slowdown exposed a duration mismatch: 949,430 output frames
for 988,759 planned. Faster cases could be truncated to the expected length,
so an output-length check alone was insufficient evidence of correct stretching.
This matches the upstream report in
[Rubber Band issue #124](https://github.com/breakfastquay/rubberband/issues/124).

The final renderer omits the implicit zero anchor, keeps the last anchor inside
the material, and supplies the total ratio separately, following the
[time-map contract](https://breakfastquay.com/rubberband/usage.txt). It rejects
ratio-reset warnings as well as invalid output duration, level or samples.
Handoff renderer cache version 2 invalidates the initial outputs without changing
prepared stems or ordinary previews. All three listening files were regenerated
with this correction; superseded isolated outputs are not listening evidence.

## Runtime and remaining checks

- Isolated analyzer image plus Debian `rubberband-cli` 3.1.2, two CPUs, 4 GiB RAM,
  no network and read-only source/stem/code mounts. Exact image IDs are in JSON.
- Actual preparation manifests, cue coverage and original-recording checks ran;
  no demixing model was loaded.
- The exact final clip length and source guards passed for all three renders.
- Controller/web types, focused lint, Python syntax and documentation checks
  accompany the source commit. No full suites, HTTP/browser walk-through,
  Liquidsoap playback, restart/cancellation exercises or owner listening result
  are claimed for this milestone.
- Looped, exactly equal-tempo and other failure cases still need coverage before
  live enablement. The owner-run strict-playlist show remains the first live trial.

Next: owner listening to these complete handoffs, followed by queue integration
behind an initially disabled switch, with protected clip publication, deadline
handling, accurate playback timing and the established fallback chain.
