import { SUBBEATS_BATCH_LIMIT } from '../schemas/subbeats.js';

type QueuedJob = { id: string; status: string; task?: string };

/** Preparation runs after a Library Demucs scan; read-only assessments stay immediate. */
export function runnableSubbeatsJobs(
  jobs: readonly QueuedJob[],
  libraryReady: ReadonlySet<string>,
  limit = SUBBEATS_BATCH_LIMIT,
): string[] {
  return jobs.filter(job => job.status === 'queued'
    && (job.task === 'assess' || libraryReady.has(job.id)))
    .slice(0, limit).map(job => job.id);
}

export function queuedSubbeatsForScan(
  jobs: readonly QueuedJob[],
  scope?: ReadonlySet<string> | null,
  limit?: number,
): string[] {
  const queued = jobs.filter(job => job.status === 'queued' && job.task !== 'assess'
    && (!scope || scope.has(job.id))).map(job => job.id);
  return Number.isFinite(limit) && (limit as number) > 0 ? queued.slice(0, Math.floor(limit!)) : queued;
}

export function suppressRegularStems(trackId: string, queuedSubbeats: ReadonlySet<string>): boolean {
  return queuedSubbeats.has(trackId);
}
