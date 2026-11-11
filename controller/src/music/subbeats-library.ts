// Managed Sub/Beats child: reads the controller-owned list, reports outcomes on
// stdio. Extended bundles share the ordinary cache budget; metadata stays here.
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { readSubbeatsQueue } from './subbeats-store.js';
import * as analyzer from './analyzer.js';
import * as stemCache from './stem-cache.js';
import * as library from './library.js';
import { waitForQuiet, type QuietGate } from './analyze.js';
import { loadSecretsIntoEnv } from '../setup/secrets.js';
import { loadNavidromeConfig } from '../setup/config.js';
import * as settings from '../settings.js';
import { reportProgress, reportEvent } from './tagger-progress.js';
import { SUBBEATS_EVENT_PREFIX, subbeatsEnqueueSchema } from '../schemas/subbeats.js';
import { acquireStandaloneLock, installPidfileCleanup } from './tagger-lock.js';
import { refreshPreparedSubbeatsLyrics } from './subbeats-lyric-refresh.js';

async function main() {
  const args = process.argv.slice(2);
  const ids = args.length ? subbeatsEnqueueSchema.parse({ ids:args }).ids : [];
  await loadSecretsIntoEnv();
  await loadNavidromeConfig();
  await settings.load();
  if (acquireStandaloneLock('analyze', process.argv.slice(2))) installPidfileCleanup();
  const cacheId = readFileSync(join(config.stateDir, 'subbeats', '.cache-id'), 'utf8').trim();
  const gate: QuietGate = { state: { quietSince: null }, paused: false };
  const emit = (event: object) => console.log(SUBBEATS_EVENT_PREFIX + JSON.stringify(event));
  let done = 0;
  await library.load();
  const root = await stemCache.stemsRootStatus({prepare:true});
  if (!root.online) throw new Error(root.message ?? 'Shared stem cache is offline');
  reportProgress({phase:'analyze',label:'Checking shared cache space and migrating prepared bundles',done:0,total:ids.length});
  let remaining = Math.max(0, Math.floor(stemCache.budgetBytes() - (await stemCache.usage()).bytes));
  await stemCache.markPassPending();
  let changed = false;
  let uncertain = true;
  try {
    const migrated = await analyzer.migrateSubbeatsCache(config.stateDir, cacheId, {stems_root:stemCache.stemsRoot(),remaining_bytes:remaining});
    remaining = Math.max(0, remaining - migrated.addedBytes);
    changed = migrated.addedBytes > 0; uncertain = false;
    if (migrated.migrated) console.log(`[info] Moved ${migrated.migrated} verified Sub/Beats bundles into the shared stem cache`);
    for (const id of ids) {
      const state = readSubbeatsQueue(config.stateDir);
      if (state.paused) break;
      const job = state.jobs.find(j => j.id === id);
      if (job?.status !== 'queued') continue;
      if (!await waitForQuiet(gate, { done, total: ids.length }, () => readSubbeatsQueue(config.stateDir).paused)) break;
      reportProgress({ phase: 'analyze', label: `${job.task === 'assess' ? 'Assessing suitability' : job.task === 'coverage' ? 'Upgrading cue coverage' : 'Preparing Sub/Beats'}: ${job.artist} — ${job.title}`, done, total: ids.length });
      emit({ id, status: 'running' });
      let localPath: string | null = null;
      try {
        if (job.task === 'assess' && job.bundleKey) {
          emit({id,...await analyzer.assessSubbeats(config.stateDir,cacheId,id,job.bundleKey,stemCache.stemsRoot(),job.cuePoints?.algorithmVersion && job.cuePoints.algorithmVersion >= 5 && job.cueCoverage ? {cue_key:job.cuePoints.artifactKey,coverage_key:job.cueCoverage.artifactKey} : undefined)});
          continue;
        }
        if (!await analyzer.subbeatsAvailable()) throw new Error('Update the heavy analyzer to prepare Sub/Beats stems');
        uncertain = true;
        const source = await analyzer.downloadCapped(id, { maxBytes: 256 * 1024 * 1024, timeoutMs: 5 * 60_000 });
        localPath = source.path;
        if (!source.complete) {
          emit({ id, status: 'unavailable', error: 'The complete recording exceeds the Sub/Beats download limit (256 MB)' });
          continue;
        }
        if (job.preparationMethod === 'final0') throw new Error('Requeue this track using the current Sub/Beats preparation method');
        const result = await analyzer.prepareSubbeats(localPath, config.stateDir, cacheId, id, {stems_root:stemCache.stemsRoot(), remaining_bytes:remaining},job.preparationMethod,job.task === 'coverage' && job.bundleKey && job.cuePoints ? {bundle_key:job.bundleKey,cue_key:job.cuePoints.artifactKey} : undefined);
        remaining = Math.max(0, remaining - result.addedBytes);
        changed ||= result.addedBytes > 0; uncertain = false;
        if (result.status === 'prepared' && result.bundleKey) {
          reportProgress({phase:'analyze',label:`Looking up lyrics: ${job.artist} — ${job.title}`,done,total:ids.length});
          await refreshPreparedSubbeatsLyrics(id,result.bundleKey);
        }
        emit({id, ...result});
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reportEvent({ kind: 'error', text: `${job.artist} — ${job.title}: ${message}` });
        emit({ id, status: 'failed', error: message.slice(0, 1000) });
        break; // A failed writer may have published partial results; refresh usage before retrying.
      } finally {
        if (localPath) await rm(localPath, { force: true }).catch(() => {});
        done++;
      }
    }
  } finally {
    if (changed || uncertain) await stemCache.invalidateUsageSnapshot();
    else await stemCache.settlePassWrites([]);
  }
  reportProgress({ phase: 'done', label: 'Sub/Beats preparation finished', done, total: ids.length });
  analyzer.shutdown();
}

main().catch(error => { console.error(`[error] ${error.message}`); analyzer.shutdown(); process.exitCode = 1; });
