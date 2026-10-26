# Show skill notebooks

## Skill author handover

Enable the controller-owned notebook in SKILL.md frontmatter:

```yaml
---
name: show-discussion
label: Show Discussion
notebook: show
cooldown: 5m
context: show
---
```

Keep the skill's own prompt, context and cadence. `notebook: show` is preserved
by the editor even though it has no dedicated UI field. Rescan Skills after
editing files directly. Existing skills remain unchanged unless they opt in.

The notebook lives in `state/skills/<folder>/notebook.json`, beside SKILL.md
and the optional tool.mjs. **Do not write that file from a tool.** The controller
owns its schema, leases, atomic writes and delivery receipts. Standalone skill
exports/community packages omit it; station backups include it. Restoring a
station preserves committed memory and discards pending deliveries, whose WAVs
belonged to the old runtime.

## What generation receives

The normal segment writer automatically receives the committed topic, contribution
count and recent contributor/summary pairs. Receipt IDs and timestamps are left
out of its prompt to keep it compact. The tool/API snapshot additionally exposes
the scope and revision:

```json
{
  "skill": "show-discussion",
  "occurrence": {
    "id": "scheduled:show-id:1792850400000",
    "showId": "show-id",
    "startsAt": 1792850400000,
    "endsAt": 1792861200000
  },
  "revision": 3,
  "topic": "Should a biscuit qualify as breakfast?",
  "contributionCount": 1,
  "history": [
    {
      "id": "run-uuid:0",
      "contributor": "Pat",
      "summary": "A biscuit counts as breakfast if eaten before the morning bus.",
      "airedAt": 1792851000000
    }
  ]
}
```

A tool can read the same snapshot:

```js
export default async function showDiscussion(ctx, state, services) {
  const notebook = services.notebook.read();
  if (!notebook) return { available: false, reason: 'Enable notebook: show' };
  return { available: true, topic: notebook.topic };
}
```

The snapshot is a copy, fixed for that generation. `read()` is null outside a
notebook-enabled run, including during a tool module's `ready()` check. If a
`ready()` export is needed, check that `services.notebook.read` exists; do not
require `read()` to return a snapshot at that stage. Keep tools focused on facts or participant selection;
they do not need their own state files, locks, topic catalogues or LLM calls.

## What generation returns

Spoken output keeps its existing shape: `text` for a solo segment, or `lines`
with persona IDs for a discussion. Notebook-enabled output adds a required
`memoryUpdate` field in the **same model call**:

```json
{
  "topic": {
    "value": "Should a biscuit qualify as breakfast?",
    "turn": 1
  },
  "contributions": [
    {
      "turn": 1,
      "contributor": "Pat",
      "summary": "A biscuit counts as breakfast if eaten before the morning bus."
    }
  ]
}
```

This object is the value of `memoryUpdate`, not spoken dialogue. On the first
successful segment, propose a topic and speak its exact wording in the referenced
turn. Once committed, that topic is fixed for the airing. Later updates normally
use `"topic": null`; a repeated proposal must match the committed topic and be
spoken in its referenced turn. Do not choose another topic during the same airing.

Turn numbers are **1-based**. A solo `text` segment is turn 1. For discussions,
use the indexes of the returned `lines` array. Each contribution attaches to the
turn that actually reads or voices it. The contributor can be a participating
persona or a fictional listener explicitly permitted by the prompt. Summarize
what was actually said, without adding a new opinion or purported future speech.

Updates contain only new opinions or substantive points from this segment.
Introductions, repeated questions and invitations are not contributions; use an
empty array when no new points are voiced. Never copy notebook history into an
update. When a presenter reads another person's contribution, reference the turn
that reads it, rather than an introduction or subsequent reaction.

Generation schemas bound solo references to turn 1 and planned discussions to
the planned turn count. Flexible discussions also validate references against
the actual returned lines during response parsing. These checks reject missing
turns before staging or TTS. They cannot establish that a structurally valid
summary faithfully describes its referenced speech; that still depends on the
generation instructions and review of actual output.

Limits: topic 500 characters; contributor label 100; summary 240; at most 16 new
contributions per segment. Empty contribution arrays are valid. A first topic
must be introduced before any new contributions. An explicit stand-down can
return `memoryUpdate: null`; an aired segment requires a valid update object.
Invalid updates prevent TTS/playback rather than being silently repaired.

Useful prompt wording for a recurring discussion:

> Keep the notebook's topic throughout this airing. When it is empty, introduce
> one fresh topic using its exact wording. Build on the conversation so far
> without repeating earlier contributions. Return the topic and concise new
> contribution summaries in memoryUpdate, attached to the turns that speak
> them. Never read the bookkeeping fields aloud.

The controller already supplies the memory schema and instructions. Do not ask
for a second summary call. Topic selection and new dialogue stay LLM-led.

## Scope and delivery

The notebook key combines the skill ID and the existing scheduled/takeover
occurrence identity. Restarts, skill rescans and prompt edits preserve committed
memory. The next occurrence starts empty. Returning to the same interrupted
scheduled occurrence resumes its notebook. A takeover is a separate occurrence.
Default programming without a scheduled show/takeover has no show notebook and
stands down. Scope follows the existing occurrence resolver, so changing a
scheduled occurrence's start can create a new scope.

Only one notebook writer per skill/airing may generate or wait for air. Its
lease expires after 20 minutes or at the occurrence's end, whichever comes first.
Generation failures and cancelled unpublished speech release it. No notebook
state commits merely because generation or TTS succeeded.

Every turn has a persisted stable voice ID, proposed updates and rendered WAV
path before publication. The existing mixer voice-start marker commits its
updates atomically and idempotently. A partially aired discussion commits only
its confirmed turns. Here, **aired means that the mixer confirmed the clip
started**, not that the final word was heard or that a delayed listener finished it.
Mixer voice markers must be available for notebook generation.

On controller restart, the notebook reconciles the last marker, waits briefly
for an in-flight published clip and restores remaining rendered, unpublished
turns through the existing next-track speech slot. Missing/incomplete rendered
exchanges are cancelled. A published handoff without proof of air is never
replayed: uncertainty must not manufacture a second contribution. Its pending
receipt can still commit if a late marker arrives; otherwise the lease expires.
Simultaneous mixer/controller loss therefore cannot promise exactly-once audio.
No independent talk cron is introduced.

Publication checks the original occurrence and run ID. Old queued speech cannot
write to a new airing's notebook. The latest 24 contribution summaries are
retained along with the fixed topic and cumulative contribution count. Up to 16
airing entries are kept; cleanup protects pending entries.

## Operator inspection and reset

Admin-authenticated routes:

- `GET /dj/skills/<skill>/notebook` returns `{notebook, pending}` for the current
  airing. Pending details contain the run ID, expiry and turn statuses, not WAV
  contents. Read it after a segment reaches air to inspect actual commits.
- `POST /dj/skills/<skill>/notebook/reset` with
  `{"expectedOccurrenceId":"<notebook.occurrence.id>","expectedRevision":3}`
  resets that current airing, cancelling uncommitted work. A changed airing or
  revision is rejected. Already published audio cannot be recalled.

Corrupt/unsupported files fail closed with an operator-visible error. Restore a
valid file, or explicitly post `{"expectedRevision":0,"discardCorrupt":true}`
to reset a corrupt notebook. The original file is moved aside with a
`.corrupt-<timestamp>` suffix. This recovery resets the whole corrupt file;
normal revision-checked reset affects only the current airing.

No notebook reset happens on skill save or Rescan. There is no notebook UI yet.

## Implementation status

Controller implementation includes solo and co-hosted skills, normal manual and
autonomous selection, tool reads, per-turn air commits, restart recovery and
station backup restore. Delivery uses existing voice markers and requires only
a controller rebuild; there is no Liquidsoap change. Runtime behaviour must be
exercised on the station after installing the update. No live broadcasts are
triggered by development checks.

## Pre-review regression checks

Run `npm --prefix controller test -- skill-notebook` for seventeen isolated
checks of file-backed memory, per-turn receipts, fixed topics, bounded history,
skill/airing isolation, leases, cancellation, reset and corrupt-file handling.
The suite also reads committed memory in a fresh process and exercises recovery
of rendered, unaired turns with their original receipt IDs. A handed-off turn
with unknown air time remains pending until a later receipt or lease expiry;
it does not immediately permit duplicate generation.

Run `npm --prefix controller test -- skill-special-guest` for eleven checks of
prompt directives, full-name/ID lookup, ambiguous/missing personas, tool-selected
casts, participant limits, speaker validation and a five-turn numbered exchange.
Both suites use synthetic
personas and injected model results; they do not call the station LLM, render
speech or broadcast audio. These checks establish structural and persistence
behaviour, not whether a generated summary truthfully describes its speech.
