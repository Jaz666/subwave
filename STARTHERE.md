# Start here — Jaz666's SUB/WAVE fork

Read this before beginning work in this fork. It is intentionally a short
orientation and routing document, not a substitute for the scoped engineering
guides. Load only the section relevant to the task that follows.

## What SUB/WAVE is

SUB/WAVE is a self-hosted internet radio station: one shared Icecast broadcast,
a music library supplied by Navidrome, and a controller that schedules tracks,
requests, speech, personas and station behaviour. The upstream project is
maintained at `perminder-klair/subwave`; this fork is the place for Jaz666's
experimental and proposed work before it is ready for an upstream PR.

The basic runtime is:

```text
Navidrome/library → Controller → shared state files → Liquidsoap/Icecast → listeners
                         ↕
                    Web, admin, native app, MCP, LLM/TTS/analyzer services
```

For the detailed code and runtime constraints, read [`CLAUDE.md`](CLAUDE.md)
and then its one scoped reference for the area being changed.

For the consistent start/end-of-session procedure, read [`HANDOFF.md`](HANDOFF.md).

## Working-tree and branch discipline

| Place | Purpose | Rule |
| --- | --- | --- |
| `/home/jaz666/codex/` | Development worktrees | Make source and documentation changes here, on a named branch. |
| `/home/jaz666/Docker/subwave` | Test-station integration checkout | Do not use as the primary development worktree. Merge or copy an approved candidate here only when it needs station testing. |
| `jaz666/develop` | Clean-ish fork mirror of upstream `develop` | Preserve as the rebase/PR comparison point. Sync deliberately; do not use it for experiments. |
| `test-station/producer-routing-v21` | Current published station snapshot | Records the non-secret source, fixtures and documentation currently exercised by the test station. Local `.env`, databases and models are intentionally absent. |

`origin` is the upstream repository (`perminder-klair/subwave`) and `jaz666`
is this fork. Before a rebase, merge, deployment or PR, fetch both and compare
against the intended base. Do not force-push a shared branch, place secrets in
Git, or treat a local runtime model/checkpoint as source.

## Choose one briefing, not the whole project

| If the task is about… | Start with | Load only if needed |
| --- | --- | --- |
| General controller, broadcast, web, app or deployment work | [`CLAUDE.md`](CLAUDE.md) | The matching scoped `CLAUDE.md` and one `docs/internals/` guide. |
| Music selection, moods, requests, genre rules or library data | `docs/internals/music.md` | `docs/internals/track-selection.md` on the test-station branch for the producer path. |
| Broadcast timing, queue, transitions, speech or beds | `docs/internals/broadcast.md` | `liquidsoap/CLAUDE.md` before editing `radio.liq`. |
| Schemas, settings or API data shapes | `docs/internals/schemas.md` | `controller/CLAUDE.md` or `web/CLAUDE.md` as appropriate. |
| DJ prompt boundary and grounding | [`docs/DEVELOPMENT_PATHS.md`](docs/DEVELOPMENT_PATHS.md) | `controller/CLAUDE.md`; use the existing Producer Routing work only as a read-only extraction source. |
| Native track shortlisting | [`docs/DEVELOPMENT_PATHS.md`](docs/DEVELOPMENT_PATHS.md) | `docs/internals/music.md`; begin from a clean vanilla/develop base. |
| Producer Routing project (on hold) | The test-station branch's `docs/internals/producer-routing-handover.md` | `track-selection.md`; resume only when explicitly requested. |
| FunctionGemma training/evaluation (on hold) | The FunctionGemma worktree's `docs/internals/functiongemma-experiment-ledger.md` | `functiongemma-training-workflow.md` and V20/V21 evidence only when explicitly resumed. |
| Skills, persona behaviour or programmes | `docs/custom-skills.md` plus `controller/CLAUDE.md` | The relevant programme/persona branch handover, if the task names it. |
| Station deployment or live test | This file, then the test-station branch handover | The actual local `.env` and service status are operational facts; never commit them. |

A fresh chat should state its selected scope in one sentence. It should not
load unrelated histories merely because they exist.

## Fork-specific development directions

### Active paths

The current active work is documented in [`docs/DEVELOPMENT_PATHS.md`](docs/DEVELOPMENT_PATHS.md):

- **DJ prompt boundary and grounding** — keep prompt improvements, Verified
  Facts, and Sleeve Notes with the main DJ LLM while enforcing a boundary
  between internal context and listener-facing speech.
- **Native track shortlisting** — use controller-native candidate retrieval,
  ranking, de-duplication and bounded fallback, with the main DJ LLM retaining
  final editorial selection.

### Producer Routing — on hold

The proposed split between a grounded, bounded Producer path and a creative
persona model is preserved for future review, but is not active work. Do not
continue it by default or pull it into either active path. The controller
remains the authority for availability, safety, queue state and final
enforcement.

### FunctionGemma — on hold

FunctionGemma's discovery-router experiment, including V21 evidence and the
V13 control/rollback baseline, is preserved but on hold. Do not initiate
further training or inference work unless this project is explicitly resumed.

The critical rule is to evaluate the exact controller transcript: offered tools,
post-tool messages and exhausted-tool removal. A model must call exactly one
offered function and recover safely after an empty result.

### Other work

Skills-v2, persona/programme work, station presentation and diagnostic tooling
have their own branches and may be explored independently. They should not be
pulled into a Producer Routing or FunctionGemma task unless the requested
change genuinely crosses that boundary.

## Minimum safe workflow

1. Confirm the target worktree and branch before editing.
2. Read this file plus the one scoped briefing from the table above.
3. Make the smallest change that solves the stated problem.
4. Run the relevant focused checks; controller changes also need the project
   type-check and applicable test suite.
5. Commit and push the development branch.
6. Only then merge or deploy into `/home/jaz666/Docker/subwave` for station
   testing, documenting the candidate, evidence and rollback route.

## Documentation rules

- Put enduring architecture and project decisions in common documentation.
- Keep experiment-specific evidence with its owning worktree/branch.
- A short handover may point to a decision; it must not become the only source
  of truth for it.
- Update this file when the worktree discipline, active project map or
  top-level fork direction changes.

## Useful supporting references

- [`README.md`](README.md) — product and operator overview.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — component map.
- [`docs/FORK_NOTES.md`](docs/FORK_NOTES.md) — earlier branch audit; historical
  context only, not the current worktree policy.
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — direction and open questions.
