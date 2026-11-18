// Page only cached track identities. Files are checked by the route; stems_at
// is an attempt stamp and would incorrectly include evicted cache entries.
import { requireDb } from './handle.js';

export function stemBlendPreviewTracks(ids: string[], query: string, offset: number) {
  const d = requireDb();
  const where = `id IN (SELECT value FROM json_each(?)) AND
    (COALESCE(title, '') LIKE ? OR COALESCE(artist, '') LIKE ? OR id = ?)`;
  const params = [JSON.stringify(ids), `%${query}%`, `%${query}%`, query];
  const total = (d.prepare(`SELECT COUNT(*) AS n FROM tracks WHERE ${where}`).get(...params) as { n: number }).n;
  const rows = d.prepare(`SELECT id, COALESCE(title, '') AS title, COALESCE(artist, '') AS artist
    FROM tracks WHERE ${where} ORDER BY artist, title, id LIMIT 30 OFFSET ?`).all(...params, offset) as Array<{ id: string; title: string; artist: string }>;
  return { total, offset, rows };
}
