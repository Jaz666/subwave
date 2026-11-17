/** Queue snapshot -> exact CPU windows. No cache or provider reads here.
 * Head coverage follows the outgoing duration at native tempo; a pair rejected
 * here still leaves the incoming track eligible for its own outgoing tail.
 */
import { createHash } from 'node:crypto';
import type { BeatGridProvenance } from '../schemas/beat-grid.js';
import { eightBarWindow, regularStemPairDecision } from './regular-stem-policy.js';
import { HARD_DEADLINE_SEC } from './drain-policy.js';
import type { RegularStemNeed } from './regular-stem-preparation.js';

export interface RegularStemQueueEvidence {
  id: string;
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

export function regularStemNeeds(items: readonly RegularStemQueueEvidence[], now: number): RegularStemWindowNeed[] {
  const needs = new Map<string, RegularStemWindowNeed>();
  const add = (item: RegularStemQueueEvidence, side: 'head' | 'tail', startMs: number,
    endMs: number, deadlineMs: number, grid: BeatGridProvenance | null) => {
    const source = grid?.source;
    if (!source?.complete || !source.bytes || !/^[a-f0-9]{64}$/.test(source.sha256)
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
  for (let index = 0; index < items.length; index++) {
    const out = items[index], incoming = items[index + 1];
    if (out.sent || !out.regularEligible || out.subbeatsEligible
        || out.remainingSec == null || !Number.isFinite(out.remainingSec)) continue;
    // Leave render + write/probe time inside the existing hard fallback.
    const deadline = now + (out.remainingSec - HARD_DEADLINE_SEC - 10) * 1000;
    const tail = eightBarWindow(out.tailBars, {
      startMs: out.tailGrid?.windowStartMs ?? 0,
      endMs: Math.min(out.windDownMs, out.durationMs, out.tailGrid?.windowEndMs ?? 0),
    }, 'tail');
    if (!tail) continue;
    add(out, 'tail', tail.startMs, tail.endMs, deadline, out.tailGrid);
    if (!incoming || incoming.sent || out.pairToNextAllowed === false || !regularStemPairDecision(out, incoming).eligible) continue;
    const head = eightBarWindow(incoming.bars, {
      startMs: incoming.headGrid?.windowStartMs ?? 0,
      endMs: Math.min(incoming.durationMs, incoming.headGrid?.windowEndMs ?? 0),
    }, 'head');
    if (!head) continue;
    // No time stretch: Y contributes as many seconds as X's eight bars.
    add(incoming, 'head', head.startMs, head.startMs + tail.endMs-tail.startMs,
      deadline, incoming.headGrid);
  }
  return [...needs.values()];
}
