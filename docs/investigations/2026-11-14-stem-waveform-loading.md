# Stem waveform loading: independent requests and bounded retries

The owner reports intermittent missing stem previews, sometimes persisting after
several retries. This is separate from the regular Stem Blend audio project.
The main waveform and audio rendering are unchanged.

## Failure paths found

- Dash and the WaveSurfer experiment loaded two sides in parallel, but the four
  stems sequentially. All eight shared one admin query's 15-second deadline and
  only published data after every request succeeded. A late or failed request
  hid already loaded results and a manual retry repeated the whole sequence.
- Regular-blend source endpoints refused the previous pair when the incoming
  original became current. Unlike Sub/Beats, the resolver did not retain that
  pair. A late load or retry could therefore receive a permanent 409 despite
  its preview remaining on screen for a buffered listener.
- On-demand decoding had no server deadline. A stalled job could stay in the
  shared pending map indefinitely, and every retry would wait on it again.

These are demonstrated code/test failure paths, not a claim that a particular
reported station request was captured and its precise error diagnosed. Recent
controller/web logs did not supply a specific waveform error. Unexpected peak
failures now log the side, stem, track ID and underlying error on the controller.

## Change

A shared `StemWaveformRow` gives each of the eight sources its own query, cache
and deadline. They start independently, render as results arrive, and a row's
Retry button refetches only its failed sides. Successful sources stay visible.
Both the Dash and WaveSurfer experiment use this row, with their own existing
styles. Source mapping, gain/fade predictions and main-track waveforms retain
existing behaviour.

For regular blends, explicit requests naming the immediately previous outgoing
track retain its pair for 60 seconds after the incoming track's recorded start,
only if the incoming item carries the stem-seam flag. Reads naming the current
track still discover its next planned transition. Both stem-audio and stem-peaks
routes accept that bounded pair; unrelated/expired tracks remain refused.
Sub/Beats retains its existing timing/transition-ID checks and longer window.

The stem-peaks route aborts a decode after 12 seconds, leaving room inside the
browser's per-source 15-second deadline. Failed pending entries are released so
a subsequent retry can start new work. This does not change the shared timeout
for other admin queries or add an automatic retry loop.

## Verification

- 21 now-playing file/peaks tests pass, including retry after a regular handover,
  unrelated-track refusal, and stalled decoder abort followed by successful retry.
- Eight cache coverage/live source tests pass, including previous-pair expiry and
  preserving discovery of the current track's next transition.
- Two component regressions pass for a loaded side remaining rendered beside a
  failed/pending side. All 13 existing waveform mapping/envelope tests pass.
- Admin query ownership audit and its nine tests pass. Controller/web TypeScript
  checks and lint of the changed TypeScript/React files pass.
- An isolated Chromium fixture uses the real shared row and TanStack Query at
  desktop 1280px and mobile 375px widths. With one injected 502, seven sources
  render and Retry fetches just the failed eighth: nine requests total. A held
  eighth source reaches its client timeout without discarding the other seven.
  No page errors or horizontal overflow. Requests were fixtures, not the station.

No container rebuild, station HTTP audition or audio transition was performed as
part of validation. The full controller/web suites were not run. Initial test
setup problems were corrected before the passing checks above.

## Integration

Development branch: `fix/stem-waveform-loading-20261114`, based on the parked
Sub/Beats source at `0d1631b96`. Keep the audio-focused Standard Stem Blend branch
separate. The station integration candidate changes only the waveform row,
source route and their tests/documentation; preserve all prior local station
changes, including the precomputed-peaks module and Library Analysis work.

Rebuild controller and web together when the owner chooses. Analyzer/broadcast
images and stem cache regeneration are not required by this fix.
