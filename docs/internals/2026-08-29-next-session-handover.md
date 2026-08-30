# Next-session handover — 2026-08-29 soak review

## Current status

The live test station is stable and should remain unchanged until the next
session. The extended soak test produced:

- 531 model calls;
- 524 successful and 7 failed (98.7%, displayed as 99%);
- 8.6s average latency, 5.4s p50 and 18.5s p95.

The GPU analyzer is active on the live station. It is running the CUDA image
and can see the NVIDIA RTX 3060. The controller was not restarted for that
change.

## First priority: retrain FunctionGemma

FunctionGemma retraining is the first task for the next session.

The soak shows 171 discovery-tool calls, but 161 (94%) used only four tools:

- `tracksTowardJourney`: 82;
- `tracksLikeThis`: 37;
- `showPlaylistTracks`: 21;
- `similarSongs`: 21.

This is a release blocker for the Producer-routing PR. FunctionGemma must be
able to call the complete set of 17 ordinary vanilla candidate-finding tools.
It may choose only one tool for a particular context, but every applicable
tool must be registered, described, argument-compatible, and represented in
training and evaluation data. `identifyRequestedTrack` remains request-only.

The current FunctionGemma training contracts omit vanilla discovery tools,
including `topSongsByArtist`, `recentByArtist`, `tracksThatSoundLikeThis`,
`searchByLyrics` and `searchBySound`. The training families also over-target
playlist, journey and similarity routes. Treat the present four-tool
concentration as an experiment-design/model-contract problem until proven
otherwise, not as acceptable model preference.

### Retraining investigation

1. Restore complete parity between the 17 vanilla discovery tools and the
   FunctionGemma contracts, descriptions, schemas and runtime gates.
2. Rebalance training examples across every discovery family, including
   explicit examples for the currently underrepresented tools and recovery
   paths.
3. Add an offered-versus-selected telemetry comparison so each route records
   which tools were available and which one FunctionGemma chose.
4. Replay identical contexts through vanilla `djAgentPick` and
   `djProducerRoute` to separate runtime availability from model bias.
5. Re-run frozen evaluation and Q8 soak before considering another live model.

Do not alter the live station or promote a retrained model until this parity
and evaluation work is complete.

## Other soak findings — defer unless they worsen

The seven failures were concentrated in `djProducerRoute` (2) and
`djProducerPick` (1), with `djProducerPick` showing a 68s average latency.
Local tool failures included `tracksTowardJourney` (1), `similarSongs` (1)
and `tracksByEnergy` (2). These remain follow-up items after the retraining
priority.

## Handover timing follow-up

Review the two recent boundary cases:

- Around 15:00 BST, Kendrick Lamar's `For Sale? (interlude)` was correctly
  selected in the incoming `Backstage` context and started at 14:58:49 BST,
  but the formal handover fired around 14:53, the outgoing presenter spoke
  again afterwards, and track/session metadata still identified `The Rock
  Vault`.
- Review the handover leading up to 18:00 BST. A banter segment fired after
  the formal handoff, suggesting the same class of post-handoff scheduling or
  suppression defect.

The timing and handover fixes are observation items for the next session, not
reasons to disturb the currently stable soak station today.
