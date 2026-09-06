# Roadmap

This is an onboarding roadmap, not a product commitment. Items are separated between maintainer-confirmed direction, repository-evidenced work, and proposals derived from missing information.

## Maintainer-confirmed direction

- Keep `develop` as the fork's main branch used to run the local Subwave version.
- Treat the two paths in [`docs/DEVELOPMENT_PATHS.md`](DEVELOPMENT_PATHS.md) as
  independent active work: DJ prompt boundary/grounding, and native track
  shortlisting.
- Keep Producer Routing and FunctionGemma work preserved but on hold. They are
  not the default continuation of either active path.
- Continue `codex/skills-v2` as an ongoing architecture change, independently
  of the on-hold routing work.

## Work evidenced by this checkout

- FunctionGemma has research, training/evaluation, soak-test, producer-routing, and live-test artifacts under `controller/scripts/functiongemma/`, `controller/src/llm/internal/producer/`, and related tests.
- The repository maintains multiple runtime delivery paths: split Docker services, all-in-one images, optional analyzer/TTS variants, a CLI installer, and native/mobile clients.
- CI maintains lint/typecheck, generated asset/schema/theme consistency checks, multi-architecture image publishing, CLI binary publishing, release automation, and image scanning.
- The controller has a broad set of focused tests covering broadcast policy, queueing, LLM behavior, TTS, analysis, skills, stations, settings, and schemas.

## Proposed next steps

These are proposals, not claims of an existing maintainer plan:

1. Make a read-only extraction map for the prompt-boundary PR: classify existing
   Producer Routing changes as prompt, shortlisting, routing, or mixed before
   creating its branch.
2. Define the native shortlisting service contract, including its structured
   inputs, candidate provenance, de-duplication and bounded fallback policy.
3. Continue skills-v2 design with explicit compatibility notes for existing skills and state.
4. Define an end-to-end smoke environment covering Compose startup, controller health, stream output, web onboarding, and at least one representative client.
5. Document state backup, restore, SQLite migration, and rollback expectations for upgrades.

## Open questions

The repository and current project context do not establish:

- Whether the on-hold Producer Routing work will be resumed, and on what
  evidence.
- Whether native shortlisting reveals a concrete retrieval gap that warrants
  revisiting FunctionGemma.
- The compatibility and migration policy for skills-v2.
- The supported CPU/GPU hardware matrix for the split architecture.
- The deployment environments and provider combinations that must be supported by the fork.
