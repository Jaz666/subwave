// Filter before pagination. One statement gives rows, counts and bounded bulk
// candidates from the same library/queue snapshot; no per-track read queries.
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { requireDb } from './handle.js';
import { safeParseArray } from './rows.js';
import { SUBBEATS_BATCH_LIMIT, SUBBEATS_PAGE_SIZE, subbeatsBrowseQuerySchema, subbeatsCandidatePageSchema, type subbeatsJobSchema } from '../../schemas/subbeats.js';

// Keep list/count reads off the wide track rows and their large beat arrays.
// SQLite maintains this compact projection whenever track metadata changes.
const SUBBEATS_GRID_SQL = `CASE WHEN json_valid(beats_json) THEN COALESCE(json_array_length(beats_json),0) >= 16 ELSE 0 END`;
export function ensureSubbeatsIndex(db: Database.Database): void {
  try {
    db.exec(`CREATE INDEX IF NOT EXISTS tracks_subbeats_browse_idx ON tracks(
      bpm, genres, id, title, artist, album, analysis_confidence, (${SUBBEATS_GRID_SQL}))`);
  } catch (error) {
    console.warn(`[library-db] Sub/Beats browse index unavailable: ${(error as Error).message}`);
  }
}

type BrowseFilters = Omit<z.infer<typeof subbeatsBrowseQuerySchema>, 'q' | 'offset'>;

export function subbeatsCandidates(q: string, offset = 0, filters: Partial<BrowseFilters> = {},
  jobs: Array<Pick<z.infer<typeof subbeatsJobSchema>, 'id' | 'status'>> = []) {
  const scope = filters.scope ?? (q ? 'library' : 'dance');
  const params = { q: `%${q.toLowerCase()}%`, offset,
    // Preserve legacy manual-search calls; the page sends an explicit scope.
    genre: filters.genre ?? '', status: filters.status ?? 'all',
    jobs: JSON.stringify(jobs.map(({ id, status }) => ({ id, status }))), pageSize: SUBBEATS_PAGE_SIZE, batch: SUBBEATS_BATCH_LIMIT };
  const result = requireDb().prepare(`WITH
    jobs AS MATERIALIZED (SELECT CAST(json_extract(value, '$.id') AS TEXT) id, json_extract(value, '$.status') status FROM json_each(@jobs)),
    base AS MATERIALIZED (
      SELECT t.id, COALESCE(t.title,'') title, COALESCE(t.artist,'') artist,
        COALESCE(t.album,'') album, t.bpm,
        CASE WHEN json_valid(t.genres) THEN CASE WHEN json_type(t.genres) = 'array' THEN t.genres ELSE '[]' END ELSE '[]' END genres,
        COALESCE(j.status,'not-started') status,
        ${SUBBEATS_GRID_SQL} hasBeatGrid,
        COALESCE(t.analysis_confidence,0) confidence
      FROM tracks t LEFT JOIN jobs j ON j.id = t.id
      WHERE ${scope === 'dance' ? 't.bpm BETWEEN 90 AND 180 AND subbeats_dance_genres(t.genres) = 1'
        : scope === 'prepared' ? "t.id IN (SELECT id FROM jobs WHERE status = 'prepared')" : '1 = 1'}
        AND (LOWER(COALESCE(t.title,'')) LIKE @q OR LOWER(COALESCE(t.artist,'')) LIKE @q OR LOWER(COALESCE(t.album,'')) LIKE @q)
    ),
    genre_filtered AS MATERIALIZED (SELECT * FROM base WHERE @genre = '' OR EXISTS (
      SELECT 1 FROM json_each(base.genres)
      WHERE type = 'text' AND value = @genre COLLATE NOCASE)),
    filtered AS MATERIALIZED (SELECT * FROM genre_filtered WHERE @status = 'all' OR status = @status),
    ordered AS MATERIALIZED (SELECT * FROM filtered ORDER BY hasBeatGrid DESC, confidence DESC, LOWER(artist), LOWER(title), id)
    SELECT
      (SELECT COUNT(*) FROM filtered) total,
      (SELECT json_group_array(json_object('id',id,'title',title,'artist',artist,'album',album,
        'bpm',bpm,'genres',genres,'hasBeatGrid',hasBeatGrid,'status',status)) FROM (SELECT * FROM ordered LIMIT @pageSize OFFSET MIN(@offset, MAX(0, CAST(((SELECT COUNT(*) FROM filtered) - 1) / @pageSize AS INTEGER)) * @pageSize))) rows,
      (SELECT json_group_array(json_object('value',value,'count',n)) FROM (
        SELECT je.value value, COUNT(DISTINCT base.id) n FROM base,
          json_each(base.genres) je
        WHERE je.type = 'text' AND TRIM(je.value) <> '' GROUP BY je.value COLLATE NOCASE ORDER BY n DESC, LOWER(je.value))) genres,
      (SELECT json_group_array(json_object('value',status,'count',n)) FROM (
        SELECT status, COUNT(*) n FROM genre_filtered GROUP BY status)) statuses,
      (SELECT COUNT(*) FROM filtered WHERE status IN ('not-started','failed','unavailable')) selectableCount,
      (SELECT json_group_array(json_object('id',id,'title',title,'artist',artist,'album',album,
        'bpm',bpm,'genres',genres,'hasBeatGrid',hasBeatGrid,'status',status)) FROM (
        SELECT * FROM ordered WHERE status IN ('not-started','failed','unavailable') LIMIT @batch)) selectableRows
  `).get(params) as { total: number; rows: string; genres: string; statuses: string; selectableCount: number; selectableRows: string };
  const rows = (value: string) => (JSON.parse(value) as Array<Record<string, unknown>>).map(row => ({
    ...row, hasBeatGrid: row.hasBeatGrid === 1, genres: safeParseArray(typeof row.genres === 'string' ? row.genres : '[]'),
  }));
  return subbeatsCandidatePageSchema.parse({ ...result, rows: rows(result.rows),
    genres: JSON.parse(result.genres), statuses: JSON.parse(result.statuses), selectableRows: rows(result.selectableRows),
    offset: Math.min(offset, Math.max(0, Math.ceil(result.total / SUBBEATS_PAGE_SIZE) - 1) * SUBBEATS_PAGE_SIZE),
    hasMore: offset + SUBBEATS_PAGE_SIZE < result.total });
}
