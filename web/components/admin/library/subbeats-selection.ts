import type { z } from 'zod';
import { SUBBEATS_BATCH_LIMIT, SUBBEATS_QUEUE_LIMIT, type subbeatsCandidateSchema, type subbeatsJobSchema } from '../../../lib/schemas.generated';

export type SubbeatsCandidate = z.infer<typeof subbeatsCandidateSchema>;
type Job = Pick<z.infer<typeof subbeatsJobSchema>, 'id' | 'status'>;

export const subbeatsCanSelect = (status: string) => ['not-started', 'failed', 'unavailable'].includes(status);

// One capacity rule for row, page and matching selection. Retrying an existing
// entry consumes a batch place, but never another saved-list place.
export function selectSubbeatsRows(current: SubbeatsCandidate[], added: SubbeatsCandidate[], jobs: Job[]): SubbeatsCandidate[] {
  const known = new Map(jobs.map(job => [job.id, job.status]));
  const chosen = new Map<string, SubbeatsCandidate>();
  let free = Math.max(0, SUBBEATS_QUEUE_LIMIT - known.size);
  for (const row of [...current, ...added]) {
    if (chosen.has(row.id) || !subbeatsCanSelect(known.get(row.id) ?? row.status)) continue;
    if (chosen.size >= SUBBEATS_BATCH_LIMIT) break;
    if (!known.has(row.id)) { if (!free) continue; free--; }
    chosen.set(row.id, row);
  }
  return [...chosen.values()];
}
