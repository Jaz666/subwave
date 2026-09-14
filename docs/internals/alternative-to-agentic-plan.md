# Optional alternatives to Agentic Tools: implementation plan

## Purpose

SUB/WAVE will continue to support its existing Agentic Tools path. This work
adds bounded, non-agentic alternatives for installations that use smaller or
creative local models, have less responsive hardware, or want to reduce cloud
LLM usage.

This is not a claim that one route makes better musical decisions. Both routes
share the same station policy and are intended to preserve musical variety and
flow. The choice is how the DJ reaches a suitable decision.

## Scope and dependencies

The integration branch is assembled from the working implementations submitted
in the Track Shortlisting, deterministic Segments & Skills, and direct request
resolution PRs. It is rebased onto current `develop`; feature branches are not
merged wholesale.

Do not bring Musical Leanings across from Track Shortlisting. It has its own
standalone PR and shared helper, which both track-selection paths will use once
it is available. Do not bring the Discovery Bench or fork-only comparison
material across in this first pass.

## User-facing choices

### Track selection

DJ Behaviour will offer a `Track selection` choice:

- **Agentic Tools** — the DJ explores the library through its tools before
  choosing a track. This can suit responsive cloud models and capable local
  hardware.
- **Track Shortlist** — the controller builds a varied set of eligible tracks,
  then the DJ selects from that shortlist. It is bounded and tool-free, making
  it a good first choice for local models or hardware where agent turns can run
  out of time, and for cloud installations reducing LLM work.

Existing stations retain Agentic Tools after upgrade. Switching mode preserves
the inactive mode's values. The mode changes the decision route, not station
music policy or the available variety.

Only controls relevant to the selected route are displayed:

- Agentic Tools: discovery budget and picker deadline.
- Track Shortlist: shortlist passes.

The picker deadline does not apply to the current shortlist implementation and
must not be presented as though it does.

### Requests

Request matching is independent from Track selection:

- **Direct matching** is fast and tool-free. It covers the majority of
  straightforward artist, title, genre and simple-mood requests.
- **Agent-assisted matching** is an explicit opt-in for detailed or compound
  requests involving several musical constraints. It requires a tool-capable
  model and may take longer or use more LLM resources.

Track Shortlist remains tool-free in either case. Enabling Agent-assisted
matching affects listener requests only; it never becomes a hidden picker
fallback.

### Segments and Skills

The deterministic/direct implementation becomes an alternative runtime, not
the only runtime. Agentic runtime remains selectable where an operator wants
it. Segment and skill variety should come from briefs, scheduling, cooldowns,
available evidence and delivery, rather than requiring open-ended tool use at
runtime.

## Implementation rules

1. Both track-selection implementations return one common result: selected
   track, verified reason, timing/provenance and a safe failure result. Queue,
   Booth and policy code must not depend on the route.
2. Eligibility stays controller-owned and shared: locks, show constraints,
   recency, artist and album spacing, requests, duration rules and Musical
   Leanings apply before either route queues a track.
3. The shortlist route contains no tool loop, tool schema, hidden agent
   fallback or implicit cloud call. It may use a plain structured picker model.
4. A displayed selection reason must correspond to the exact selected track.
   Invalid or mismatched model reasoning is discarded or replaced by a
   verified generic reason before it reaches DJ Booth.
5. Each mode has explicit, safe failure handling. Shortlist failures must not
   accidentally switch into Agentic Tools.

## Observability and diagnostics

Record the selection route, shortlist passes and size, selected track ID,
reason validation state, timing and fallback outcome. This supports support
diagnosis and comparison without relying on inferred behaviour.

The dashboard uses different timing semantics by route:

- Agentic Tools retains its configured picker deadline.
- Track Shortlist shows end-to-end selection latency and an adaptive warning
  threshold based on recent primary shortlist picks. Corrective repicks are not
  included in that baseline. Until enough observations exist, use a
  conservative warning threshold.

The Discovery Bench is an optional maintainer-only facility. Set
`SUBWAVE_DISCOVERY_BENCH=true` in both the controller and web environments to
enable its direct `/admin/discovery` URL. It is absent from normal navigation
and its controller endpoints return 404 when disabled. It uses live station
settings rather than fixed three-pass assumptions.

## Verification

Test both track routes against the same policy scenarios: recency, show limits,
locks, requests, voice policy and Musical Leanings. Add mode-specific coverage
for invalid shortlist IDs, empty shortlists, timeouts, unavailable models and
verified selection reasons, including the regression where the reason named a
different track from the one queued.

Test direct and Agent-assisted request matching separately, including graceful
direct handling of compound requests it cannot fully evidence.

## Delivery order

1. Bring the current code from the three submitted PRs into this integration
   branch while excluding duplicated Musical Leanings and debug-only material.
2. Convert direct-only replacements into explicit alternatives to the existing
   Agentic runtimes.
3. Add the shared selection contracts, settings, observability and tests.
4. Reintroduce the gated Discovery Bench after the production paths are stable.
5. Rebase on current upstream and prepare a focused PR once Musical Leanings
   has landed or is otherwise available as the single shared dependency.
