# Show-boundary handoffs

## Why this needs a boundary model

Show changes are audible editorial boundaries, not merely a different prompt
context for the next picker run. A listener should hear one coherent final
outgoing-show track, a natural handoff during that track, then the incoming
show. Preparing the next track ahead of time must not make the incoming show
or its host appear on air early.

The controller's playback queue, session identity, presenter roster, and
spoken-segment scheduling therefore need an explicit distinction between a
**planned** boundary and an **on-air** boundary.

## Observed failure modes

### Early handoff

The picker uses a look-ahead time to decide which show's constraints apply to
a future pick. When that same look-ahead immediately rolls the live session,
the outgoing presenter can sign off several minutes before the scheduled
change. The new host and show then become the active identity while the final
outgoing-show track is still playing.

### Cross-boundary speech

Track-linked speech is rendered and queued ahead of playback. If it survives
an early identity roll, an outgoing presenter can speak after the handoff, or
an incoming presenter can describe the outgoing programme as though they
already host it. A handoff must be the outgoing presenter's final ordinary
spoken contribution.

### Host/guest inversion

Two adjacent shows may deliberately reverse the same presenters' roles. For
example, presenter A may host the outgoing show with presenter B as a guest,
while B hosts the incoming show with A as the guest. Applying the incoming
roster while the outgoing show is still on air produces contradictory IDs,
links, and banter even when each generated line follows its prompt correctly.

### Repeated schedule mentions

This is not a vanilla SUB/WAVE behaviour. It applies only when an optional
context integration supplies next-show or remaining-show facts to every speech
request. In that configuration, the facts invite repetition unless the
integration has a cadence policy. They are useful near a boundary, but are
programme beats rather than default material for every link, ident, segment,
or co-host exchange.

## Required on-air sequence

1. Identify and queue the final track that still belongs to the outgoing show.
2. Let that track's linked intro play, when one exists.
3. During that track, air the outgoing sign-off followed by the incoming
   presenter's greeting.
4. After the handoff, suppress ordinary outgoing-presenter speech.
5. At the real track/hour changeover, activate the incoming session and roster;
   its first track then starts under the new show's identity.

The boundary must be driven by confirmed playback state where possible. A
queued URI is only handed to Liquidsoap, not proof that a listener has reached
the corresponding on-air moment.

## Design constraints

- Keep look-ahead selection: it is needed to choose music appropriate for the
  upcoming show.
- Do not use look-ahead selection as permission to roll the live session,
  switch the on-air roster, or speak a handoff.
- Preserve listener-request handling and manual operator actions.
- Keep the outgoing sign-off and incoming greeting as the only intentional
  cross-persona handoff speech. Render and publish them as one serialized
  exchange; every other speech path must check the handoff both before TTS
  starts and immediately before it publishes a rendered clip.
- Treat a missing/unknown duration conservatively: never invent an exact
  boundary time or delay music waiting for one.

## Optional schedule-fact cadence

Optional context integrations that supply schedule facts should use a dedicated
cadence policy shared by all automatic speech paths. This branch neither adds
nor changes such an integration. Where those facts are available, the policy
should allow only a small number of mentions in the final part of a show (for
example, one general final-half-hour mention and one nearer the handoff), while
leaving the handoff itself to name the incoming show naturally. It must not
depend on model self-restraint.

## Regression coverage

Tests should cover at least:

- a normal show transition with an outgoing linked intro;
- a handoff that would previously have fired early due to look-ahead;
- no outgoing ordinary speech after the handoff;
- a host/guest role reversal between adjacent shows;
- no schedule-fact repetition outside an optional integration's cadence allowance;
