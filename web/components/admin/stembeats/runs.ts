export type StemBeatsCueRole = {
  status: string;
  gridArtifact: string | null;
  cuePoints: { sourceSeconds: number; timingValidated?: boolean }[];
};

export type StemBeatsJob = {
  id: string;
  title: string;
  artist: string;
  album: string;
  status: string;
  source: { sha256: string; bytes: number; durationSeconds: number } | null;
  roles: { incoming: StemBeatsCueRole; outgoing: StemBeatsCueRole };
};

export type StemBeatsRun = {
  runId: string;
  createdAt: string;
  status: 'queued' | 'running' | 'complete' | 'paused' | 'failed';
  scope?: string;
  algorithmVersion: number;
  airplay?: boolean;
  waitingForPickTime?: boolean;
  waitingReason?: 'pick-time' | 'automatic-preparation' | null;
  currentJob?: { title: string; artist: string; status: string } | null;
  jobs?: StemBeatsJob[];
  total?: number;
  counts?: { queued?: number; running?: number; complete: number; failed: number; sourceChanged: number; incomingReady: number; outgoingReady: number };
  timing?: { averagePrepMs?: number | null };
};

export const stemBeatsRunsKey = ['library', 'stembeats', 'runs'] as const;

function roleHasCue(job: StemBeatsJob, role: 'incoming' | 'outgoing'): boolean {
  const prepared = job.roles[role];
  if (prepared.status !== 'cue-ready' || !prepared.gridArtifact || !job.source) return false;
  return prepared.cuePoints.some(cue => cue.timingValidated !== false
    && (role !== 'outgoing' || cue.sourceSeconds >= job.source!.durationSeconds / 2)
    && cue.sourceSeconds < job.source!.durationSeconds);
}

// Keep this list aligned with the controller's pick-time-supported V2 versions.
export function latestStemBeatsCueTracks(runs: StemBeatsRun[]) {
  const latest = new Map<string, { createdAt: string; runId: string; job: StemBeatsJob }>();
  for (const run of runs) {
    if (run.algorithmVersion !== 3 && run.algorithmVersion !== 4) continue;
    for (const job of run.jobs ?? []) {
      if (job.status !== 'complete' || !job.source) continue;
      const previous = latest.get(job.id);
      if (!previous || run.createdAt >= previous.createdAt) {
        latest.set(job.id, { createdAt: run.createdAt, runId: run.runId, job });
      }
    }
  }
  return [...latest.values()]
    .filter(({ job }) => roleHasCue(job, 'incoming') || roleHasCue(job, 'outgoing'))
    .map(({ createdAt, runId, job }) => ({
      ...job,
      preparedAt: createdAt,
      runId,
      incomingReady: roleHasCue(job, 'incoming'),
      outgoingReady: roleHasCue(job, 'outgoing'),
    }))
    .sort((a, b) => a.artist.localeCompare(b.artist) || a.album.localeCompare(b.album) || a.title.localeCompare(b.title));
}
