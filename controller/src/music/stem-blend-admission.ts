import { join } from 'node:path';
import { regularStemWorkingMode, regularStemBlendsEnabled } from '../broadcast/regular-stem-mode.js';
import { RegularStemWorkingCache } from '../broadcast/regular-stem-working-cache.js';
import { stemBlendTailAdmissionSchema, stemBlendTailBars, type StemBlendTailAdmission } from '../schemas/stem-blend-admission.js';
import * as analyzer from './analyzer.js';
import { waitForQuiet, type QuietGate } from './analyze.js';
import * as db from './library-db.js';
import { readStemBlendTailAdmission, stemBlendAdmissionIds, writeStemBlendTailAdmission } from './library-db/stem-blend-admission.js';
import { acquireRegularStemSource } from './regular-stem-source.js';
import { regularTailGridSeconds } from './regular-tail-grid.js';
import { stemsRoot } from './stem-cache.js';
import { reportProgress, type TaggerProgress } from './tagger-progress.js';

class TailAdmissionProtocolError extends Error {}

function tailSummary(ids: readonly string[]) {
  const summary = { measured: 0, failedGrid: 0, noGrid: 0, cue: 0, fallback: 0, fourBars: 0, sixBars: 0, eightBars: 0 };
  for (const id of ids) {
    const evidence = readStemBlendTailAdmission(id);
    if (!evidence) continue;
    summary.measured++;
    if (evidence.gridStatus === 'failed') summary.failedGrid++;
    if (evidence.gridStatus === 'no-grid') summary.noGrid++;
    if (evidence.cueMs !== null) summary.cue++;
    else if (evidence.musicEndMs !== null) summary.fallback++;
    const bars = stemBlendTailBars(evidence, evidence.cueMs ?? evidence.musicEndMs);
    if (bars >= 4) summary.fourBars++;
    if (bars >= 6) summary.sixBars++;
    if (bars >= 8) summary.eightBars++;
  }
  return summary;
}

export async function prepareStemBlendAdmission(options: { ids: string[] | null; limit: number; rescan: boolean; dryRun: boolean }) {
  if (!regularStemWorkingMode() || !regularStemBlendsEnabled()) throw new Error('Enable New Style Stem Blends before preparing admission evidence');
  const selected = stemBlendAdmissionIds(options.limit, options.ids, options.rescan);
  const before = tailSummary(selected);
  if (options.dryRun) return { selected: selected.length, before };
  if (selected.length === 0) return { selected: 0, attempted: 0, errors: 0, before, after: before };
  if (!await analyzer.isAvailable()) throw new Error('Start the analyzer before preparing Stem Blend tails.');

  const cache = new RegularStemWorkingCache(join(stemsRoot(), 'stemblends', 'admission-sources'));
  const quiet: QuietGate = { state: { quietSince: null }, paused: false };
  let done = 0;
  let errors = 0;
  const active: Pick<TaggerProgress, 'phase' | 'label'> = { phase: 'grids', label: 'Preparing Stem Blend tails' };
  const progress = () => reportProgress({ ...active, done, total: selected.length, errors });
  progress();
  try {
    for (const id of selected) {
      await waitForQuiet(quiet, { done, total: selected.length }, undefined, active);
      if (!regularStemWorkingMode() || !regularStemBlendsEnabled()) break;
      const row = db.getTrack(id);
      const size = db.trackFileSize(id);
      if (row && size) {
        let source: Awaited<ReturnType<typeof acquireRegularStemSource>> | undefined;
        let completed = true;
        let evidence: StemBlendTailAdmission | null = null;
        try {
          await cache.reconcile(null, [id]);
          const headSource = row.gridProvenance?.source;
          source = await acquireRegularStemSource(id, {
            cache, expectedBytes: size,
            expectedSha256: headSource?.complete && headSource.bytes === size ? headSource.sha256 : undefined,
          });
          const seconds = regularTailGridSeconds(row);
          // Stop can end this process while the analyzer still has the source open.
          await source.markBusy();
          completed = false;
          const { facets } = await analyzer.analyzeFacets(id, {
            facets: ['tail'], tailAdmission: true, tailGridSeconds: seconds, tailWindow: analyzer.tailWindowFor(row),
            complete: true, localPathRequired: true, timeoutMs: 300_000,
          }, source.path);
          completed = true;
          if (facets.tail?.status !== 'ok') throw new Error(facets.tail?.reason ?? 'Analyzer returned no tail evidence');
          if (facets.tail.tailAdmission === undefined) {
            throw new TailAdmissionProtocolError('Analyzer does not return Stem Blend admission evidence. Rebuild the analyzer before running this scan.');
          }
          const result = stemBlendTailAdmissionSchema.safeParse(facets.tail.tailAdmission);
          if (!result.success || result.data.source.sha256 !== source.sha256
              || result.data.source.bytes !== source.bytes || result.data.requestedSeconds !== seconds) {
            throw new Error('Analyzer returned missing, invalid, or mismatched tail evidence');
          }
          evidence = result.data;
        } catch (error) {
          if (error instanceof TailAdmissionProtocolError) throw error;
          if (error instanceof analyzer.AnalyzerJobRejectedError) completed = true;
          console.warn(`[analyze] Stem Blend admission ${id}: ${String(error)}`);
        } finally {
          await source?.release(completed).catch(error => console.warn(`[analyze] Stem Blend source cleanup ${id}: ${String(error)}`));
        }
        if (!writeStemBlendTailAdmission(id, size, evidence) || !evidence || evidence.gridStatus === 'failed') errors++;
      } else errors++;
      done++;
      progress();
    }
  } finally {
    await cache.reconcile(null, []);
  }
  return { selected: selected.length, attempted: done, errors, before, after: tailSummary(selected) };
}
