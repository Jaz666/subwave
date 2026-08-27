# Show-boundary handoffs: live-evaluation handover

Read [`show-boundary-handoffs.md`](show-boundary-handoffs.md) first. It is the
upstream-facing design record; this note records the current live evaluation
and the practical next steps for a fresh chat.

## Status at handover

The show-boundary change is deployed to the live station for a one-day
observation run. The controller was rebuilt and restarted cleanly on
2026-08-27; its health check passed and the now-playing watcher and scheduler
started normally.

Do not make further changes during the run unless the user reports a clear
operational problem. This is an observation period, not a prompt-tuning or
feature-development session.

## What changed

The prior implementation used the picker's look-ahead context for both music
selection and the live session rollover. That could make an outgoing DJ sign
off several minutes early, then let the incoming show/roster leak into speech
while the last outgoing track was still playing.

The fix separates those responsibilities:

```text
look-ahead context -> pick the appropriate next-show music
live context       -> retain the current session and roster until the real boundary
```

When the look-ahead identifies that the current track is the last outgoing
track, the controller now:

1. lets the track's own intro/link air first, if it has one;
2. runs the outgoing sign-off and incoming greeting during that track;
3. suppresses ordinary speech until the actual session rollover;
4. rolls to the incoming session at the real boundary without a duplicate
   handoff or programme intro.

The handoff greeting resolves its host/guest roster at the incoming show's
time. This specifically protects adjacent shows that reverse the same two
presenters' roles.

An outgoing pick-linked voice line is suppressed at this seam: it would
otherwise air after that presenter has signed off. The handoff greeting is the
intentional introduction for the incoming show instead.

## Branches and commits

Upstream-style worktree:

```text
/home/jaz666/codex/subwave-show-boundary-handoffs
branch: fix/show-boundary-handoffs

43af8a6a docs: define show-boundary handoff requirements
25384018 fix: keep show handoffs on the live boundary
```

The branch is deliberately vanilla-oriented. The design note makes clear that
the optional schedule-fact cadence concern does not describe default SUB/WAVE
behaviour and this code change does not add such an integration.

Live checkout:

```text
/home/jaz666/Docker/subwave
branch: live/producer-routing

79c7a509 fix: keep show handoffs on the live boundary
```

The live commit is a careful merge of the vanilla change with live-only
prompt-memory work. Do not copy the live branch directly into an upstream PR.
Use `fix/show-boundary-handoffs` as the PR source after the evaluation is
accepted.

## Validation already completed

- `npm run lint`: no errors (the repository has pre-existing TypeScript
  `any` warnings).
- `npx tsx scripts/handoff-boundary.test.ts`: passed.
- `npm test`: all relevant JavaScript tests passed. The overall runner reported
  its existing analyzer Python-environment failure because `numpy` is absent
  for `vocal_gate_test.py`; this is unrelated to the handoff change.

The live controller also passed lint/type-check after the merge, before the
rebuild.

## What to evaluate

Collect a concise observation around each show transition, especially a
host/guest role inversion. The desired audible sequence is:

```text
last outgoing track begins
  -> its existing intro/link, if any
  -> outgoing sign-off + incoming greeting during that track
  -> no ordinary follow-on speech before the boundary
  -> incoming show/session/roster at the real boundary
```

Record timestamps and the spoken text for any failure. In particular, look
