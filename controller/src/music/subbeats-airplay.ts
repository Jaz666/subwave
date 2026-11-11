// Optional upgrade path: demand from actual airplay selects Sub/Beats work;
// Library Demucs scans perform the expensive preparation later.
import { config } from '../config.js';
import * as settings from '../settings.js';
import * as db from './library-db.js';
import { SUBBEATS_QUEUE_LIMIT } from '../schemas/subbeats.js';
import { createSubbeatsStore } from './subbeats-store.js';

const enabled = () => settings.get()?.transitions?.subbeatsOnAirCaching === true;

export function queueAiredTrack(id: string | null | undefined): void {
  if (!enabled() || !id || !db.getDb()) return;
  try {
    const track = db.subbeatsEligibleTrack(id);
    if (!track) return;
    const store = createSubbeatsStore(config.stateDir);
    const current = store.read();
    const existing = current.jobs.find(job => job.id === id);
    if (existing && (['queued', 'running', 'prepared', 'unmeasurable'].includes(existing.status))) return;
    if (!existing && current.jobs.length >= SUBBEATS_QUEUE_LIMIT) return;
    store.enqueue([track]);
  } catch (error) {
    console.warn(`[subbeats] on-air queue skipped: ${(error as Error).message}`);
  }
}

// Seed the next Demucs pass from six months of actual plays. Existing jobs are
// left alone here so failed work is not retried forever by every scheduled scan.
export function queueRecentAiredTracks(now = Date.now()): number {
  if (!enabled() || !db.getDb()) return 0;
  try {
    const store = createSubbeatsStore(config.stateDir);
    const current = store.read();
    const existing = new Set(current.jobs.map(job => job.id));
    const room = SUBBEATS_QUEUE_LIMIT - current.jobs.length;
    if (room <= 0) return 0;
    const since = new Date(now - 180 * 86_400_000).toISOString();
    const tracks = db.recentlyPlayedSubbeatsTracks(since, SUBBEATS_QUEUE_LIMIT)
      .filter(track => !existing.has(track.id)).slice(0, room);
    if (tracks.length) store.enqueue(tracks);
    return tracks.length;
  } catch (error) {
    console.warn(`[subbeats] recent on-air queue skipped: ${(error as Error).message}`);
    return 0;
  }
}
