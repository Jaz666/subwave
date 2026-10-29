// Durable admissions share the existing managed maintenance slot. The controller
// owns queue state; the child only reports per-track events and honors pause.
import { config } from '../config.js';
import { createSubbeatsStore } from './subbeats-store.js';
import { startSubbeats, tagger } from '../broadcast/tagger.js';
import { queue } from '../broadcast/queue.js';
import { isPidAlive, readPidfile } from './tagger-lock.js';

export const subbeatsStore = createSubbeatsStore(config.stateDir);
let timer: ReturnType<typeof setTimeout> | null = null;

export function kickSubbeats(delayMs = 0): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    let admitted: string[] = [];
    try {
      const state = subbeatsStore.read();
      const ids = state.jobs.filter(j => j.status === 'queued').slice(0, 100).map(j => j.id);
      if (state.paused || !ids.length) return;
      const locked = readPidfile();
      if (tagger.running || (locked && isPidAlive(locked.pid))) { kickSubbeats(5000); return; }
      admitted = ids;
      subbeatsStore.cacheId();
      let reported = false;
      startSubbeats(ids, raw => { subbeatsStore.event(raw, ids); reported = true; }, stopped => {
        if (stopped) subbeatsStore.pause(true);
        if (!reported && !subbeatsStore.read().paused) subbeatsStore.failQueued(ids, 'Preparation could not start. Check the analysis log, then queue again.');
        subbeatsStore.interrupted('Preparation was interrupted. Queue this track again to retry.');
        kickSubbeats(1000);
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
