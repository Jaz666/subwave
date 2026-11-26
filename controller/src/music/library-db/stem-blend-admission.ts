import { requireDb } from './handle.js';
import { stemBlendTailAdmissionSchema, type StemBlendTailAdmission } from '../../schemas/stem-blend-admission.js';

// A complete current head can disprove identity. A prefix or missing head
// leaves the same-sized tail evidence available under its own fingerprint.
const SOURCE_MATCH = `
  a.source_bytes = t.file_size AND CASE
    WHEN a.source_sha256 IS NULL OR NOT json_valid(t.grid_provenance_json) THEN 1
    WHEN json_extract(t.grid_provenance_json, '$.source.complete') IS NOT 1
      OR json_extract(t.grid_provenance_json, '$.source.bytes') IS NOT t.file_size THEN 1
    ELSE a.source_sha256 = json_extract(t.grid_provenance_json, '$.source.sha256')
  END
`;

export function stemBlendAdmissionIds(limit: number, ids: readonly string[] | null, rescan: boolean): string[] {
  const scope = ids === null ? null : JSON.stringify(ids);
  const rows = requireDb().prepare(`
    SELECT t.id
    FROM tracks t
    LEFT JOIN stem_blend_tail_admission a ON a.track_id = t.id AND (${SOURCE_MATCH})
    LEFT JOIN regular_grid_scan_queue q ON q.track_id = t.id
    WHERE t.file_size > 0
      AND (? IS NULL OR t.id IN (SELECT value FROM json_each(?)))
      AND (${rescan ? "a.status IN ('measured', 'no-grid')" : "(a.status IS NULL OR a.status = 'failed')"})
    ORDER BY a.attempted_at IS NOT NULL, a.attempted_at, q.queued_at IS NULL, q.queued_at, t.id
    LIMIT ?
  `).all(scope, scope, limit) as { id: string }[];
  return rows.map(row => row.id);
}

export function readStemBlendTailAdmission(id: string): StemBlendTailAdmission | null {
  const row = requireDb().prepare(`
    SELECT a.evidence_json FROM stem_blend_tail_admission a JOIN tracks t ON t.id = a.track_id
    WHERE t.id = ? AND (${SOURCE_MATCH})
  `).get(id) as { evidence_json: string | null } | undefined;
  if (!row?.evidence_json) return null;
  try {
    const parsed = stemBlendTailAdmissionSchema.safeParse(JSON.parse(row.evidence_json));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function writeStemBlendTailAdmission(id: string, sourceBytes: number, evidence: StemBlendTailAdmission | null): boolean {
  return requireDb().prepare(`
    INSERT INTO stem_blend_tail_admission(track_id, source_bytes, source_sha256, status, evidence_json, attempted_at)
    SELECT id, file_size, ?, ?, ?, ? FROM tracks WHERE id = ? AND file_size = ?
    ON CONFLICT(track_id) DO UPDATE SET source_bytes = excluded.source_bytes,
      status = excluded.status,
      source_sha256 = COALESCE(excluded.source_sha256,
        CASE WHEN stem_blend_tail_admission.source_bytes = excluded.source_bytes
          THEN stem_blend_tail_admission.source_sha256 END),
      evidence_json = CASE
        WHEN excluded.status = 'failed' AND stem_blend_tail_admission.source_bytes = excluded.source_bytes
          AND (excluded.source_sha256 IS NULL OR excluded.source_sha256 = stem_blend_tail_admission.source_sha256)
          AND json_extract(stem_blend_tail_admission.evidence_json, '$.gridStatus') IN ('measured', 'no-grid')
        THEN stem_blend_tail_admission.evidence_json
        WHEN excluded.evidence_json IS NULL AND stem_blend_tail_admission.source_bytes = excluded.source_bytes
        THEN stem_blend_tail_admission.evidence_json
        ELSE excluded.evidence_json END,
      attempted_at = excluded.attempted_at
  `).run(evidence?.source.sha256 ?? null, evidence?.gridStatus ?? 'failed', evidence ? JSON.stringify(evidence) : null,
    Date.now(), id, sourceBytes).changes === 1;
}
