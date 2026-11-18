# Fork notes

This file records Git evidence plus maintainer-provided fork context. Remote refs are local cached refs and may become stale.

## Remotes and collaboration boundary

The local `.git/config` contains:

- `origin`: `https://github.com/perminder-klair/subwave.git`
- `jaz666`: `https://github.com/Jaz666/subwave.git`

The upstream project at `https://github.com/perminder-klair/subwave` is the destination for pull requests intended to be shared with the wider Subwave community. The fork's `develop` branch is the main branch used to run the local version.

The local runtime checkout is `/home/jaz666/Docker/subwave`. Alternate branches should be placed in separate sibling folders/worktrees so the runtime checkout remains stable.

## Current checkout evidence

- `HEAD`: `b4571e4ba755d3c0cff7a0e2c77cea431a6d721c`
- Current commit: `merge: combine router v3 with producer and skills live test`
- Local upstream ref: `origin/develop` at `6adaa6772fa8b0a2413d024db79b1c0669d86e2d`
- Local fork ref: `jaz666/develop` at `c0d8d613a4b29adc659d8ca2bedc0a98163f3841`
- Local comparison `origin/develop...HEAD`: 0 behind, 322 ahead

The comparison above is a statement about refs available in this checkout. It is not a definitive count of all fork-only commits until remotes are refreshed and the intended base is confirmed.

## Active development lines

Maintainer-provided context:

- `codex/producer-routing` has been the primary focus. It splits the all-in-one LLM approach into a smaller CPU Producer model and a more creative GPU model for DJ personas.
- Qwen3-4B-Q4_K_M.gguf proved successful as the smaller Producer model.
- The producer/persona split is intended to be offered first to the upstream lead developer as an optional opt-in change.
- `codex/skills-v2` is an ongoing architecture change.
- FunctionGemma is an ongoing experiment in training Subwave tool-function handling. The longer-term question is whether it can also handle track-selection decisions; it is not yet a supported default.

The current branch contains FunctionGemma research, router versions, evaluation, soak-test, producer/skills integration, and live-test commits. This audit does not establish whether the current live-test branch is intended for merge, long-term retention, or experimental deployment.

## Upstream relationship

The remote naming and history show that this checkout was configured with the original project as `origin` and the `Jaz666/subwave` fork as `jaz666`. The local branch graph also contains merges from upstream development history. No claim is made here about GitHub fork metadata, contribution policy, or whether all local branches have been pushed.

## Follow-up checks

- Confirm the upstream PR base branch at the time of opening a PR.
- Refresh both remotes before making release or divergence decisions.
- Keep experimental changes in separate branch worktrees.
- Document opt-in configuration, fallback behavior, evaluation results, and rollback steps before proposing producer/persona changes upstream.
