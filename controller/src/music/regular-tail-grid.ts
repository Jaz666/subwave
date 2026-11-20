/** Queue-time grid coverage for regular stems. One bounded CPU grid refresh at
 * a time; no Demucs, library-wide scan, or changes to the measured fade cue.
 */
import * as analyzer from './analyzer.js';
import * as db from './library-db.js';
import type { TrackRecord } from './library-db.js';
import type { BeatGridProvenance } from '../schemas/beat-grid.js';
import { BoundedKeyMap } from '../util/bounded-key-map.js';
import { bulkPassRunning } from './tagger-lock.js';
import { acquireRegularStemSource } from './regular-stem-source.js';

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

export function regularHeadGridAwaiting(id: string): boolean {
  const row = db.getTrack(id), grid = row?.gridProvenance;
  return regularGridAwaiting(id) && (!current(grid) || !grid?.source?.complete
    || !row?.beats?.length || !row.bars?.length);
}

export function regularGridAwaiting(id: string): boolean {
  if (running?.id === id) return true;
  if (bulkPassRunning() || (failures.get(id) ?? 0) > Date.now()) return false;
  const row = db.getTrack(id), head = row?.gridProvenance;
  if (!row) return false;
  if (!current(head) || !head?.source?.complete || !row.beats?.length || !row.bars?.length) return true;
  const grid = row.outro?.gridProvenance;
  const endMs = analyzer.tailWindowFor(row)?.endMs ?? grid?.windowEndMs ?? (row.durationSec ?? 0) * 1000;
  const wantedMs = Math.min(regularTailGridSeconds(row) * 1000, endMs);
  return !current(grid) || !grid?.source?.complete || grid.source.sha256 !== head.source.sha256
    || grid.source.bytes !== head.source.bytes
    || grid.windowEndMs-grid.windowStartMs < wantedMs-2;
}

export function regularTailGridDue(id: string): boolean {
  return !running && regularGridAwaiting(id);
}

export function ensureRegularTailGrid(id: string, log: (message: string) => void, wake: () => void, deadlineMs?: number): void {
  if (!regularTailGridDue(id)) return;
  const row = db.getTrack(id)!;
  const label = [row.title, row.artist].filter(Boolean).join(' — ') || id;
  const seconds = regularTailGridSeconds(row);
  const work = (async () => {
    let source: Awaited<ReturnType<typeof acquireRegularStemSource>> | undefined;
    let completed = true;
    const fileSize = db.trackFileSize(id);
    try {
      source = await acquireRegularStemSource(id, { deadlineMs, log,
        expectedSha256: row.gridProvenance?.source?.complete ? row.gridProvenance.source.sha256 : undefined });
      const options = () => {
        const timeoutMs = Math.floor(Math.min(300_000, (deadlineMs ?? Date.now()+300_000)-Date.now()));
        if (timeoutMs <= 0) throw new Error('regular grid preparation deadline passed');
        return { localPathRequired: true, complete: true, timeoutMs };
      };
      if (!current(row.gridProvenance) || !row.gridProvenance?.source?.complete || !row.beats?.length || !row.bars?.length) {
        log(`Regular stems: measuring head grid for ${label}`);
        const request = options();
        completed = false;
        const result = await analyzer.analyzeFacets(id, { ...request, facets: ['head'] }, source.path);
        completed = true;
        const head = result.facets.head, grid = head?.result.gridProvenance;
        if (head?.status !== 'ok' || !head.result.beats?.length || !head.result.bars?.length
            || !current(grid) || !grid?.source?.complete || grid.source.sha256 !== source.sha256
            || grid.source.bytes !== source.bytes || !db.writeRegularHeadGrid(id, {
              beats: head.result.beats, bars: head.result.bars, gridProvenance: grid }, fileSize))
          throw new Error(head?.reason ?? 'complete head grid unavailable');
        log(`Regular stems: head grid ready for ${label}`);
        wake();
      }
      log(`Regular stems: measuring ${seconds}s tail grid for ${label}`);
      const request = options();
      completed = false;
      const result = await analyzer.analyzeFacets(id, { ...request, facets: ['tail'], tailGridSeconds: seconds,
        tailWindow: analyzer.tailWindowFor(row) }, source.path);
      completed = true;
      const tail = result.facets.tail, outro = tail?.result.outro, grid = outro?.gridProvenance;
      const wantedMs = Math.min(seconds * 1000, grid?.windowEndMs ?? seconds * 1000);
      if (tail?.status !== 'ok' || !outro?.beats?.length || !outro.bars?.length || !current(grid) || !grid?.source?.complete
          || grid.source.sha256 !== source.sha256 || grid.source.bytes !== source.bytes
          || grid.windowEndMs-grid.windowStartMs < wantedMs-2) {
        throw new Error(tail?.reason ?? 'analyzer did not return the extended grid; rebuild the analyzer');
      }
      if (!db.writeRegularTailGrid(id, outro, fileSize)) throw new Error('recording changed during tail measurement');
      failures.delete(id);
      log(`Regular stems: tail grid ready for ${label} (${outro.bars?.length ?? 0} measured markers)`);
    } catch (error) {
      if (error instanceof analyzer.AnalyzerJobRejectedError) completed = true;
      failures.set(id, Date.now() + 5 * 60_000);
      log(`Regular stems: tail grid unavailable for ${label}: ${error instanceof Error ? error.message : String(error)}`);
    } finally { await source?.release(completed).catch(error => log(`Regular stems source cleanup unavailable: ${String(error)}`)); }
  })().finally(() => { running = null; wake(); });
  running = { id, work };
}
