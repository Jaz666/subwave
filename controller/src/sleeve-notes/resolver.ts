/** Conservative matching for provider relationships. A same-title result with
 * a different artist is never a local attachment. */
export function normaliseMusicText(value: unknown): string {
  return String(value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export interface LocalTrackCandidate { id?: unknown; title?: unknown; artist?: unknown }

export function exactLocalMatches<T extends LocalTrackCandidate>(input: { title: string; artist?: string }, candidates: T[]): T[] {
  const title = normaliseMusicText(input.title);
  const artist = normaliseMusicText(input.artist);
  if (!title || !artist) return [];
  return candidates.filter((candidate) => normaliseMusicText(candidate.title) === title
    && normaliseMusicText(candidate.artist) === artist && !!candidate.id);
}
