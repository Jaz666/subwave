// Regular blends use measured eight-bar spans at native tempo. This policy
// never infers bars from BPM, and keeps queue retention separate from jobs.
export const REGULAR_STEM_WORKING_TRACKS = 9;
export type RegularStemStyle = 'drums-late' | 'rhythm-late' | 'vocals-late';
export const REGULAR_STEM_STYLES: readonly RegularStemStyle[] = ['drums-late', 'rhythm-late', 'vocals-late'];

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
  | { eligible: false; reason: 'subbeats-reserved' | 'track-ineligible' };

// The caller supplies the authoritative Sub/Beats admission result. Saved
// coverage is deliberately not an input: unprepared dance tracks stay reserved.
export function regularStemPairDecision(
  out: { regularEligible: boolean; subbeatsEligible: boolean },
  incoming: { regularEligible: boolean; subbeatsEligible: boolean },
): RegularStemPairDecision {
  if (out.subbeatsEligible || incoming.subbeatsEligible) return { eligible: false, reason: 'subbeats-reserved' };
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
