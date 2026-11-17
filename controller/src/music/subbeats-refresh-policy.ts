// Explicit, selected timing refreshes share the managed queue. No library walk
// is admitted here; old evidence stays available until a replacement succeeds.
import { SUBBEATS_CUE_ALGORITHM_VERSION } from '../schemas/subbeats.js';
import type { SubbeatsJob } from './subbeats-store.js';

export function subbeatsTimingCurrent(job: Pick<SubbeatsJob, 'status' | 'cuePoints'>): boolean {
  return (job.status === 'prepared' || job.status === 'unmeasurable')
    && job.cuePoints?.model === 'small0'
    && job.cuePoints.algorithmVersion === SUBBEATS_CUE_ALGORITHM_VERSION
    && job.cuePoints.durationSeconds != null;
}

// Keep a previously prepared snapshot available while only its timing is
// queued/running. Failed and unmeasurable entries retain their failure policy.
// The renderer still verifies source identity, coverage and passage evidence.
export function savedSubbeatsTimingForPlayback(job: SubbeatsJob): SubbeatsJob {
  return job.task === 'timing' && job.refreshFrom === 'prepared'
    && (job.status === 'queued' || job.status === 'running' || job.status === 'failed')
    && job.bundleKey && job.cuePoints && job.cueCoverage
    ? { ...job, status:'prepared' } : job;
}
