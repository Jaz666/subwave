# Adaptive discussion word budgets — 16 October 2026

Native Sleeve Notes and Banter now receive a total word target derived from the time left on the currently playing track when immediate speech is being prepared. This includes automatic Banter fallback and manual calls through those paths. No changes have been made to the live station or mixer; the owner deploys with a controller rebuild.

## Budget

The queue's current effective playback clock accounts for cue-in/cue-out. The calculation additionally reserves the outgoing track's stamped crossfade (or station crossfade when unstamped), eight seconds of safety margin, a writing allowance, and two seconds per expected contribution. Multi-host budgeting anticipates one turn for each participant plus a host response. It fits sequential TTS generation and playback into what remains:

`word target = floor(available seconds / (1 / generation words per second + 1 / spoken words per second))`

Writing allowance uses the recent 95th-percentile successful Sleeve Notes/Banter generation time, with a five-second minimum and initial allowance. Generation/speaking rates use the latest 20 eligible successful TTS samples. Each presenter needs five samples before their own rate is used; otherwise the recent station rate is used once sufficiently sampled. The slowest cast rate is used. Initial fallback rates are 3 generated words/second and 2.3 spoken words/second. The owner's reported 3.12/3.49 rates are not hardcoded.

The target remains bounded by the existing discussion scale: up to 140 words for exchanges, 100 for solo Sleeve Notes and 40 for a manual one-Spark observation. It is a ceiling rather than an instruction to fill available time. A window too small for a complete contribution skips writing rather than cutting speakers or generating filler.

## Rechecks

After writing, the remaining deadline is checked against the returned script's word count, expected rendering and playback time, and per-contribution overhead. A script that no longer fits stands down before creating story reservations. This is an operational time check, not factual verification.

Queue publication accepts an optional speech deadline for these callers. After TTS rendering, the complete exchange's measured clip lengths plus voice padding must fit before that deadline, and the same play of the same track must still be current. Otherwise the exchange is rejected before its first contribution; the native segment caller releases reservations. Existing queued/confirmed-air records and voice rendering remain unchanged. No exchange is trimmed midway, no audio is accelerated, and no second writing call is made to repair an overlong script.

## Placement and limits

An unknown playback clock retains the existing prompt length and placement. Speech explicitly deferred to the next track boundary also retains existing handling: the outgoing track's remaining time cannot be used as its speaking window. This does not introduce a dedicated multi-host break or solve overlap at a deferred boundary. Programme feature scripts and other skill kinds are unchanged.

The rates are recent averages rather than guaranteed throughput; scripts are counted before engine normalization and rendered durations provide the later check. Long voice/jingle serialization waits or unexpected mixer timing can still exceed the safety margin. The deadline does not interrupt already-started speech and does not promise an exact end time.

## Validation

Thirty-eight focused tests pass across timing calculations, whole-exchange duration checks, same-track identity, unknown/deferred timing, native prompt integration, pre-reservation stand-down, existing native segments and cast/speaker handling. Controller lint/type checking and `git diff --check` were run. Full suites and live broadcasts/provider calls were not run, following the owner's usage-budget preference.
