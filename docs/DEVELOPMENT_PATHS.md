# Current development paths

This note records the current fork-level development decision. It separates
two active paths from earlier Producer Routing and FunctionGemma experiments,
which are preserved but **on hold**. It is not a production architecture change
or a deployment instruction.

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
appropriate base. First map the existing Producer Routing work read-only and
extract only prompt-related changes; do not recreate work merely because it is
currently interleaved with routing experiments.

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

## Work on hold

### Producer Routing

The existing Producer Routing work is on hold. Preserve its worktrees, source,
handoffs, and evidence for future review; do not continue it by default or fold
it into either active path. If resumed, start with the Producer Routing handover
identified in [STARTHERE.md](../STARTHERE.md).

### FunctionGemma

The existing FunctionGemma training, evaluation, and integration work is on
hold. Do not spend further training or inference allowance on it for these
paths. Keep its experiment ledger and evidence intact; it may be revisited only
if native shortlisting demonstrates a concrete gap that a bounded native policy
cannot cover.
