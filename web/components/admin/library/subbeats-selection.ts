import type { z } from 'zod';
import { SUBBEATS_BATCH_LIMIT, SUBBEATS_QUEUE_LIMIT, type subbeatsCandidateSchema, type subbeatsJobSchema, type subbeatsCuePointSchema } from '../../../lib/schemas.generated';

export type SubbeatsCandidate = z.infer<typeof subbeatsCandidateSchema>;
type Job = Pick<z.infer<typeof subbeatsJobSchema>, 'id' | 'status'>;

export const subbeatsCanSelect = (status: string) => ['not-started', 'failed', 'unavailable'].includes(status);

export function subbeatsOutgoingCues(cues: readonly z.infer<typeof subbeatsCuePointSchema>[], duration: number | null | undefined) {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) return [];
  return cues.map((cue,index) => ({cue,index}))
    .filter(({cue}) => cue.sourceSeconds >= duration*.5 && cue.sourceSeconds < duration);
}

// Compare the complete retained opening after the preview's tempo adjustment.
// This orders audition choices, not harmony/vocal compatibility or pair approval.
export function subbeatsIncomingCues(cues: readonly z.infer<typeof subbeatsCuePointSchema>[], outgoing?: z.infer<typeof subbeatsCuePointSchema>) {
  const length = outgoing?.phraseEndSeconds == null ? null : outgoing.phraseEndSeconds-outgoing.sourceSeconds;
  return cues.map((cue,index) => {
    const rate = outgoing ? outgoing.bpm/cue.bpm : 1;
    const matchedSeconds = cue.sourceSeconds/rate;
    return {cue,index,tempoFits: Math.abs(rate-1) <= .08,matchedSeconds,
      differenceSeconds: length != null && length > 0 ? matchedSeconds-length : null};
  }).sort((a,b) => Number(b.tempoFits)-Number(a.tempoFits)
    || (a.differenceSeconds == null || b.differenceSeconds == null ? 0 : Math.abs(a.differenceSeconds)-Math.abs(b.differenceSeconds)) || a.index-b.index);
}

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

// Preparation actions work on existing terminal entries, independently of Explore.
export function selectPreparationIds(current: string[], added: string[], jobs: Job[]): string[] {
  const available = new Set(jobs.filter(job => !['queued', 'running'].includes(job.status)).map(job => job.id));
  return [...new Set([...current, ...added])].filter(id => available.has(id)).slice(0, SUBBEATS_BATCH_LIMIT);
}
