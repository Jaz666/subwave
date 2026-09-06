# Retired Producer Routing and FunctionGemma work

## Decision

On 2026-09-06, the fork retired the experimental Producer Routing and
FunctionGemma development paths. They are not paused work, a runtime option,
or a fallback for the station. Do not resume training, inference, integration,
or deployment work for either path.

The supported path is controller-native shortlisting followed by one main-DJ
editorial choice. The controller owns candidate eligibility, source policy,
rotation, artist protection, repair and final enforcement; the DJ receives a
bounded, grounded shortlist and produces the listener-facing line. Prompt
Safety and Verified Facts keep internal selection material separate from what
listeners hear.

Historical source is retained only in the two dated `archive/` Git refs. It is
for audit and lesson extraction, not a base for new implementation. The large
local model, checkpoint and generated-report workbenches are intentionally
removed from the active development estate after their durable findings are
recorded here.

## Findings worth retaining

### Boundaries that now apply to the native path

- Surface candidates and enforce all hard constraints in the controller before
  an LLM sees them. A model must only select an exact ID from that grounded
  set; it must not create a track, an availability claim, a tool result or a
  music fact.
- Treat final selection and listener-facing speech as separate concerns. The
  listener-facing reason must name the selected track/artist and the shortlist
  source in natural language, without exposing prompt, routing or tool-loop
  internals.
- Host editorial intent is primary. Guest Musical Leanings may provide a soft,
  explicitly visible tie-breaker only after rotation, requests, safety, show
  rules, availability and host intent have already passed.
- Retain a deterministic repair path: remove an invalid or artist-guarded
  candidate, reapply controller rules, and re-pick only from the remaining
  grounded candidates.

### Lessons from the Producer Routing experiment

- The useful parts were its bounded candidate packet, post-selection verified
  context, Musical Leanings as a weaker guest influence, and a concise
  operator-facing Booth Log reason. These have informed the native
  shortlisting, Prompt Safety and Booth Log work; they do not require a
  separate Producer provider or UI configuration.
- A separate Producer model added material latency without a dependable
  editorial benefit. In the observed live sample, Qwen final commitment
  averaged 28.5 seconds before tool time, while segment calls added further
  delay. This is incompatible with a queue-runway-sensitive radio path.
- Verified facts must be controller-supplied and bounded. Creative speech may
  be subjective, but must not turn a tone instruction into invented music,
  programme, date, weather or station claims.
- Programme planning and spoken delivery are different contracts. Any future
  programme work starts from controller-owned structure and verified inputs,
  not from the retired Producer routing role.

### Lessons from the FunctionGemma experiment

- A small router can only be judged against the exact controller transcript:
  the currently offered tools, post-result message and removal of an exhausted
  tool. The controller must reject every unoffered, malformed, multiple or
  otherwise invalid call before execution.
- FunctionGemma never demonstrated a safe final-selection contract: its V10
  final-selection baseline produced 0 valid commitments from 8 held-out
  fixtures, versus 8/8 for the Qwen baseline. That experiment is closed.
- Later router candidates could pass isolated gates yet fail live-shaped
  routing/recovery through stale availability, lyric-versus-sound confusion or
  malformed recovery arguments. This confirms that native policy and exact
  regression fixtures are the durable asset, not a model checkpoint.
- Keep generated datasets, checkpoints, reports and virtual environments out
  of Git. The retained archive contains source, fixtures and concise findings;
  it deliberately excludes large transient model artifacts.

## Archive and removal policy

- `archive/producer-routing-20260906` retains the historical Producer Routing
  and associated persona/programme/skills experiments.
- `archive/functiongemma-20260906` retains the FunctionGemma training,
  evaluation, live-test and final-selection experiments.
- Retired named branches, remote branches, worktrees and local experiment
  artifacts may be removed only after both archive refs are published and
  verified. Do not recreate a retired branch name for new work.
- `codex/skills-v2` is independent work and is explicitly outside this
  retirement unless it is separately retired.

## Starting future music-selection work

Read [`track-shortlisting.md`](track-shortlisting.md) and the current
[`music.md`](music.md) guidance. Do not read the retired handovers as an
implementation recipe: this note is their portable replacement.
