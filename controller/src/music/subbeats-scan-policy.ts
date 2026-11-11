type QueuedJob = { id: string; status: string; task?: string };

/** Queued preparation is released by a Demucs scan; cache-only assessments stay immediate. */
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
