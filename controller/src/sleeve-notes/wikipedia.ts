// Conservative identity-first artist-source client. It accepts no page
// instructions as commands; returned text is untrusted source data for a later,
// evidence-bounded researcher.
import { fetchWithTimeout } from '../util/fetch-timeout.js';

const API = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
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

/** Extract an artist's Wikidata item from MusicBrainz's explicit URL relation. */
export function wikidataIdFromMusicBrainzArtist(payload: unknown): string | null {
  const relations = (payload as { relations?: unknown })?.relations;
  if (!Array.isArray(relations)) return null;
  for (const relation of relations) {
    const row = relation as { type?: unknown; url?: { resource?: unknown } };
    if (row.type !== 'wikidata' || typeof row.url?.resource !== 'string') continue;
    const match = row.url.resource.match(/(?:wiki\/|entity\/)(Q\d+)(?:$|[?#])/i);
    if (match) return match[1].toUpperCase();
  }
  return null;
}

/** Read only the canonical English-Wikipedia sitelink from the resolved item. */
export function englishWikipediaTitleFromWikidata(payload: unknown, wikidataId: string): string | null {
  const entity = (payload as { entities?: Record<string, { sitelinks?: { enwiki?: { title?: unknown } } }> })
    ?.entities?.[wikidataId];
  const title = entity?.sitelinks?.enwiki?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

export async function fetchWikipediaArtistDocument(musicBrainzArtistId: string): Promise<WikipediaArtistDocument | null> {
  const artistId = musicBrainzArtistId.trim();
  if (!artistId) return null;
  const artistUrl = `${MUSICBRAINZ_API}/artist/${encodeURIComponent(artistId)}?inc=url-rels&fmt=json`;
  const params = new URLSearchParams({
    action: 'query', format: 'json', prop: 'extracts|info|revisions',
    inprop: 'url', explaintext: '1', rvprop: 'ids', rvslots: 'main', maxlag: '5',
  });
  try {
    const artistResponse = await fetchWithTimeout(artistUrl, {
      timeoutMs: TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!artistResponse.ok) return null;
    const wikidataId = wikidataIdFromMusicBrainzArtist(await artistResponse.json());
    if (!wikidataId) return null;
    const wikidataResponse = await fetchWithTimeout(`${WIKIDATA_API}?${new URLSearchParams({
      action: 'wbgetentities', format: 'json', ids: wikidataId, props: 'sitelinks', sitefilter: 'enwiki', origin: '*',
    })}`, {
      timeoutMs: TIMEOUT_MS,
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!wikidataResponse.ok) return null;
    const title = englishWikipediaTitleFromWikidata(await wikidataResponse.json(), wikidataId);
    if (!title) return null;
    params.set('titles', title);
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
