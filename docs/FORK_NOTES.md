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

## Local admin stats diagnostics

`codex/debug-features` carries a deliberately local-only Admin → Stats
diagnostics panel. It sits between **LLM usage** and **Voice / TTS usage** and
keeps two in-memory, since-controller-boot windows of 1,000 events:

- **Tool calls** lists every picker tool plus every currently loaded skill data
  tool, including zero-use rows. It includes calls made before a failed LLM
  attempt and shows a separate failed count. Rows sort by call count, then
  name.
- **Track transitions** lists the twelve combinations that can actually be
  armed on-air (normal; six individual effects; and the four entry-effect plus
  automatic-washout pairs). Rows also sort by count, then name.

The controller records the final, validated transition flags rather than the
model's original request. The `done` structured-output helper is intentionally
excluded from the tool list.

For the local live-test station at `/home/jaz666/Docker/subwave`, the
production Compose stack serves built controller and web images. After applying
source changes, rebuild both services with:

```bash
sudo docker compose -f docker-compose.yml up -d --build controller web
```

### Live station footer workflow

Before every live-station update, review `SUBWAVE_BUILD_BRANCHES` in the
Compose build environment. Keep it aligned with the branches currently merged
into the station (for example: `Debug Code|Producer Routing|Show Boundary
Handoffs`). If the branch set changes, update the value before rebuilding the
web image. The footer values are baked into the web client at build time, so a
controller-only rebuild cannot update them.

For a live update, merge the intended feature branches into
`live/producer-routing`, update `SUBWAVE_BUILD_BRANCHES` if needed, and rebuild
`controller` and `web` together.

The runtime checkout can contain unrelated live-test work; keep this feature's
commit on its own branch and do not include it in an upstream PR unless that
policy changes.
