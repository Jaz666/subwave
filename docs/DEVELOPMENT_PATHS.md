# Current development paths

This note records the current fork-level development decision. It separates
two active paths from earlier Producer Routing and FunctionGemma experiments,
which are now **retired and archived**. It is not a production architecture
change or a deployment instruction.

## Start here

For either path, begin with [STARTHERE.md](../STARTHERE.md), then read
[CLAUDE.md](../CLAUDE.md) and the scoped controller guidance in
[controller/CLAUDE.md](../controller/CLAUDE.md). For music-selection changes,
also read [music internals](internals/music.md). Follow the session procedure in
[HANDOFF.md](../HANDOFF.md).

Work from a named worktree under `/home/jaz666/codex/`; do not use
`/home/jaz666/Docker/subwave` as the primary development checkout.

## Path 1: DJ prompt boundary and grounding

**Purpose:** prevent internal prompt/context material leaking into listener
speech while giving the main DJ LLM useful, trustworthy material.

This path is expected to be the nearer-term PR candidate. It includes prompt
improvements, Verified Facts, Sleeve Notes, and a clear separation between
internal context and TTS-safe speech. It does **not** require a second LLM or
Producer-routing architecture.

Target boundary:

```text
Internal instructions + verified context + selected track
                    ↓
              main DJ LLM
                    ↓
        structured listener-facing speech
                    ↓
             validation / TTS only
```

Only the validated listener-facing speech may be handed to TTS. Prompt
instructions, tool details, routing state, and other control-plane material
must not be treated as speakable output.

When implementation begins, create a dedicated prompt-boundary branch from the
appropriate base. Use the retirement record for the portable prompt-boundary
lessons; do not extract or recreate the retired Producer Routing implementation.

## Path 2: native track shortlisting

**Purpose:** make candidate retrieval and bounded fallback deterministic, fast,
and observable, leaving the final editorial track choice with the main DJ LLM.

This is a clean implementation path from vanilla behaviour, rather than an
extraction of the Producer Routing / FunctionGemma implementation. Begin on a
dedicated branch from the chosen vanilla/develop base. Existing experiments are
reference material for requirements, failure cases, tool contracts, guards, and
evaluation scenarios only.

Target flow:

```text
Show and broadcast state + current track + recent history
                    ↓
      native search, ranking and bounded fallback policy
                    ↓
       ranked, de-duplicated shortlist with provenance
                    ↓
      main DJ LLM selects the final track and writes speech
```

The native shortlist service belongs in the controller initially. It should use
existing music/history/analysis interfaces, have a narrow transport-neutral
contract, and be extracted into a separate service only if measured resource or
deployment needs justify it.

The UI should expose the operation under a distinct user-facing name, rather
than as an LLM call, and record its latency. Record shortlist size before and
after de-duplication, selected strategy/fallback level, applied filters and
guards, search sources, and final outcome as well as total latency.

The FunctionGemma-specific LLM calls return to vanilla behaviour on this path.
The main DJ LLM remains the only LLM involved in final candidate selection.

## Retired work

### Producer Routing

Producer Routing is retired. Its useful safety, verified-context and editorial
influence lessons are captured in
[`retired-producer-routing-functiongemma.md`](internals/retired-producer-routing-functiongemma.md).
Do not continue it, restore its worktrees, or fold its implementation into an
active path.

### FunctionGemma

FunctionGemma training, evaluation and integration are retired. Do not spend
training or inference allowance on them, even if native shortlisting exposes a
future gap. The preserved findings and dated archive refs are listed in
[`retired-producer-routing-functiongemma.md`](internals/retired-producer-routing-functiongemma.md).
