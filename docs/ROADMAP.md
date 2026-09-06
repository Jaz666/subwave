# Roadmap

This is an onboarding roadmap, not a product commitment. Items are separated between maintainer-confirmed direction, repository-evidenced work, and proposals derived from missing information.

## Maintainer-confirmed direction

- Keep `develop` as the fork's main branch used to run the local Subwave version.
- Treat the two paths in [`docs/DEVELOPMENT_PATHS.md`](DEVELOPMENT_PATHS.md) as
  independent active work: DJ prompt boundary/grounding, and native track
  shortlisting.
- Treat Producer Routing and FunctionGemma as retired. Their portable findings
  and dated archive refs are recorded in
  [`docs/internals/retired-producer-routing-functiongemma.md`](internals/retired-producer-routing-functiongemma.md);
  they are not a continuation or fallback for either active path.
- Continue `codex/skills-v2` as an ongoing architecture change, independently
  of the on-hold routing work.

## Work evidenced by this checkout

- Historical FunctionGemma research, training/evaluation, soak-test,
  producer-routing and live-test artifacts are retained only through the dated
  archive refs; they are not part of the active controller route.
- The repository maintains multiple runtime delivery paths: split Docker services, all-in-one images, optional analyzer/TTS variants, a CLI installer, and native/mobile clients.
- CI maintains lint/typecheck, generated asset/schema/theme consistency checks, multi-architecture image publishing, CLI binary publishing, release automation, and image scanning.
- The controller has a broad set of focused tests covering broadcast policy, queueing, LLM behavior, TTS, analysis, skills, stations, settings, and schemas.

## Proposed next steps

These are proposals, not claims of an existing maintainer plan:

1. Define the native shortlisting service contract, including its structured
   inputs, candidate provenance, de-duplication and bounded fallback policy.
2. Continue skills-v2 design with explicit compatibility notes for existing skills and state.
3. Define an end-to-end smoke environment covering Compose startup, controller health, stream output, web onboarding, and at least one representative client.
4. Document state backup, restore, SQLite migration, and rollback expectations for upgrades.

## Open questions

The repository and current project context do not establish:

- The compatibility and migration policy for skills-v2.
- The supported CPU/GPU hardware matrix for the split architecture.
- The deployment environments and provider combinations that must be supported by the fork.
