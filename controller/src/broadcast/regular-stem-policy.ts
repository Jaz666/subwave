// Regular blends use measured eight-bar spans at native tempo. This policy
// never infers bars from BPM, and keeps queue retention separate from jobs.
import type { BeatGridProvenance } from '../schemas/beat-grid.js';
import { bpmCompat } from '../music/mix.js';

export const REGULAR_STEM_WORKING_TRACKS = 9;
export type RegularStemStyle = 'drums-late' | 'rhythm-late' | 'vocals-late';
export const REGULAR_STEM_STYLES: readonly RegularStemStyle[] = ['drums-late', 'rhythm-late', 'vocals-late'];

// Match vanilla's three-percent tempo tolerance, using only the measured
// outgoing tail and incoming head grids. Half/double time is handled by bpmCompat.
export function regularStemTempoDecision(
  tail: BeatGridProvenance | null | undefined,
  head: BeatGridProvenance | null | undefined,
) {
  const bpm = (grid: BeatGridProvenance | null | undefined): number | null => {
    const value = grid?.evidence.medianBpm;
    return grid?.backend === 'beat-this-onnx' && grid.model === 'small0' && grid.preprocessingVersion === 1
      && typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
  };
  const outBpm = bpm(tail), inBpm = bpm(head);
  const reason = outBpm == null || inBpm == null
    ? `shared beat grid BPM missing (outgoing tail ${outBpm ?? 'unknown'}, incoming head ${inBpm ?? 'unknown'})`
    : bpmCompat(outBpm, inBpm) < 0.7
      ? `shared grid tempo incompatible (outgoing tail ${outBpm} BPM, incoming head ${inBpm} BPM; half/double checked)`
      : null;
  return { eligible: reason === null, reason, outBpm, inBpm };
}

export interface RegularStemWindow {
  startMs: number;
  endMs: number;
}

// Malformed or unordered evidence is not repaired into an apparently usable
// grid. sourceStart/end are actual measured coverage, not tagged duration.
export function eightBarWindow(
  bars: readonly number[],
  coverage: RegularStemWindow,
  side: 'head' | 'tail',
): RegularStemWindow | null {
  if (!Number.isFinite(coverage.startMs) || !Number.isFinite(coverage.endMs)
    || coverage.startMs < 0 || coverage.endMs <= coverage.startMs
    || bars.some((bar, i) => !Number.isFinite(bar) || bar < 0 || (i > 0 && bar <= bars[i - 1]))) return null;
  const starts = Array.from({ length: Math.max(0, bars.length - 8) }, (_, i) => i);
  if (side === 'tail') starts.reverse();
  for (const i of starts) {
    if (bars[i] >= coverage.startMs && bars[i + 8] <= coverage.endMs) {
      return { startMs: bars[i], endMs: bars[i + 8] };
    }
  }
  return null;
}

export type RegularStemPairDecision =
  | { eligible: true }
  | { eligible: false; reason: 'track-ineligible' };

// Sub/Beats discovery never reserves either role. The queue tries that renderer
// first, then evaluates a complete regular pair using its own grids and windows.
// Neither path combines a Sub/Beats role with a regular role.
export function regularStemPairDecision(
  out: { regularEligible: boolean },
  incoming: { regularEligible: boolean },
): RegularStemPairDecision {
  if (!out.regularEligible || !incoming.regularEligible) return { eligible: false, reason: 'track-ineligible' };
  return { eligible: true };
}

// FIFO membership, never job-arrival order. The queue owns its eight-slot
// ceiling; an oversized snapshot is rejected rather than evicting an active
// ninth queued track behind the mixer's back. Duplicate recordings share audio.
export function regularStemWorkingIds(currentId: string | null, queuedIds: readonly string[]): ReadonlySet<string> {
  if (queuedIds.length > REGULAR_STEM_WORKING_TRACKS - 1) throw new Error('regular stem working set exceeds eight queued tracks');
  return new Set([...(currentId ? [currentId] : []), ...queuedIds].filter(Boolean));
}
