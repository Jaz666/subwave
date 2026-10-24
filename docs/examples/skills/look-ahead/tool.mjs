export const description = 'Choose up to two prepared shows later today, excluding the next scheduled show. Returns exact times, titles, presenters and editorial briefs, with the speaking DJ’s role. Stand down if nothing qualifies.';
export const requiresData = true;
export const ready = services => typeof services.schedule?.laterToday === 'function';

export default async function lookAhead(ctx, state, services) {
  if (!ready(services)) return { available: false, reason: 'Schedule service unavailable' };
  const snapshot = services.schedule.laterToday();
  // Cross-tick rotation after the durable first-offer markers are exhausted.
  if (state.rotation?.day !== snapshot.day) state.rotation = { day: snapshot.day, sequence: 0, offered: {} };
  const rotation = state.rotation;
  const shows = snapshot.shows
    .map(show => ({ show, offered: services.recall.seen(`look-ahead:offered:${show.occurrenceId}`), lastOffered: rotation.offered[show.occurrenceId] ?? 0, rank: Math.random() }))
    .sort((a, b) => Number(a.offered) - Number(b.offered) || a.lastOffered - b.lastOffered || a.rank - b.rank)
    .slice(0, 2).map(item => item.show)
    .sort((a, b) => a.startsAt - b.startsAt);
  if (!shows.length) return { available: false, reason: 'No eligible shows later today beyond the next scheduled show' };
  // Offered, not necessarily aired: a later generation or delivery can abstain.
  for (const show of shows) {
    services.recall.remember(`look-ahead:offered:${show.occurrenceId}`);
    rotation.offered[show.occurrenceId] = ++rotation.sequence;
  }
  return { available: true, day: snapshot.day, timezone: snapshot.timezone,
    speaker: snapshot.speaker, when: 'All listed shows air later TODAY. Mention every listed show using its exact startTime.', shows, lookAheadStamp: snapshot.lookAheadStamp };
}
