/** Queue-time grid coverage for regular stems. One bounded CPU grid refresh at
 * a time; no Demucs, library-wide scan, or changes to the measured fade cue.
 */
import * as analyzer from './analyzer.js';
import * as db from './library-db.js';
import type { TrackRecord } from './library-db.js';
import type { BeatGridProvenance } from '../schemas/beat-grid.js';
import { BoundedKeyMap } from '../util/bounded-key-map.js';
import { bulkPassRunning } from './tagger-lock.js';

const failures = new BoundedKeyMap<number>({ maxKeys: 2048, isLive: (until, now) => until > now });
let running: { id: string; work: Promise<void> } | null = null;
const current = (grid?: BeatGridProvenance | null) => grid?.backend === 'beat-this-onnx'
  && grid.model === 'small0' && grid.preprocessingVersion === 1;

export function regularTailGridSeconds(row: Pick<TrackRecord, 'outro'>): number {
  const tail = row.outro, grid = tail?.gridProvenance;
  const intervals = (tail?.bars ?? []).slice(1).map((bar, i) => bar - tail!.bars![i])
    .filter(ms => Number.isFinite(ms) && ms > 0).sort((a, b) => a-b);
  // Existing measured spacing only sizes the next analysis. It never supplies
  // invented bars to the renderer. Two extra bars leave room for alignment.
  const barMs = intervals[Math.floor(intervals.length / 2)] ?? 4000;
  const fadeMs = Math.max(0, (grid?.windowEndMs ?? 0) - (tail?.startMs ?? 0));
  return Math.min(120, Math.max(60, Math.ceil((10 * barMs + fadeMs) / 1000)));
}

export function regularTailGridPending(id: string): boolean { return running?.id === id; }

export function regularTailGridDue(id: string): boolean {
  if (running || bulkPassRunning() || (failures.get(id) ?? 0) > Date.now() || db.subbeatsEligibleTrack(id)) return false;
  const row = db.getTrack(id), head = row?.gridProvenance;
  if (!row || !current(head) || !head?.source?.complete) return false;
  const grid = row.outro?.gridProvenance;
  const endMs = analyzer.tailWindowFor(row)?.endMs ?? grid?.windowEndMs ?? (row.durationSec ?? 0) * 1000;
  const wantedMs = Math.min(regularTailGridSeconds(row) * 1000, endMs);
  return !current(grid) || !grid?.source?.complete || grid.source.sha256 !== head.source.sha256
    || grid.source.bytes !== head.source.bytes
    || grid.windowEndMs-grid.windowStartMs < wantedMs-2;
}

export function ensureRegularTailGrid(id: string, log: (message: string) => void, wake: () => void): void {
  if (!regularTailGridDue(id)) return;
  const row = db.getTrack(id)!;
  const label = [row.title, row.artist].filter(Boolean).join(' — ') || id;
  const seconds = regularTailGridSeconds(row);
  const work = (async () => {
    try {
      log(`Regular stems: measuring ${seconds}s tail grid for ${label}`);
      const result = await analyzer.analyzeFacets(id, { facets: ['tail'], tailGridSeconds: seconds,
        tailWindow: analyzer.tailWindowFor(row) });
      const tail = result.facets.tail, outro = tail?.result.outro, grid = outro?.gridProvenance;
      const wantedMs = Math.min(seconds * 1000, grid?.windowEndMs ?? seconds * 1000);
      if (tail?.status !== 'ok' || !outro?.beats?.length || !outro.bars?.length || !current(grid) || !grid?.source?.complete
          || grid.windowEndMs-grid.windowStartMs < wantedMs-2) {
        throw new Error(tail?.reason ?? 'analyzer did not return the extended grid; rebuild the analyzer');
      }
      if (db.subbeatsEligibleTrack(id) || !db.writeRegularTailGrid(id, outro)) throw new Error('recording or admission changed during tail measurement');
      failures.delete(id);
      log(`Regular stems: tail grid ready for ${label} (${outro.bars?.length ?? 0} measured markers)`);
    } catch (error) {
      failures.set(id, Date.now() + 5 * 60_000);
      log(`Regular stems: tail grid unavailable for ${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  })().finally(() => { running = null; wake(); });
  running = { id, work };
}
