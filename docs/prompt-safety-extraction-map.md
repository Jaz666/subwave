# Prompt safety and Verified Facts: extraction map

This branch starts from upstream `develop` and deliberately does not carry the Producer Routing or FunctionGemma architecture forward. This map identifies reusable evidence and the boundaries for a prompt-safety PR.

## Scope

The main DJ LLM remains responsible for listener-facing track links. This work improves prompt inputs and protects the handoff to TTS. It does not add a Producer model, FunctionGemma, segment/skill routing, or native shortlisting.

```text
Internal instructions + verified context + selected track
                    ↓
              main DJ LLM
                    ↓
        structured listener-facing speech
                    ↓
             validation / TTS only
```

## Source inventory

The reference range is the work after merge-base `65c840ee` on `codex/producer-routing`. It is evidence, not a cherry-pick queue.

| Source | Classification | Reuse decision |
| --- | --- | --- |
| `308a1823` / `443aeae7` — `docs/internals/verifiedContext.md` | Design evidence | Reuse the distinction between verified facts, editorial hooks and audio observations. Turn it into a concise runtime contract; do not depend on a Producer handoff. |
| `a5397626` — `controller/src/llm/internal/prompts/sleeve-notes.ts` | Prompt grounding | Reimplement/adapt. Its track album, resolved era year and station-play count are deterministic sources available after selection. |
| `7d62be95` — label sleeve notes as verified facts | Prompt grounding | Reuse the clear “Verified facts” label and explicit assertion boundary. |
| `22b41387` — vary verified sleeve notes | Prompt grounding | Consider after the basic contract works. A sparse selected fact set is preferable to a metadata dump; selection must remain deterministic/testable. |
| `a5397626` — `personaLinkPrompt` / `generatePersonaLink` | Mixed | Do not transplant. It is attached to the Producer/Persona Stage C path, new LLM kinds and Producer wiring. Rebuild the useful boundary in vanilla’s main-DJ link path. |
| `5ad7ba71` — persona handover prompts | Mixed | Do not include in the first PR. It improves prompt isolation but changes programme/handoff behaviour and can be assessed later as a separate slice. |
| `8cff67d4`, `3c3284ec`, `3cb8fe12` — evidence-backed segments | Segment/skill routing | On hold. These changes live in the skill-agent/Producer path and are outside this PR. |
| `a5397626`, `bd10ed15`, `55c22368` — Musical Leanings schema/UI | Track selection | Exclude. It is an editorial selection input, not prompt safety or Verified Facts. |
| Producer settings, agent factory, provider legs, contracts, benchmarks and routing tests | Producer Routing / FunctionGemma | Exclude. |

## First implementation slice

1. Identify vanilla’s single listener-facing link generation and its TTS enqueue point.
2. Add a small deterministic verified-facts builder beside the existing prompt code. Start with title/artist, album, resolved era year and station-play count only when available and trustworthy.
3. Feed a bounded selection to the main DJ prompt under `Verified facts`. State that no further externally verifiable claims may be inferred.
4. Keep prompt instructions and facts separate from the model’s speech field. Only validated listener-facing text may be queued to TTS.
5. Add focused tests for fact construction, absent/untrusted data, prompt shape, and the invariant that control-plane material is not passed as speech.

## Acceptance criteria

- The normal main-DJ link path receives a small verified-fact packet without a Producer or FunctionGemma call.
- Facts derive from existing controller/library state and include no model reasoning or tool transcript.
- TTS receives only the dedicated listener-facing output after validation.
- Existing behaviour remains when no verified facts are available.

## Deferred decisions

- Exact structured response schema and the output validator’s rejection or repair posture.
- Whether handovers and skill segments should adopt the same boundary later.
- Additional facts such as artist history, selection intent, audio observations, weather or programme context; each needs an explicit source and assertion policy.
- How the prompt-only PR will be extracted from any already-completed source changes; this branch favours a clean vanilla implementation.
