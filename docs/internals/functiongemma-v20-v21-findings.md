# FunctionGemma V20/V21 acceptance findings

## Outcome

V20 was rejected at Q8. It retained the permanent journey-withheld controller
regression (25/25), but emitted a malformed `recentByArtist` argument envelope
on four of five recovery attempts. V21 added a deliberately small correction:
12 train and 4 held-out exact-artist recovery conversations, with the real
post-empty controller instruction and per-decision offered-tool lists.

V21 passed the acceptance sequence:

| Gate | Result |
| --- | --- |
| Native controller regression | 35/35 |
| Q8 controller regression | 35/35 |
| Bounded Q8 soak | 128/128 |

The candidate remained isolated on the disposable port-8099 evaluation
container throughout. V13/live routing was not changed.

## What changed and why

The correction corpus teaches the exact `topSongsByArtist` to
`recentByArtist` recovery transition, including copying the artist argument
character-for-character. It is appended to the V20 corpus; it does not broaden
the routing policy or alter discovery depth.

Training now supports optional `decisionTools`: each assistant decision can be
rendered against its actual offered tools. This matters after an empty result,
when the controller removes the already-used function before requesting a
recovery source.

The native scorer and Q8 scorer now accept an external scenario file. This
makes the five permanent journey-withheld cases durable regression fixtures,
rather than a manual check outside the normal workflow.

## Harness lesson

The first V21 soak failures were not a new model regression. The dedicated
soak harness had drifted from the controller path: it retained used tools and
omitted the canonical post-empty instruction. It now mirrors both rules. This
is important because a valid model should be judged against the exact
conversation it will receive in service.

Future work should consolidate native evaluation, Q8 evaluation and soak
behind one shared controller-transcript builder. A small Q8 transition-smoke
gate should run before the wider soak, covering every recovery family and
argument schema.

## Operational notes

Run training from the developer's terminal, not through an agent relay. The
workflow writes full subprocess output to `workflow-command.log`, while the
terminal shows stage summaries and asks for an explicit continuation decision.
Use `--resume` to continue from the first unfinished or stopped stage.
