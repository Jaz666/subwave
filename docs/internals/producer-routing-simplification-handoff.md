# Producer-routing simplification handoff

## Purpose

This is the restart document for simplifying the experimental
Producer/Persona architecture before it is presented upstream. It supersedes
the temporary three-party deployment story:

```text
FunctionGemma router -> configured Qwen Producer -> Creative Persona
```

The intended product architecture is:

```text
Built-in FunctionGemma -> configured Creative model
```

FunctionGemma owns bounded, structured backstage operations. The Creative
model owns every listener-facing line and any genuinely creative interpretation.
There must be no separate Qwen/"Producer model" configuration, provider,
middle-layer fallback or operator decision.

## Branch and artifact state

- `codex/producer-routing` is the unified implementation branch. The retired
  `codex/functiongemma-live-test` and `codex/functiongemma-v3-live-test`
  branches are historical only.
- `codex/functiongemma-training` contains the restart contract for future
  FunctionGemma work and the first final-selection experiment.
- The large local artifact workbench must be retained outside Git at
  `/home/jaz666/codex/subwave-functiongemma/controller/scripts/functiongemma/`.
  It contains datasets, validation fixtures, checkpoints, conversion sources,
  optimizer/RNG state, predictions, CPU/soak reports and logs. See
  [`functiongemma-training-handoff.md`](functiongemma-training-handoff.md).
- [`functiongemma-research.md`](functiongemma-research.md) is the chronological
  research record. Its 2026-08-24 handoff says the next distinct experiment is
  `djProducerSelect`: final choice from a fixed surfaced candidate set.

## Non-negotiable boundaries

1. FunctionGemma never writes listener-facing prose, Sleeve Notes, Persona
   prompts, music facts or explanations for broadcast.
2. The Creative model never calls tools and never invents facts. It receives a
   compact verified-context packet plus a bounded operational result where one
   is needed.
3. A model may only choose an exact track ID from a controller-supplied,
   grounded candidate set. It may not manufacture a track, tool result or music
   fact.
4. Host editorial influence remains primary. Guest Music Leanings are optional,
   weaker tie-breakers and never override requests, rotation, safety, show
   constraints, availability or the host.
5. The existing non-split/legacy experience remains compatible while the
   upstream migration is staged. Removing Qwen must not make an unavailable
   built-in model produce dead air.

## Current implementation: what is temporary

The following Qwen-backed `role: 'producer'` work is transitional and must be
classified, replaced or removed:

| Current operation | Current temporary implementation | Target investigation |
| --- | --- | --- |
| Discovery routing | FunctionGemma already selects one tool and validated arguments, with bounded recovery | Keep; package as built-in |
| Track commitment | Qwen `djProducerSelect` / `djProducerPick` chooses grounded ID and transition | Evaluate FunctionGemma candidate commitment before replacement |
| Invalid-ID / artist-guard re-pick | Qwen tool-less re-selection | Deterministic repair where possible; otherwise FunctionGemma candidate-selection contract |
| Segment research routing | FunctionGemma already selects one research tool | Keep; package as built-in |
| Segment approval | Qwen decides air/silence/kind/SFX after evidence | Rebuild around deterministic evidence/cadence policy plus Creative delivery; do not blindly give this open-ended judgement to FunctionGemma |
| Programme episode plan | Qwen generates angle, features and beat notes | Rebuild from the ground up; see below |

Qwen removal also means deleting the end-user Producer settings/provider leg,
the Producer failover leg and their administration/UI paths after replacements
are proven. Do not leave a hidden Qwen fallback behind and call the result a
two-model architecture.

## Skill segments: retained V2 infrastructure and Producer boundary

The useful runtime infrastructure formerly developed on `codex/skills-v2` is
already incorporated in `codex/producer-routing`; do not re-merge that branch.
It includes the shared research services for exact-track facts, artist news,
album anniversaries, weather outlook, sourced curiosity, music-news selection
and research-evidence packets. These are controller services. They are dormant
until a skill calls them and are not themselves a new listener-facing feature.

### Persona skill delivery

Once a segment is selected, the Creative model writes it through
`generatePersonaSegment`. It receives the full operator-authored skill brief,
the selected tool's controller-approved evidence, compact relevant context and
Persona-specific anti-repeat memory. The creative model never receives Qwen's
reasoning or tool-loop prose.

Skill delivery also inherits the selected Persona's tone directives, allowed
TTS expression cues and length ceiling. Speech is bounded before TTS. These
are safe improvements to normal skill delivery as well as Producer-delivered
segments: they do not require Producer routing to be enabled.

### What the temporary Producer does — and must stop doing

The current Qwen `djProducerSegment` path still receives every full skill brief
while selecting a research tool and deciding air/silence. That is the wrong
boundary: a Producer needs only compact operational metadata (eligibility,
required evidence and a short editorial airtime rule), not listener-facing
voice, format, comedy examples or writing constraints. The full brief belongs
only to the Creative delivery call.

The immediate design target is therefore:

```text
FunctionGemma: choose one offered research tool
Controller: enforce availability, evidence, cooldown and speaker eligibility
Creative model: use the full skill brief and approved payload to write or stand down
```

Do not replace Qwen with FunctionGemma for open-ended creative approval. If a
future bounded FunctionGemma airtime decision is wanted, it needs a separately
evaluated tool/schema contract.

### Legacy compatibility

Producer routing remains optional. When it is disabled, unavailable or declines
to route, the established skill director/simple path remains responsible for
selection and delivery. Existing skills keep their normal enablement,
cooldown and prompt behaviour; the extra research and evidence policies only
apply when a skill explicitly opts into their frontmatter contracts. Do not
make an ordinary station configure FunctionGemma, a Producer model or a
research-evidence format merely to use its existing skills.

## Built-in FunctionGemma work

The current router is an externally configured OpenAI-compatible endpoint via
`PRODUCER_ROUTER_*`. The upstream-ready version needs a bundled model/runtime
with no end-user model/provider configuration.

Before changing UI or settings, decide and document:

- model artifact, licence acceptance/distribution method, version and checksum;
- CPU runtime and native FunctionGemma call parser/adapter;
- startup, health, memory, deadline and queue-runway budget;
- upgrade/migration behaviour and a safe controller fallback when the runtime
  is unavailable;
- telemetry that distinguishes router/tool failure, candidate-selection failure
  and Creative delivery failure.

The built-in runtime should expose the same narrow controller contract now
covered by `producer-router.test.ts`: exactly one offered tool call, validated
arguments, bounded recovery after an empty result, and no execution of multiple
native calls returned in one response.

## FunctionGemma final-selection experiment

Do not turn on live FunctionGemma final selection yet. Build and run the
experiment on `codex/functiongemma-training` first:

1. Feed FunctionGemma only an already-surfaced candidate set and compact
   operational context.
2. Require exact candidate ID and allowed transition output; reject unknown IDs
   and malformed transitions deterministically.
3. Test grounding, same-artist/rotation traps, flow and contrast, show and
   playlist constraints, host influence and weaker guest nudges.
4. Compare predictions and blinded listening against the current Qwen selector
   over identical candidate sets.
5. Require 100% grounded IDs, no hard editorial regressions and queue-safe CPU
   latency before any guarded live experiment.

Only a passing selector may replace `djProducerSelect`, `djProducerPick` and
their re-pick paths. Router success alone is not evidence for this promotion.

## Programme: rebuild before migration

The current Programme plan is a Qwen-generated episode angle plus feature
notes. Reassess it as a produced-episode system rather than porting its prompt
verbatim.

Define separate contracts for:

- deterministic programme identity: show, host/guests, scheduled span, next
  show and verified event/calendar inputs;
- operational episode structure: when an opener, feature, callback, guest turn,
  music run and handover are eligible;
- verified evidence required for any factual feature;
- Creative delivery: the host/guest writes the spoken opener, feature and outro
  from approved facts and a bounded beat, never from Producer prose.

First decide which planning decisions can be deterministic and which are a
future bounded FunctionGemma contract. Do not make FunctionGemma write an
episode angle merely because Qwen has been removed; that is creative work and
belongs with the Creative model unless an operational schema can be evaluated.

## Station ID and hourly time check grounding audit

Both are Creative-delivery functions, not FunctionGemma tasks.

Required checks:

- Station ID may use only station, selected presenter, current show, supplied
  day and broad verified air-time context. It must not invent weather, date,
  programme progress, listener activity, studio events or local colour.
- Hourly check must use the controller-supplied live spoken time and day. It
  must not turn approximate timing into a precise claim, infer weather or show
  progress, or treat tone instructions as permission to invent context.
- Apply the uniform `Verified Facts` packet where appropriate and add prompt
  regressions for conflicting Persona tone/Soul instructions.

## Suggested execution order

1. Preserve the current live branch and artifacts; document/ship no model
   migration yet.
2. Complete the grounding regressions for Station ID and hourly check.
3. Design and test the Programme replacement as data contracts and deterministic
   policy before deciding which narrow actions warrant FunctionGemma training.
4. Run the final-selection evaluation on the training branch.
5. Package FunctionGemma as a built-in runtime and migrate router configuration
   behind an internal compatibility layer.
6. Replace Qwen operations one proven contract at a time; then remove the
   Qwen Producer settings, provider leg, UI and fallback paths in one explicit
   compatibility migration.

## Fresh-chat starting checks

```bash
git fetch jaz666
git switch codex/producer-routing
git pull --ff-only jaz666 codex/producer-routing
cd controller
npx tsc --noEmit
npx tsx scripts/producer-live-split.test.ts
npx tsx scripts/producer-router.test.ts
npx tsx scripts/functiongemma-v4.test.ts
```

Read this document, `functiongemma-research.md`,
`functiongemma-training-handoff.md` and `producer-persona-architecture.md`
before changing architecture. Do not discard the local training artifact
archive or revive the retired live-test branches.

## Additional Notes from user
- Explore timings of show Handoffs, quite often an outgoing DJ can sign off, the incoming DJ introduce themselves, then the outgoing DJ has one or two more spoken segments.
- Verified Facts need introducing to Handoffs, to prevent the incoming DJ inventing an upcoming track that isn't queued up.
- Factual error claim in link "Well now, the sound of wet dreams being chased certainly seems like a Tuesday afternoon mood-booster to me! Here's Wet Leg with their catchy debut single..." (it was their second single, not debut)
