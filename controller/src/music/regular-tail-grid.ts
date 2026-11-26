/** Queue-time grid coverage for regular stems. One bounded grid refresh at
 * a time; no Demucs, library-wide scan, or changes to the measured fade cue.
 */
import * as analyzer from './analyzer.js';
import * as db from './library-db.js';
import type { TrackRecord } from './library-db.js';
import type { BeatGridProvenance } from '../schemas/beat-grid.js';
import { BoundedKeyMap } from '../util/bounded-key-map.js';
import { bulkPassRunning } from './tagger-lock.js';
import { acquireRegularStemSource, retainRegularStemSources } from './regular-stem-source.js';
import { upgradePending } from './beat-grid-upgrade.js';
import { readStemBlendTailAdmission } from './library-db/stem-blend-admission.js';
import { eightBarWindow } from '../broadcast/regular-stem-policy.js';

const failures = new BoundedKeyMap<number>({ maxKeys: 2048, isLive: (until, now) => until > now });
let running: { id: string; work: Promise<void> } | null = null;
const current = (grid?: BeatGridProvenance | null) => grid?.backend === 'beat-this-onnx'
  && grid.model === 'small0' && grid.preprocessingVersion === 1;

// Use the same prepared tail for extraction and rendering. A cue takes
// precedence over measured music end, which is used for tracks without a fade.
export function preparedRegularTail(id: string, durationMs: number) {
  const evidence = readStemBlendTailAdmission(id);
  if (evidence?.gridStatus !== 'measured' || evidence.musicStartMs === null) return null;
  const grid = evidence.gridProvenance;
  const startMs = evidence.cueMs ?? evidence.musicEndMs;
  if (!grid || !current(grid) || startMs === null) return null;
  const musicStartMs = evidence.musicStartMs;
  const bars = evidence.bars.filter(bar => bar >= musicStartMs);
  if (!eightBarWindow(bars, {
    startMs: grid.windowStartMs,
    endMs: Math.min(startMs, grid.windowEndMs - 1, durationMs),
  }, 'tail')) return null;
  return { startMs, bars, gridProvenance: grid, lufs: null };
}

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

export function regularTailGridPending(id?: string): boolean { return id == null ? !!running : running?.id === id; }

export function queueRegularGridForLibraryScan(id: string): void {
  if (regularGridAwaiting(id, true)) db.enqueueRegularGridScan(id);
}

export function regularHeadGridSeconds(row: Pick<TrackRecord, 'bars'>): number {
  const bars = row.bars ?? [];
  const intervals = bars.slice(1).map((bar, index) => bar-bars[index])
    .filter(ms => Number.isFinite(ms) && ms > 0).sort((a, b) => a-b);
  return Math.min(120, Math.max(60, Math.ceil(((bars[0] ?? 0)
    + 10 * (intervals[Math.floor(intervals.length/2)] ?? 4000))/1000)));
}

export function headGridNeedsRepair(
  row: Pick<TrackRecord, 'beats' | 'bars' | 'gridProvenance' | 'durationSec'>,
  fileSize: number | null,
): boolean {
  const grid = row.gridProvenance;
  if (!current(grid) || !grid?.source?.complete || !Array.isArray(row.beats) || !Array.isArray(row.bars)) return true;
  if (fileSize != null && grid.source.bytes !== fileSize) return true;
  if (grid.windowStartMs !== 0) return true;
  return !grid.reachesSourceEnd
    && !eightBarWindow(row.bars, { startMs: grid.windowStartMs, endMs: grid.windowEndMs - 1 }, 'head')
    && grid.windowEndMs < Math.min(regularHeadGridSeconds(row)*1000, (row.durationSec ?? 0)*1000)-2;
}

export function saveRegularHeadGrid(
  id: string, answer: analyzer.FacetAnalysis, source: { sha256: string; bytes: number },
  requestedSeconds: number, fileSize: number | null,
): { markers: number; eightBars: boolean } {
  const head = answer.facets.head, grid = head?.result.gridProvenance;
  const window = Math.min(requestedSeconds, answer.source.durationS ?? requestedSeconds) * 1000;
  if (head?.status !== 'ok' || !Array.isArray(head.result.beats) || !Array.isArray(head.result.bars)
      || !current(grid) || !grid?.source?.complete || grid.source.sha256 !== source.sha256
      || grid.source.bytes !== source.bytes || grid.windowStartMs !== 0
      || grid.windowEndMs < window - 2 || grid.windowEndMs > requestedSeconds * 1000 + 1
      || !db.writeRegularHeadGrid(id, {
        beats: head.result.beats, bars: head.result.bars, gridProvenance: grid }, fileSize)) {
    throw new Error(head?.reason ?? 'complete head grid unavailable');
  }
  return { markers: head.result.bars.length, eightBars: !!eightBarWindow(head.result.bars,
    { startMs: grid.windowStartMs, endMs: grid.windowEndMs - 1 }, 'head') };
}

export function regularHeadGridAwaiting(id: string): boolean {
  const row = db.getTrack(id);
  return !!row && regularGridAwaiting(id) && headGridNeedsRepair(row, db.trackFileSize(id));
}

export function regularGridAwaiting(id: string, libraryScan = false): boolean {
  if (running?.id === id) return true;
  if (!libraryScan && (bulkPassRunning() || (failures.get(id) ?? 0) > Date.now())) return false;
  const row = db.getTrack(id), head = row?.gridProvenance;
  if (!row) return false;
  if (headGridNeedsRepair(row, db.trackFileSize(id))) return true;
  if (preparedRegularTail(id, (row.durationSec ?? 0) * 1000)) return false;
  const grid = row.outro?.gridProvenance;
  const endMs = analyzer.tailWindowFor(row)?.endMs ?? grid?.windowEndMs ?? (row.durationSec ?? 0) * 1000;
  const wantedMs = Math.min(regularTailGridSeconds(row) * 1000, endMs);
  return !current(grid) || !grid?.source?.complete || grid.source.sha256 !== head?.source?.sha256
    || grid.source.bytes !== head?.source?.bytes
    || grid.windowEndMs-grid.windowStartMs < wantedMs-2;
}

export function regularTailGridDue(id: string, libraryScan = false): boolean {
  return !running && (libraryScan || !upgradePending()) && regularGridAwaiting(id, libraryScan);
}

export function ensureRegularTailGrid(id: string, log: (message: string) => void, wake: () => void,
  deadlineMs?: number, shouldContinue: () => boolean = () => true, libraryScan = false): Promise<void> {
  if (!shouldContinue() || !regularTailGridDue(id, libraryScan)) return Promise.resolve();
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
      if (!shouldContinue()) return;
      const options = () => {
        const timeoutMs = Math.floor(Math.min(300_000, (deadlineMs ?? Date.now()+300_000)-Date.now()));
        if (timeoutMs <= 0) throw new Error('regular grid preparation deadline passed');
        return { localPathRequired: true, complete: true, timeoutMs };
      };
      if (headGridNeedsRepair(row, fileSize)) {
        try {
          const headSeconds = regularHeadGridSeconds(row);
          log(`Regular stems: measuring head grid for ${label}`);
          const request = options();
          completed = false;
          const result = await analyzer.analyzeFacets(id, { ...request, facets: ['head'], headGridSeconds: headSeconds }, source.path);
          completed = true;
          const head = saveRegularHeadGrid(id, result, source, headSeconds, fileSize);
          log(head.markers
            ? `Regular stems: head grid ready for ${label}`
            : `Regular stems: head window measured for ${label}, but no usable beat grid was found`);
          wake();
        } catch (error) {
          if (error instanceof analyzer.AnalyzerJobRejectedError) completed = true;
          log(`Regular stems: head grid unavailable for ${label}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (!shouldContinue()) return;
      log(`Regular stems: measuring ${seconds}s tail grid for ${label}`);
      const request = options();
      completed = false;
      const result = await analyzer.analyzeFacets(id, { ...request, facets: ['tail'], tailGridSeconds: seconds,
        tailWindow: analyzer.tailWindowFor(row) }, source.path);
      completed = true;
      const tail = result.facets.tail, outro = tail?.result.outro, grid = outro?.gridProvenance;
      const wantedMs = Math.min(seconds * 1000, grid?.windowEndMs ?? seconds * 1000);
      if (tail?.status !== 'ok' || !Array.isArray(outro?.beats) || !Array.isArray(outro.bars) || !current(grid) || !grid?.source?.complete
          || grid.source.sha256 !== source.sha256 || grid.source.bytes !== source.bytes
          || grid.windowEndMs-grid.windowStartMs < wantedMs-2) {
        throw new Error(tail?.reason ?? 'analyzer did not return the extended grid; rebuild the analyzer');
      }
      if (!db.writeRegularTailGrid(id, outro, fileSize)) throw new Error('recording changed during tail measurement');
      failures.delete(id);
      log(outro.beats.length && outro.bars.length
        ? `Regular stems: tail grid ready for ${label} (${outro.bars.length} measured markers)`
        : `Regular stems: tail window measured for ${label}, but no usable beat grid was found`);
    } catch (error) {
      if (error instanceof analyzer.AnalyzerJobRejectedError) completed = true;
      failures.set(id, Date.now() + 5 * 60_000);
      log(`Regular stems: tail grid unavailable for ${label}: ${error instanceof Error ? error.message : String(error)}`);
    } finally { await source?.release(completed).catch(error => log(`Regular stems source cleanup unavailable: ${String(error)}`)); }
  })().finally(() => { running = null; wake(); });
  running = { id, work };
  return work;
}

/** Process the durable set of missing/short grids during a library analysis run. */
export async function prepareRegularTailGridsForLibraryScan(
  log: (message: string) => void,
  limit?: number,
  report: (done: number, total: number, errors: number) => void = () => {},
): Promise<{ queued: number; completed: number }> {
  const ids = db.regularGridScanIds();
  const pending = ids.filter(id => {
    if (regularGridAwaiting(id, true)) return true;
    db.removeRegularGridScan(id);
    return false;
  });
  const selected = Number.isFinite(limit) && (limit as number) > 0 ? pending.slice(0, limit) : pending;
  if (selected.length === 0) return { queued: 0, completed: 0 };
  log(`Regular stems: library catch-up queued ${selected.length} pick-time track${selected.length === 1 ? '' : 's'} for tail-grid coverage`);
  report(0, selected.length, 0);
  let completed = 0;
  let attempted = 0;
  for (const id of selected) {
    retainRegularStemSources(null, [id]);
    await ensureRegularTailGrid(id, log, () => {}, undefined, () => true, true);
    attempted++;
    if (!regularGridAwaiting(id, true)) {
      completed++;
      db.removeRegularGridScan(id);
    }
    report(attempted, selected.length, attempted-completed);
  }
  retainRegularStemSources(null, []);
  log(`Regular stems: library catch-up complete (${completed}/${selected.length} ready)`);
  return { queued: selected.length, completed };
}
