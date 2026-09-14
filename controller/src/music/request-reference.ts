// Controller-owned resolution for listener descriptions and pasted lyrics.
// Web text may identify a title, but every playable result still comes from the
// local Subsonic library. This is a bounded lookup, never an agent/tool loop.

import * as subsonic from './subsonic.js';
import * as dj from '../llm/dj.js';
import { searchWeb } from '../skills/web-search.js';
import { exactTitleByArtist, type RequestMatchCandidate } from './request-match.js';

interface ReferenceGuess {
  title: string;
  artist: string | null;
  keyword: string | null;
}

interface ReferenceDependencies<T extends RequestMatchCandidate> {
  searchWeb: (reference: string) => Promise<{
    answer: string;
    results: Array<{ title: string; content: string }>;
  }>;
  identifyTrack: (reference: string, evidence: string) => Promise<ReferenceGuess | null>;
  searchLibrary: (query: string, opts: { songCount: number }) => Promise<T[]>;
  resolveArtist: (artist: string) => Promise<{ name?: string | null } | null>;
}

export interface RequestReferenceResult<T extends RequestMatchCandidate> {
  identified: ReferenceGuess;
  candidates: T[];
}

const defaultDependencies: ReferenceDependencies<RequestMatchCandidate> = {
  searchWeb,
  identifyTrack: dj.identifyTrackFromText,
  searchLibrary: subsonic.search,
  resolveArtist: subsonic.resolveArtist,
};

export async function resolveRequestReference<T extends RequestMatchCandidate = RequestMatchCandidate>(
  reference: string,
  dependencies: ReferenceDependencies<T> = defaultDependencies as ReferenceDependencies<T>,
): Promise<RequestReferenceResult<T> | null> {
  const query = String(reference || '').trim();
  if (!query) return null;

  const web = await dependencies.searchWeb(query);
  const evidence = [web.answer, ...web.results.map(result => `${result.title}: ${result.content}`)]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000);
  if (!evidence) return null;

  const identified = await dependencies.identifyTrack(query, evidence);
  if (!identified?.title) return null;

  const combined = [identified.artist, identified.title].filter(Boolean).join(' ');
  let candidates = await dependencies.searchLibrary(combined, { songCount: 25 });
  if (candidates.length === 0 && identified.artist) {
    const artist = await dependencies.resolveArtist(identified.artist);
    if (artist?.name) {
      candidates = await dependencies.searchLibrary(`${artist.name} ${identified.title}`, { songCount: 25 });
    }
  }
  if (candidates.length === 0) {
    candidates = await dependencies.searchLibrary(identified.title, { songCount: 25 });
  }
  if (candidates.length === 0 && identified.keyword && identified.keyword !== identified.title) {
    candidates = await dependencies.searchLibrary(identified.keyword, { songCount: 25 });
  }

  return { identified, candidates };
}

export function chooseRequestReferenceCandidate<T extends RequestMatchCandidate>(
  resolved: RequestReferenceResult<T> | null,
  recentIds: Set<string> = new Set(),
): T | null {
  if (!resolved || resolved.candidates.length === 0) return null;
  const exact = exactTitleByArtist(resolved.candidates, {
    titles: [resolved.identified.title],
    artist: resolved.identified.artist,
  });
  if (exact) return exact;
  const playable = resolved.candidates.filter(candidate => candidate?.id);
  return playable.find(candidate => !recentIds.has(candidate.id!))
    || playable[0]
    || null;
}
