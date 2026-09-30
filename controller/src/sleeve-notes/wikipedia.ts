// Conservative identity-first Wikipedia source client. It accepts no page
// instructions as commands; returned text is untrusted source data for a later,
// evidence-bounded researcher.
import { fetchWithTimeout } from '../util/fetch-timeout.js';

const API = 'https://en.wikipedia.org/w/api.php';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2';
const USER_AGENT = 'Subwave Sleeve Notes/1.13 (https://github.com/Jaz666/subwave)';
const TIMEOUT_MS = 8_000;
const HEADERS = { 'User-Agent': USER_AGENT, Accept: 'application/json' };

async function fetchJson(url: string): Promise<unknown | null> {
  const response = await fetchWithTimeout(url, { timeoutMs: TIMEOUT_MS, headers: HEADERS });
  if (!response.ok) {
    // Identity or page absence is a clean miss; throttling and server errors
    // are transient and should leave the durable research job retryable.
    if (response.status === 408 || response.status === 429 || response.status >= 500) {
      throw new Error(`HTTP ${response.status}`);
    }
    return null;
  }
  return response.json();
}

export interface WikipediaArticleDocument {
  title: string;
  url: string;
  revisionId: string;
  retrievedAt: string;
  text: string;
  attribution: string;
}

/** Kept as an alias for the existing artist-source call sites. */
export type WikipediaArtistDocument = WikipediaArticleDocument;

export function projectWikipediaArticleDocument(payload: unknown): WikipediaArticleDocument | null {
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
  // A bounded revision is enough for an initial dossier and prevents a
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

/** Existing artist projection API. */
export function projectWikipediaArtistDocument(payload: unknown): WikipediaArtistDocument | null {
  return projectWikipediaArticleDocument(payload);
}

/** Extract a Wikidata item from a MusicBrainz entity's explicit URL relation. */
export function wikidataIdFromMusicBrainzEntity(payload: unknown): string | null {
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

/** Extract an artist's Wikidata item from MusicBrainz's explicit URL relation. */
export function wikidataIdFromMusicBrainzArtist(payload: unknown): string | null {
  return wikidataIdFromMusicBrainzEntity(payload);
}

/** Extract an album concept's Wikidata item from its release-group relations. */
export function wikidataIdFromMusicBrainzReleaseGroup(payload: unknown): string | null {
  return wikidataIdFromMusicBrainzEntity(payload);
}

/** Read only the canonical English-Wikipedia sitelink from the resolved item. */
export function englishWikipediaTitleFromWikidata(payload: unknown, wikidataId: string): string | null {
  const entity = (payload as { entities?: Record<string, { sitelinks?: { enwiki?: { title?: unknown } } }> })
    ?.entities?.[wikidataId];
  const title = entity?.sitelinks?.enwiki?.title;
  return typeof title === 'string' && title.trim() ? title.trim() : null;
}

async function fetchWikipediaDocumentFromMusicBrainzEntity(
  entityPath: 'artist' | 'release-group', musicBrainzId: string,
): Promise<WikipediaArticleDocument | null> {
  const entityId = musicBrainzId.trim();
  if (!entityId) return null;
  const entityUrl = `${MUSICBRAINZ_API}/${entityPath}/${encodeURIComponent(entityId)}?inc=url-rels&fmt=json`;
  const params = new URLSearchParams({
    action: 'query', format: 'json', prop: 'extracts|info|revisions',
    inprop: 'url', explaintext: '1', rvprop: 'ids', rvslots: 'main', maxlag: '5',
  });
  const entityPayload = await fetchJson(entityUrl);
  if (!entityPayload) return null;
  const wikidataId = entityPath === 'artist'
    ? wikidataIdFromMusicBrainzArtist(entityPayload)
    : wikidataIdFromMusicBrainzReleaseGroup(entityPayload);
  if (!wikidataId) return null;
  const wikidataPayload = await fetchJson(`${WIKIDATA_API}?${new URLSearchParams({
      action: 'wbgetentities', format: 'json', ids: wikidataId, props: 'sitelinks', sitefilter: 'enwiki', origin: '*',
  })}`);
  if (!wikidataPayload) return null;
  const title = englishWikipediaTitleFromWikidata(wikidataPayload, wikidataId);
  if (!title) return null;
  params.set('titles', title);
  const articlePayload = await fetchJson(`${API}?${params}`);
  return articlePayload ? projectWikipediaArticleDocument(articlePayload) : null;
}

export function fetchWikipediaArtistDocument(musicBrainzArtistId: string): Promise<WikipediaArtistDocument | null> {
  return fetchWikipediaDocumentFromMusicBrainzEntity('artist', musicBrainzArtistId);
}

/** Resolve an album through its MusicBrainz release group and Wikidata sitelink. */
export function fetchWikipediaReleaseGroupDocument(musicBrainzReleaseGroupId: string): Promise<WikipediaArticleDocument | null> {
  return fetchWikipediaDocumentFromMusicBrainzEntity('release-group', musicBrainzReleaseGroupId);
}
