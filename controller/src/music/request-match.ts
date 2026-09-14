// Exact-match helpers for listener requests. Broad request search remains
// deliberately forgiving; this tiny first pass protects the unambiguous
// "title by artist" form from being diluted by an artist's other results.

export interface RequestMatchCandidate {
  id?: string | null;
  title?: string | null;
  artist?: string | null;
}

function key(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Keep letters, numbers and script-specific marks from every writing
    // system. Restricting this to ASCII made an exact Cyrillic, Japanese or
    // Punjabi title/artist pair collapse to two empty keys.
    .replace(/[^\p{L}\p{N}\p{M}]/gu, '');
}

export function exactTitleByArtist<T extends RequestMatchCandidate>(
  candidates: T[],
  { titles, artist }: { titles: string[]; artist: string | null | undefined },
): T | null {
  const artistKey = key(artist);
  const titleKeys = new Set(titles.map(key).filter(Boolean));
  if (!artistKey || titleKeys.size === 0) return null;
  return candidates.find(candidate =>
    !!candidate?.id
    && titleKeys.has(key(candidate.title))
    && key(candidate.artist) === artistKey,
  ) || null;
}

export async function resolveNamedRequest<T extends RequestMatchCandidate>(
  {
    terms,
    artist,
    sort,
    scope,
  }: {
    terms: string[];
    artist: string | null | undefined;
    sort: string | null | undefined;
    scope: string | null | undefined;
  },
  {
    searchTitle,
    pickArtist,
  }: {
    searchTitle: (title: string) => Promise<T[]>;
    pickArtist: () => Promise<T | null>;
  },
): Promise<{ track: T; source: 'search:exact-title-artist' | 'artist-sort' } | null> {
  const artistKey = key(artist);
  const titleTerms = terms.filter(term => key(term) !== artistKey);

  // A named title is the listener's strongest constraint. Honour it before a
  // valid catalogue sort ("popular", "latest", "oldest") can pick a random
  // song by the same artist; the sorted artist walk remains the forgiving
  // fallback when the exact title is absent locally.
  if (artistKey && titleTerms.length > 0) {
    const candidates: T[] = [];
    for (const title of titleTerms) candidates.push(...await searchTitle(title));
    const exact = exactTitleByArtist(candidates, { titles: titleTerms, artist });
    if (exact) return { track: exact, source: 'search:exact-title-artist' };
  }

  if (artistKey && (sort || scope === 'album' || titleTerms.length === 0)) {
    const track = await pickArtist();
    if (track) return { track, source: 'artist-sort' };
  }
  return null;
}
