/** Queue snapshot -> only the measured CPU windows needed by compatible pairs.
 * No cache or provider reads here.
 */
import { createHash } from 'node:crypto';
import type { BeatGridProvenance } from '../schemas/beat-grid.js';
import { HARD_DEADLINE_SEC } from './drain-policy.js';
import { eightBarWindow, regularStemPairDecision } from './regular-stem-policy.js';
import type { RegularStemNeed } from './regular-stem-preparation.js';

export interface RegularStemQueueEvidence {
  id: string;
  label?: string;
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
  tailGridPending?: boolean;
  headGridPending?: boolean;
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
    needs.set(key, { key, trackId: item.id, label: item.label, side, startMs, endMs,
      sourceSha256: source.sha256, sourceBytes: source.bytes,
      deadlineMs: Math.min(existing?.deadlineMs ?? deadlineMs, deadlineMs) });
  };
  for (let index = 0; index < items.length - 1; index++) {
    const item = items[index], incoming = items[index + 1];
    if (item.sent || incoming.sent || item.pairToNextAllowed !== true
        || !regularStemPairDecision(item, incoming).eligible
        || item.remainingSec == null || !Number.isFinite(item.remainingSec)
        || item.tailGridPending || incoming.headGridPending) continue;
    // Leave render + write/probe time inside the existing hard fallback.
    const deadline = now + (item.remainingSec - HARD_DEADLINE_SEC - 10) * 1000;
    const tail = item.tailGrid && eightBarWindow(item.tailBars,
      { startMs: item.tailGrid.windowStartMs, endMs: Math.min(item.tailGrid.windowEndMs, item.windDownMs) }, 'tail');
    const head = incoming.headGrid && eightBarWindow(incoming.bars,
      { startMs: incoming.headGrid.windowStartMs, endMs: incoming.headGrid.windowEndMs }, 'head');
    if (tail && item.tailGrid) add(item, 'tail', tail.startMs, tail.endMs, deadline, item.tailGrid);
    if (head && tail && incoming.headGrid) {
      // The rendered clip lasts for the outgoing eight bars. Keep the incoming
      // head's first eight bars when longer, and extend it when the tail lasts
      // longer (including a clean half/double-time BPM equivalent).
      const endMs = Math.max(head.endMs, head.startMs + tail.endMs - tail.startMs);
      add(incoming, 'head', head.startMs, endMs, deadline, incoming.headGrid);
    }
  }
  return [...needs.values()];
}
