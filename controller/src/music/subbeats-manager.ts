// Durable admissions share the existing managed maintenance slot. The controller
// owns queue state; the child only reports per-track events and honors pause.
import { subbeatsRemovalRunning } from './subbeats-removal.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config.js';
import { createSubbeatsStore } from './subbeats-store.js';
import { runnableSubbeatsJobs } from './subbeats-scan-policy.js';
import { startSubbeats, tagger } from '../broadcast/tagger.js';
import { queue } from '../broadcast/queue.js';
import { isPidAlive, readPidfile } from './tagger-lock.js';

export const subbeatsStore = createSubbeatsStore(config.stateDir);
let migrationAttempted = false;
const libraryReady = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

export function kickSubbeats(delayMs = 0, scanIds: readonly string[] = []): void {
  for (const id of scanIds) libraryReady.add(id);
  if (delayMs === 0) migrationAttempted = false; // A manual queue/resume also retries a failed migration.
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    let admitted: string[] = [];
    try {
      const state = subbeatsStore.read();
      const ids = runnableSubbeatsJobs(state.jobs, libraryReady);
      const migrate = !migrationAttempted && existsSync(join(config.stateDir, 'subbeats', 'v1'));
      if ((state.paused || !ids.length) && !migrate) return;
      const locked = readPidfile();
      if (subbeatsRemovalRunning() || tagger.running || (locked && isPidAlive(locked.pid))) { kickSubbeats(5000); return; }
      admitted = state.paused ? [] : ids;
      migrationAttempted = true;
      subbeatsStore.cacheId();
      let reported = false;
      let budgetBlocked = false;
      startSubbeats(admitted, raw => {
        subbeatsStore.event(raw, ids); reported = true;
        const event = raw as {id:string;status?:string;error?:string};
        if (event.status === 'running') libraryReady.delete(event.id);
        budgetBlocked ||= event.status === 'queued' && !!event.error;
      }, stopped => {
        if (stopped) subbeatsStore.pause(true);
        if (!reported && !subbeatsStore.read().paused) subbeatsStore.failQueued(ids, 'Preparation could not start. Check the analysis log, then queue again.');
        subbeatsStore.interrupted('Preparation was interrupted. Queue this track again to retry.');
        if (!budgetBlocked) kickSubbeats(1000);
      });
    } catch (error) {
      try { if (admitted.length) subbeatsStore.failQueued(admitted, 'Preparation could not start. Check the analysis log, then queue again.'); } catch { /* keep unreadable state intact */ }
      queue.log('error', `Sub/Beats preparation could not start: ${error instanceof Error ? error.message : String(error)}`);
    }
  }, delayMs);
  timer.unref();
}

export function recoverSubbeats(): void {
  // Failed/interrupted tracks require an explicit retry; queued tracks resume.
  subbeatsStore.interrupted('Preparation stopped during restart. Queue this track again to retry.');
  // Existing maintenance recovery allows five seconds to kill its old group.
  kickSubbeats(6000);
}
