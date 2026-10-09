// Model preparation describes search intent; only controller code maps it to
// executable discovery tools. This data contains no tool names or call schema.
import { z } from 'zod';

export const shortlistSearchSchema = z.object({
  searches: z.array(z.object({
    kind: z.enum(['library', 'artist', 'recentArtist', 'theme', 'sound']),
    query: z.string().trim().min(1).max(120),
  }).strict().refine(search => !['theme', 'sound'].includes(search.kind) || search.query.length >= 3)).max(3),
}).strict();

export type ShortlistSearch = z.infer<typeof shortlistSearchSchema>['searches'][number];

const SEARCH_SOURCES: Record<ShortlistSearch['kind'], string> = {
  library: 'searchLibrary', artist: 'topSongsByArtist', recentArtist: 'recentByArtist',
  theme: 'searchByLyrics', sound: 'searchBySound',
};

export function shortlistSearchCalls(searches: readonly ShortlistSearch[], available: ReadonlySet<string>) {
  const calls: Array<{ source: string; args: Record<string, string>; family: 'context' }> = [];
  const seen = new Set<string>();
  // Validate here too: the planner also accepts callers other than preparation.
  for (const search of searches.slice(0, 3)) {
    const parsed = shortlistSearchSchema.shape.searches.element.safeParse(search);
    if (!parsed.success) continue;
    const { kind, query } = parsed.data;
    const source = SEARCH_SOURCES[kind];
    const identity = `${kind}:${query.toLowerCase()}`;
    if (!available.has(source) || seen.has(identity)) continue;
    seen.add(identity);
    calls.push({ source, args: { [kind === 'artist' || kind === 'recentArtist' ? 'artist' : 'query']: query }, family: 'context' });
  }
  return calls;
}
