// Discovery hints from existing analysis only; no drive score or eligibility claim.
import { requireDb } from './handle.js';

export function subbeatsCandidates(q: string, offset = 0) {
  const d = requireDb();
  const where = q ? `(LOWER(COALESCE(title,'')) LIKE @q OR LOWER(COALESCE(artist,'')) LIKE @q OR LOWER(COALESCE(album,'')) LIKE @q)`
    : 'bpm BETWEEN 90 AND 180';
  const grid = `CASE WHEN json_valid(beats_json) THEN COALESCE(json_array_length(beats_json),0) >= 16 ELSE 0 END`;
  const params = { q: `%${q.toLowerCase()}%`, offset };
  const rows = d.prepare(`SELECT id, COALESCE(title,'') title, COALESCE(artist,'') artist,
    COALESCE(album,'') album, bpm, ${grid} hasBeatGrid FROM tracks WHERE ${where}
    ORDER BY (${grid}) DESC, COALESCE(analysis_confidence,0) DESC, LOWER(artist), LOWER(title), id
    LIMIT 51 OFFSET @offset`).all(params) as Array<{
      id: string; title: string; artist: string; album: string; bpm: number | null; hasBeatGrid: number;
    }>;
  return { rows: rows.slice(0, 50).map(r => ({ ...r, hasBeatGrid: r.hasBeatGrid === 1 })), hasMore: rows.length > 50 };
}
