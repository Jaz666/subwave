# Sub/Beats selection and cache policy

## Decisions from the Sub/Beats and waveform review

Sub/Beats eligibility identifies tracks that can produce useful material; it
does not authorize caching every eligible track. More than 12,000 tracks may
qualify in an 80,000+ track library, while fewer than 10,000 unique tracks were
played on air in the last six months. Extra processing and disk use should be
driven by a user's selection or a separate opt-in demand signal.

### Preparation paths

- Pick-time caching remains limited to the regular head/tail stem set so the
  real-time transition path keeps its latency budget.
- Sub/Beats Explore selections are explicit requests and must be able to add
  more than 100 tracks to the preparation queue in one action. Queue admission
  and cache-budget checks remain separate: a queued track is not a promise that
  its artifacts fit immediately.
- Heavy Sub/Beats preparation runs in a managed Library Demucs scan, whether
  the scan is started manually or by the scheduler. This gives it the scan's
  resource and maintenance controls instead of doing cue analysis in the
  playback pick window.
- Explore queue entries are handed to preparation only after a successful
  Demucs scan. During that scan, selected tracks keep any regular stems they
  already have, while new regular-stem writes are skipped; Sub/Beats then uses
  the shared stem-cache budget. If preparation fails or the budget blocks it,
  no regular stems are written for that track during this scan. A later scan
  can process a requeued Sub/Beats request or fill in its regular stems.
- A future setting may opt into treating a track played on air during the last
  six months as a request to upgrade it to Sub/Beats, but only when it passes
  the technical qualification checks. It should deduplicate by track and
  enqueue the upgrade for the next managed scan. This is a proposed follow-up,
  not behavior claimed by this change.
- Qualification alone must not queue or prepare tracks. Explore remains the
  route for users to request other eligible tracks explicitly.

### Storage and compatibility

Prepared Sub/Beats stems can supply a regular stem blend directly when the
required head or exit interval is covered. The renderer reads the verified
bundle in place, restores its shared storage gain, and uses its exact source
offset; it does not make a duplicate regular-stem copy. A missing, damaged or
too-short region remains a cache miss and follows the ordinary transition
fallback.

Reusing regular stems while preparing a Sub/Beats bundle is still unsafe for
existing regular-cache entries: they do not record source identity or separator
model identity. Future sharing can use only regions with that provenance, and
must preserve exact sample ranges and integrity while storing shared audio
once. This is the constraint for expanding compatibility without growing disk
use.

The measured preparation of one 226.586-second track added about 50 MiB and
took about 47–52 seconds on the tested RTX 3060 system with two CPU cores.
Ordinary warm head/tail stems took about 13.6–13.9 seconds. These are isolated
single-track measurements, not library throughput predictions; track length,
formats, cache overlap, contention and queue waits all change the result. The
measurement is documented in the November 11 scan benchmark investigation.

## Waveform status

The on-air waveform reports observed speech, jingle, bed and stem-transition
events. The added “Speech ready” indicator means speech has been prepared but
has not yet been confirmed on air; it may still be dropped before airing. It is
not an aired event marker.
