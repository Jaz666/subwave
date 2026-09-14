// Conservative Wikimedia API client for artist-source material. It accepts no
// page instructions as commands; returned text is untrusted source data for a
// later, evidence-bounded researcher.
import { fetchWithTimeout } from '../util/fetch-timeout.js';

const API = 'https://en.wikipedia.org/w/api.php';
const USER_AGENT = 'Subwave Sleeve Notes/1.13 (https://github.com/Jaz666/subwave)';
const TIMEOUT_MS = 8_000;

export interface WikipediaArtistDocument {
  title: string;
  url: string;
  revisionId: string;
  retrievedAt: string;
  text: string;
  attribution: string;
}

export function projectWikipediaArtistDocument(payload: unknown): WikipediaArtistDocument | null {
  const pages = (payload as { query?: { pages?: Record<string, unknown> } })?.query?.pages;
  if (!pages || typeof pages !== 'object') return null;
  const page = Object.values(pages)[0] as Record<string, unknown> | undefined;
  if (!page || page.missing !== undefined) return null;
  const title = typeof page.title === 'string' ? page.title : null;
  const url = typeof page.fullurl === 'string' ? page.fullurl : null;
  const text = typeof page.extract === 'string' ? page.extract.trim() : null;
  const revision = Array.isArray(page.revisions) ? page.revisions[0] as Record<string, unknown> | undefined : undefined;
  const revisionId = typeof revision?.revid === 'number' || typeof revision?.revid === 'string' ? String(revision.revid) : null;
  if (!title || !url || !text || !revisionId) return null;
  // A bounded revision is enough for the initial artist dossier and prevents a
  // huge article from becoming accidental prompt context later.
  return {
    title,
    url,
    revisionId,
    retrievedAt: new Date().toISOString(),
    text: text.slice(0, 24_000),
    attribution: `Wikipedia contributors, “${title}”, CC BY-SA`,
  };
}

export async function fetchWikipediaArtistDocument(artistName: string): Promise<WikipediaArtistDocument | null> {
  const name = artistName.trim();
  if (!name) return null;
  const params = new URLSearchParams({
    action: 'query', format: 'json', generator: 'search', gsrsearch: `"${name}"`,
    gsrnamespace: '0', gsrlimit: '1', prop: 'extracts|info|revisions',
    inprop: 'url', explaintext: '1', rvprop: 'ids', rvslots: 'main', maxlag: '5',
  });
  try {
    const response = await fetchWithTimeout(`${API}?${params}`, {
      timeoutMs: TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return projectWikipediaArtistDocument(await response.json());
  } catch {
    return null;
  }
}
