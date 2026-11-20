// Read-only screening of one transition role. Cue and saved-coverage readiness
// are proposals: the worker still verifies artifacts, source audio, tempo and
// vocals before any handoff can be armed. No models or cache reads here.
import type { BeatGridProvenance } from '../schemas/beat-grid.js';
import type { SubbeatsJob } from './subbeats-store.js';

type RoleReason = 'grid-stale' | 'source-incomplete' | 'source-changed'
  | 'head-cue-missing' | 'tail-cue-missing' | 'tail-placement-unproven'
  | 'window-too-short' | 'role-not-prepared' | 'role-coverage-ready';

export interface SubbeatsRoleDecision {
  version: 1;
  state: 'unavailable' | 'cue-ready' | 'coverage-ready';
  reason: RoleReason;
  cueIndices: number[];
}

export function subbeatsRoleDecision(
  job: SubbeatsJob | null | undefined,
  side: 'head' | 'tail',
  grid: BeatGridProvenance | null | undefined,
  sourceBytes: number | null,
  bars: readonly number[],
): SubbeatsRoleDecision {
  const result = (state: SubbeatsRoleDecision['state'], reason: RoleReason, cueIndices: number[] = []): SubbeatsRoleDecision =>
    ({ version: 1, state, reason, cueIndices });
  if (grid?.backend !== 'beat-this-onnx' || grid.model !== 'small0' || grid.preprocessingVersion !== 1) {
    return result('unavailable', 'grid-stale');
  }
  if (!grid.source?.complete || !grid.source.bytes) return result('unavailable', 'source-incomplete');
  if (sourceBytes != null && sourceBytes !== grid.source.bytes) return result('unavailable', 'source-changed');
  const role = side === 'head' ? 'incoming' : 'outgoing';
  const missing = side === 'head' ? 'head-cue-missing' : 'tail-cue-missing';
  const points = job?.cuePoints;
  const duration = points?.durationSeconds;
  if (!points || points.model !== 'small0' || points.algorithmVersion == null || points.algorithmVersion < 5
      || !duration || !Number.isFinite(duration)) return result('unavailable', missing);
  const cues = points[role].map((cue, index) => ({ cue, index })).filter(({ cue }) =>
    cue.timingValidated !== false && Number.isFinite(cue.sourceSeconds)
    && cue.sourceSeconds > 0 && cue.sourceSeconds < duration
    && (side === 'head' || cue.sourceSeconds >= duration * .5));
  if (!cues.length) return result('unavailable', missing);
  // The tail must actually reach the complete decoded ending. A current head
  // facet or a byte-capped prefix cannot prove placement at the recording's end.
  const toleranceMs = 2;
  if (side === 'tail' && grid.windowEndMs + toleranceMs < duration * 1000) {
    return result('unavailable', 'tail-placement-unproven');
  }
  if (bars.length < 9 || bars.some((bar, index) => !Number.isFinite(bar)
    || bar < grid.windowStartMs - toleranceMs || bar > grid.windowEndMs + toleranceMs
    || (index > 0 && bar <= bars[index - 1]))) return result('unavailable', 'window-too-short');
  const covered = cues.filter(({ cue }) => {
    const startMs = side === 'head' ? 0 : cue.sourceSeconds * 1000;
    const endMs = side === 'head' ? cue.sourceSeconds * 1000 : duration * 1000;
    return startMs + toleranceMs >= grid.windowStartMs && endMs <= grid.windowEndMs + toleranceMs;
  }).map(({ index }) => index);
  if (!covered.length) return result('unavailable', 'window-too-short');
  const activity = job?.cueCoverage?.[role];
  const saved = job?.status === 'prepared' && !!job.bundleKey && !!job.cueCoverage?.artifactKey && activity
    ? covered.filter(index => activity.coverageStartSeconds <= (side === 'head' ? 0 : points[role][index].sourceSeconds) + .002
      && activity.coverageEndSeconds + .002 >= (side === 'head' ? points[role][index].sourceSeconds : duration)) : [];
  return saved.length ? result('coverage-ready', 'role-coverage-ready', saved)
    : result('cue-ready', 'role-not-prepared', covered);
}
