// Managed Sub/Beats child: reads the controller-owned list, reports outcomes on
// stdio. No ordinary analysis writes, tagging, library walk or normal stem sweep.
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { config } from '../config.js';
import { readSubbeatsQueue } from './subbeats-store.js';
import * as analyzer from './analyzer.js';
import { waitForQuiet, type QuietGate } from './analyze.js';
import { loadSecretsIntoEnv } from '../setup/secrets.js';
import { loadNavidromeConfig } from '../setup/config.js';
import * as settings from '../settings.js';
import { reportProgress, reportEvent } from './tagger-progress.js';
import { SUBBEATS_EVENT_PREFIX, subbeatsEnqueueSchema } from '../schemas/subbeats.js';
import { acquireStandaloneLock, installPidfileCleanup } from './tagger-lock.js';

async function main() {
  const ids = subbeatsEnqueueSchema.parse({ ids: process.argv.slice(2) }).ids;
  await loadSecretsIntoEnv();
  await loadNavidromeConfig();
  await settings.load();
  if (acquireStandaloneLock('analyze', process.argv.slice(2))) installPidfileCleanup();
  const cacheId = readFileSync(join(config.stateDir, 'subbeats', '.cache-id'), 'utf8').trim();
  const gate: QuietGate = { state: { quietSince: null }, paused: false };
  const emit = (event: object) => console.log(SUBBEATS_EVENT_PREFIX + JSON.stringify(event));
  let done = 0;
  const capable = await analyzer.subbeatsAvailable();
  for (const id of ids) {
    const state = readSubbeatsQueue(config.stateDir);
    if (state.paused) break;
    const job = state.jobs.find(j => j.id === id);
    if (job?.status !== 'queued') continue;
    if (!await waitForQuiet(gate, { done, total: ids.length }, () => readSubbeatsQueue(config.stateDir).paused)) break;
    reportProgress({ phase: 'analyze', label: `Preparing Sub/Beats: ${job.artist} — ${job.title}`, done, total: ids.length });
    emit({ id, status: 'running' });
    let localPath: string | null = null;
    try {
      if (!capable) {
        emit({ id, status: 'unavailable', error: 'Sub/Beats needs an updated heavy analyzer' });
        continue;
      }
      const source = await analyzer.downloadCapped(id, { maxBytes: 256 * 1024 * 1024, timeoutMs: 5 * 60_000 });
      localPath = source.path;
      if (!source.complete) {
        emit({ id, status: 'unavailable', error: 'The complete recording exceeds the Sub/Beats download limit (256 MB)' });
        continue;
      }
      emit({ id, ...await analyzer.prepareSubbeats(localPath, config.stateDir, cacheId) });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      reportEvent({ kind: 'error', text: `${job.artist} — ${job.title}: ${message}` });
      emit({ id, status: 'failed', error: message.slice(0, 1000) });
    } finally {
      if (localPath) await rm(localPath, { force: true }).catch(() => {});
      done++;
    }
  }
  reportProgress({ phase: 'done', label: 'Sub/Beats preparation finished', done, total: ids.length });
  analyzer.shutdown();
}

main().catch(error => { console.error(`[error] ${error.message}`); analyzer.shutdown(); process.exitCode = 1; });
