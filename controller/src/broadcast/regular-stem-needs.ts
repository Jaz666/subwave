/** Queue snapshot -> measured CPU windows. No cache or provider reads here.
 * Each eligible recording prepares its available head and tail coverage; window
 * length and compatibility are judged when a pair is rendered.
 */
import { createHash } from 'node:crypto';
import type { BeatGridProvenance } from '../schemas/beat-grid.js';
import { HARD_DEADLINE_SEC } from './drain-policy.js';
import type { RegularStemNeed } from './regular-stem-preparation.js';

export interface RegularStemQueueEvidence {
  id: string;
  occurrence?: string; // queue occurrence, independent of reusable recording windows
  sent: boolean;
  remainingSec: number | null;
  regularEligible: boolean;
  pairToNextAllowed?: boolean;
  subbeatsEligible: boolean;
  durationMs: number;
  bars: readonly number[];
  tailBars: readonly number[];
  windDownMs: number;
  headGrid: BeatGridProvenance | null;
  tailGrid: BeatGridProvenance | null;
}
export interface RegularStemWindowNeed extends RegularStemNeed {
  startMs: number;
  endMs: number;
  sourceSha256: string;
  sourceBytes: number;
}

function currentGrid(grid: BeatGridProvenance | null | undefined): grid is BeatGridProvenance {
  return grid?.backend === 'beat-this-onnx' && grid.model === 'small0'
    && grid.preprocessingVersion === 1;
}

export function regularStemNeeds(items: readonly RegularStemQueueEvidence[], now: number): RegularStemWindowNeed[] {
  const needs = new Map<string, RegularStemWindowNeed>();
  const add = (item: RegularStemQueueEvidence, side: 'head' | 'tail', startMs: number,
    endMs: number, deadlineMs: number, grid: BeatGridProvenance | null) => {
    const source = grid?.source;
    if (!currentGrid(grid) || !source?.complete || !source.bytes || !/^[a-f0-9]{64}$/.test(source.sha256)
        || !Number.isFinite(deadlineMs) || deadlineMs <= now
        || startMs < grid!.windowStartMs || endMs > grid!.windowEndMs
        || endMs > item.durationMs || endMs <= startMs || endMs-startMs > 120000) return;
    const identity = { trackId: item.id, version: 2, model: 'htdemucs', shifts: 0, side, startMs, endMs,
      sourceSha256: source.sha256, sourceBytes: source.bytes, grid };
    const key = createHash('sha256').update(JSON.stringify(identity)).digest('hex');
    const existing = needs.get(key);
    needs.set(key, { key, trackId: item.id, side, startMs, endMs,
      sourceSha256: source.sha256, sourceBytes: source.bytes,
      deadlineMs: Math.min(existing?.deadlineMs ?? deadlineMs, deadlineMs) });
  };
  for (const item of items) {
    if (item.sent || !item.regularEligible || item.subbeatsEligible
        || item.remainingSec == null || !Number.isFinite(item.remainingSec)) continue;
    // Leave render + write/probe time inside the existing hard fallback.
    const deadline = now + (item.remainingSec - HARD_DEADLINE_SEC - 10) * 1000;
    if (item.tailGrid) add(item, 'tail', item.tailGrid.windowStartMs,
      Math.min(item.durationMs, item.tailGrid.windowEndMs), deadline, item.tailGrid);
    if (item.headGrid) add(item, 'head', item.headGrid.windowStartMs,
      Math.min(item.durationMs, item.headGrid.windowEndMs), deadline, item.headGrid);
  }
  return [...needs.values()];
}
