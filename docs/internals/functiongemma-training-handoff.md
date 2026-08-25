# FunctionGemma training handoff

`codex/functiongemma-training` is the durable home for FunctionGemma
evaluation and training work. It starts from the consolidated Producer/Persona
implementation, while keeping experimental training artifacts outside Git.

Read [`functiongemma-research.md`](functiongemma-research.md) first. It is the
chronological record of router training, failures and the current live-router
result. This document defines the next experiment and the restart contract.

## Local artifact archive

Do not delete or commit the artifact workbench at:

```text
/home/jaz666/codex/subwave-functiongemma/controller/scripts/functiongemma/
```

It contains the generated datasets, frozen validation sets, selected
checkpoints, GGUF conversion sources, optimizer/RNG state, predictions, CPU
reports, soak reports and training logs for router v1--v4. The adjacent
`.functiongemma-venv` is reproducible but may be retained for convenience.

Before moving that archive, record checksums for datasets, `best` checkpoints,
GGUFs and evaluation reports. Checkpoints, optimizer state, virtual
environments and generated reports remain untracked artifacts; only source,
fixtures, generators, evaluator code and concise handoffs belong in Git.

## Next experiment: final candidate selection

FunctionGemma has demonstrated bounded tool routing. The next question is
different: can it make the final editorial choice from a fixed, grounded
candidate set?

The experiment must have this narrow contract:

1. The existing discovery path supplies a candidate set. FunctionGemma receives
   no discovery tools and cannot introduce an ID that is absent from that set.
2. It returns an exact candidate ID and an allowed transition only. It never
   writes listener-facing text, facts, rationale for broadcast, or Persona
   prompts.
3. The configured Producer remains the comparison baseline and the live final
   selector. FunctionGemma has no live final-pick authority until it clears the
   gates below.
4. Host editorial influence remains primary. A guest Music Leaning is an
   occasional secondary tie-breaker only; it must never displace show rules,
   rotation, safety, requests, availability or the host's influence.

## Evaluation before training

Extend the frozen evaluation suite with candidate-commit scenarios rather than
turning on a live selection switch. Include at least:

- exact-ID grounding and malformed-ID rejection;
- same-artist and recent-rotation traps;
- energy/flow continuity and deliberate contrast;
- show filters and pinned-playlist eligibility;
- host soft influence versus a weaker guest nudge;
- several defensible choices, judged by blinded listening rather than a single
  brittle golden song.

Score protocol, grounding, editorial judgement, latency and recovery
separately. Router success does not count as selection success. Compare every
run with the configured Producer over the identical candidate sets and retain
predictions plus reports in the artifact archive.

## Promotion gates

No live final-selection experiment until the candidate selector has:

- 100% grounded candidate IDs and valid transition values;
- no regression in router protocol, recovery or bounded-tool behaviour;
- no avoidable same-artist, rotation or hard-flow failures;
- non-inferior blinded editorial judgement versus the configured Producer;
- CPU latency that fits the available queue runway under concurrent Persona and
  TTS load.

Any future Subwave tool call follows the existing router workflow: add a tool
contract, held-out fixture and acceptance tests first; add a training family
only if evaluation shows that the trained router needs it.
