# Producer Routing handover

> **2026-08-25 current-status note:** this is the earlier research handover.
> Read `producer-routing-simplification-handoff.md` first for the current live
> architecture. In particular, Qwen segment approval has been removed: skills
> now use fixed-vocabulary FunctionGemma or controller dispatch, controller
> evidence policy, then Creative Persona delivery. The only remaining Qwen
> work is track commitment/fallback/repair and `generateProgrammePlan`.


## Current state

Producer Routing separates track selection from on-air delivery. The final
selector receives grounded candidates and compact operational constraints;
the Persona receives a post-selection packet with verified facts, its own
identity and short negative memory. FunctionGemma's discovery/router contract
remains unchanged.

`musicLean` is an optional Persona field exposed as **Musical Leanings**. It
travels to the Producer as structured `editorialInfluence.musicLeanings`, only
to break ties between otherwise suitable candidates. It never overrides
station rotation, requests, show policy, safety, eligibility or transition
requirements.

Sleeve Notes are built after selection. The current safe sources are album,
resolved release year and prior station play count. A Persona link receives a
random single note from the available verified notes, not a metadata list, so
release years do not become a repeated on-air habit. The packet labels them
**Verified facts (including Sleeve Notes)** and explicitly bans inferred music
history.

## Follow-ups from the first live test

1. When Producer Routing is enabled, a pool/artist-guard fallback should keep
   `pickNextTrack` for selection but use `generatePersonaLink` for delivery.
   Vanilla stations must retain the established `generateLink` path unchanged.

2. Keep the Producer's Booth Log `reason`. It is useful operator-facing
   context, but guide it toward one short, complete sentence. Do not remove it
   from the FunctionGemma result merely to simplify the contract.

3. Add a non-aired speech-log origin such as `producer-persona-link` versus
   `pool-legacy-link`. `TYPE: link` currently combines both paths, which makes
   good/bad training examples hard to attribute.

4. Use live examples to train the creative model on grounded speech. Current
   failure cases include invented music-history claims, invented programme/date
   context and invalid production-style tags. These are delivery-model issues,
   not FunctionGemma selection failures.

## Guardrails

- Do not add creative briefing or Sleeve Notes work to FunctionGemma.
- Keep context assembly post-selection, deterministic except for the bounded
  fact sampler.
- Only supplied verified facts may be stated as fact; subjective reactions are
  allowed but must not be dressed up as history or metadata.
