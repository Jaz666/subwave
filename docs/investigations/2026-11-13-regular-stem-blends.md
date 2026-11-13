# Regular Stem Blend investigation and audition harness

The 13 November live recordings exposed two separate issues: an almost inaudible
outgoing drum contribution, and a Mixing Desk preview clock/estimated handover
that did not represent the rendered audio. Investigate the audio first; live
waveform display changes are deferred.

## Upstream baseline

The baseline is `render_transition` in upstream `develop` at
`5a8b3863457ac85816d0d0ffcc8a2550c0afca4c`. Its beat-carry mix:

- Selects the last timing-valid outgoing bar before the measured wind-down.
  Despite the “full-energy bar” comment, this does not measure drum energy.
- Starts the incoming bass, other and vocal stems immediately, withholding its
  drums until incoming bar five. It carries only the outgoing drums, reduced
  by 3 dB, retriggered against the incoming bar grid.
- Fades the outgoing drums across carry bar four, then plays two full incoming
  bars before returning to the original incoming recording.
- Can reduce the outgoing contribution further for peak headroom. It does not
  time-stretch the selected drum bar.

The station stream captured at 11:50 contained all sections of the rendered
11.912-second clip; correlation against the reference was 0.990–0.998 outside
the joining fades. The short perceived transition was not a shortened clip.

| Pair | Clip | Incoming drums | Source drum-loop RMS | Outgoing relative to incoming, first three carry bars | Additional peak reduction |
| --- | ---: | ---: | ---: | --- | --- |
| A Bad Day — Jim Bob → You Can Get It If You Really Want — Desmond Dekker | 11.912s | 8.104s | −79.18 dBFS | −65.02 / −65.28 / −65.29 dB | None |
| Outtasite (Outta Mind) — Wilco → Classic Masher — Pixies | 10.774s | 7.314s | −23.32 dBFS | −7.65 / −10.89 / −10.56 dB | None |

Both pairs were rendered again by the harness and independently by the exact
upstream function above. Every transition PCM sample matched, including the
instrumented production function with observation disabled. The Jim Bob loop is
3.901 seconds long, but the incoming bars are about 1.9 seconds: upstream
restarts/truncates that loop rather than stretching it. This is an additional
listening concern, distinct from its near-silent drum content.

## Further auditions: preserve the outgoing musical ending

The owner identified premature removal of the outgoing song as a common defect,
including transitions whose loop levels are healthy. Renderer parity and clip
length establish execution, not whether a closing passage has finished.

The Wildhearts — Vanilla Radio → Monster Magnet — Look to Your Orb for the
Warning (edit) matched the uploaded 32.039-second complete audition exactly.
Its clip lasts 20.039 seconds, with incoming drums at 13.444 seconds. The first
three outgoing drum bars sit −0.27, +0.27 and −1.19 dB relative to the incoming
contribution; there is no additional peak reduction. This establishes a healthy
drum contribution, not proof that the outgoing song's ending was respected.

Santigold — Disparate Youth → Joan as Police Woman — Oh Joan also matched the
uploaded complete audition sample for sample. The file is 21.590 seconds long,
with six seconds of context before its 9.590-second clip. At approximately six
seconds in the file, the renderer starts replacing Santigold's actual tail:

- The chosen source bar is 276.080–277.612 seconds. Replacement begins at
  277.612 seconds; the short joining fade ends at 277.912 seconds.
- The cached recording ends at 284.400 seconds, with measured wind-down at
  281.142 seconds. Replacement starts 3.530 seconds before wind-down and
  6.788 seconds before decoded EOF. The remaining passage is not just silence:
  bass/other material continues at substantial level up to the wind-down.
- Saved vocal evidence spans 277.542–278.158 seconds, crossing both the start
  and end of the short joining fade. The cached vocal stem also has substantial
  energy at the cutoff. This supports the owner's report of an unfinished exit;
  it does not independently identify the end of a lyrical phrase.
- Only the copied drums remain as the outgoing contribution. Their source RMS
  is −58.16 dBFS; the first three mixed bars are 47–50 dB below incoming music.
  No additional peak reduction was applied.

The selection rule takes the last available bar before wind-down and immediately
uses its end as the replacement point. It does not find a completed musical
ending, preserve the rest of the real outgoing passage, or check the outgoing
vocal boundary. Sparse grids can move the cut even further before wind-down.

The next audio experiment must prioritise preserving the outgoing closing
passage, including vocal and instrumental resolution, while introducing the
incoming stems around it. A louder borrowed loop alone cannot restore the
removed ending. Compare that experiment against this unchanged upstream baseline;
live Mixing Desk fixes remain deferred.

## Browser harness

Open **Sub/Beats → Preview → Regular Stem Blend test**, or
`/admin/library/stem-blend-test`.

Search cached track identities, choose an outgoing track with regular tail
stems and an incoming track with regular head stems, then audition:

- The complete mix with up to six seconds of context on each side.
- The exact transition clip alone.
- The outgoing drums at their actual rendered contribution level.
- The incoming contribution at its actual rendered level.

The report gives the selected source bar, actual incoming drum entry, station
gains, peak-safety reductions and per-carry-bar RMS levels. A contribution more
than 24 dB below incoming music is flagged for listening; this is a diagnostic
heuristic, not a new qualification rule or playback veto. Solo audio is never
normalised. Download the audition WAV to retain or compare it.

The harness calls the existing regular renderer with an optional observer;
observation is off for live rendering. The mix arithmetic and decisions remain
unchanged. It reads regular files only, without Sub/Beats fallback, separation,
cache admission or queue changes. It deliberately bypasses live picker tempo,
show and drain-deadline gates so questionable pairs can be reproduced.

Context is the sum of cached stems at station gain, with simulated linear
0.3-second joining fades. It is not the original source decoder, Liquidsoap,
voice ducking, bus limiter, Icecast or listener buffering. Floating-point WAVs
preserve actual contribution levels; context above full scale is reported,
not silently normalised. Use the captured broadcast when assessing those other
parts of the playback chain.

Preview files live temporarily under `state/stem-blend-previews/audition-*`,
separate from live `transitions/` and the stem cache. Both the local transport
and analyzer HTTP transport remove their audition directory after consuming
it. No new cache policy or persistent stem files are introduced.

## Follow-up after auditions

Use a wider range of regular-stem pairs to decide how to find a musically
usable outgoing drum bar, handle very quiet/no-drum tails, and assess
half/double-tempo retriggering. Keep the unaltered baseline available while
comparing changes. After the audio investigation, correct the live preview
clock, carry markers and lifetime using actual render timing.

## Verification and station state

- Both real pairs produced PCM identical to the pinned upstream renderer and
  to the unobserved current renderer. All four audition modes were generated.
- Five new Python audio regressions and the complete analyzer Python suite
  passed, including the existing regular/Sub/Beats stem compatibility checks.
- Five new authenticated API tests and all ten existing stem-route tests passed.
- All 702 web tests passed. Stale expectations for the former 100-track cap
  and the on-air caching setting were aligned to the existing contracts;
  preparation and settings behaviour were not changed.
- Controller and web lint/type checks passed; controller lint retains its
  existing warnings. An unused type import was removed to clear its lint gate.
- Desktop and mobile browser checks decoded real audition WAVs, verified
  role-specific cache choices, request payloads, reports, solo changes,
  selections across searches and stale-audio cleanup, with no page overflow or
  browser errors. API responses were fixtures; this was not a rebuilt analyzer
  HTTP end-to-end check.
- Admin-query ownership audit and UI detector passed.

The full controller suite was not rerun. The station checkout, running images,
on-air queue and live Mixing Desk were not changed. Next: deploy the committed
candidate when requested, rebuild analyzer/controller/web, then audition these
pairs through the station's actual HTTP path before changing the blend rules.
