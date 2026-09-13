import type { ProviderIdentity, ProviderRelationship, SleeveEntityInput, SleeveProvider, SleeveProviderResult } from './provider.js';

const RELATIONSHIP_TYPES = new Set(['samples', 'sampled_in', 'cover_of', 'covered_by']);
const CREDIT_ROLES = new Set(['Producer', 'Writer']);

export class GeniusRequestError extends Error {
  constructor(readonly status: number, message = `Genius request failed (${status})`) {
    super(message);
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type Pause = (ms: number, signal: AbortSignal) => Promise<void>;

const pause: Pause = (ms, signal) => new Promise((resolve, reject) => {
  const timer = setTimeout(resolve, ms);
  signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
});

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normal(value: string | undefined): string {
  return (value ?? '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function songIdentity(song: unknown): ProviderIdentity | null {
  if (!song || typeof song !== 'object') return null;
  const s = song as Record<string, unknown>;
  const id = s.id;
  const title = text(s.title);
  const url = text(s.url);
  const artist = s.primary_artist as Record<string, unknown> | undefined;
  const artistName = text(artist?.name);
  if ((typeof id !== 'number' && typeof id !== 'string') || !title || !url) return null;
  return { providerId: String(id), canonicalUrl: url, title, artist: artistName };
}

export function selectGeniusSearchHit(payload: unknown, entity: SleeveEntityInput): string | null {
  const root = payload as { response?: { hits?: unknown[] } };
  const hits = root?.response?.hits;
  if (!Array.isArray(hits)) return null;
  const wantedTitle = normal(entity.title);
  const wantedArtist = normal(entity.artist);
  for (const hit of hits) {
    const candidate = songIdentity((hit as { result?: unknown })?.result);
    if (!candidate || normal(candidate.title) !== wantedTitle) continue;
    if (wantedArtist && normal(candidate.artist) !== wantedArtist) continue;
    return candidate.providerId;
  }
  return null;
}

/** Projects only the Phase-0 allowlist. Raw Genius payloads are never retained. */
export function projectGeniusSong(payload: unknown): SleeveProviderResult | null {
  const song = (payload as { response?: { song?: unknown } })?.response?.song;
  const identity = songIdentity(song);
  if (!identity || !song || typeof song !== 'object') return null;
  const value = song as Record<string, unknown>;
  const credits: SleeveProviderResult['credits'] = [];
  for (const item of Array.isArray(value.custom_performances) ? value.custom_performances : []) {
    const row = item as Record<string, unknown>;
    const role = text(row.label);
    const names = Array.isArray(row.artists) ? row.artists.map((artist) => text((artist as Record<string, unknown>)?.name)).filter((name): name is string => !!name) : [];
    if (role && CREDIT_ROLES.has(role) && names.length) credits.push({ role, names });
  }
  const relationships: ProviderRelationship[] = [];
  for (const item of Array.isArray(value.song_relationships) ? value.song_relationships : []) {
    const row = item as Record<string, unknown>;
    const type = text(row.relationship_type);
    if (!type || !RELATIONSHIP_TYPES.has(type) || !Array.isArray(row.songs)) continue;
    for (const linked of row.songs) {
      const target = songIdentity(linked);
      if (target) relationships.push({ type: type as ProviderRelationship['type'], target });
    }
  }
  return { identity, credits, relationships, attribution: 'Metadata and relationships from Genius', retrievedAt: new Date().toISOString() };
}

export class GeniusProvider implements SleeveProvider {
  readonly id = 'genius';
  constructor(private readonly token: string, private readonly fetcher: FetchLike = fetch, private readonly wait: Pause = pause) {}

  async fetch(entity: SleeveEntityInput, signal: AbortSignal): Promise<SleeveProviderResult | null> {
    const headers = { Authorization: `Bearer ${this.token}` };
    const query = new URLSearchParams({ q: [entity.title, entity.artist].filter(Boolean).join(' ') });
    const search = await this.request(`https://api.genius.com/search?${query}`, headers, signal);
    const id = selectGeniusSearchHit(await search.json(), entity);
    if (!id) return null;
    // Genius has no published numeric quota. Keep the conservative Phase-0
    // ceiling: at most one request per second, including this two-call lookup.
    await this.wait(1_000, signal);
    const song = await this.request(`https://api.genius.com/songs/${encodeURIComponent(id)}`, headers, signal);
    return projectGeniusSong(await song.json());
  }

  private async request(url: string, headers: Record<string, string>, signal: AbortSignal): Promise<Response> {
    const response = await this.fetcher(url, { headers, signal });
    if (!response.ok) throw new GeniusRequestError(response.status);
    return response;
  }
}
