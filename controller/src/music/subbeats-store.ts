// The controller alone writes queue.json. Managed children read it and report
// outcomes over stdio, so an enqueue/pause cannot race a child overwriting it.
import { mkdirSync, readFileSync, existsSync, lstatSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeFileAtomicSync } from '../util/atomic-file.js';
import { SUBBEATS_QUEUE_LIMIT, subbeatsQueueSchema, subbeatsEventSchema, type subbeatsJobSchema } from '../schemas/subbeats.js';

export type SubbeatsJob = z.infer<typeof subbeatsJobSchema>;
export type SubbeatsQueue = z.infer<typeof subbeatsQueueSchema>;

export function readSubbeatsQueue(stateDir: string): SubbeatsQueue {
  const file = join(stateDir, 'subbeats', 'queue.json');
  if (!existsSync(file)) return { version: 1, paused: false, jobs: [] };
  return subbeatsQueueSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
}

export function createSubbeatsStore(stateDir: string) {
  const root = join(stateDir, 'subbeats');
  const file = join(root, 'queue.json');
  const save = (state: SubbeatsQueue) => {
    if (existsSync(root) && lstatSync(root).isSymbolicLink()) throw new Error('Sub/Beats requires its own cache folder');
    mkdirSync(root, { recursive: true });
    writeFileAtomicSync(file, JSON.stringify(subbeatsQueueSchema.parse(state)), { durable: true });
  };
  return {
    read: () => readSubbeatsQueue(stateDir),
    enqueue(tracks: Array<Pick<SubbeatsJob, 'id' | 'title' | 'artist' | 'album'>>) {
      const state = readSubbeatsQueue(stateDir);
      const jobs = new Map(state.jobs.map(j => [j.id, j]));
      for (const track of tracks) {
        const previous = jobs.get(track.id);
        if (previous && ['queued', 'running'].includes(previous.status)) continue;
        jobs.set(track.id, { ...track, status: 'queued', attempts: previous?.attempts ?? 0,
          bundleKey: null, error: null, updatedAt: new Date().toISOString() });
      }
      if (jobs.size > SUBBEATS_QUEUE_LIMIT) throw new Error(`The preparation list is full (${SUBBEATS_QUEUE_LIMIT} tracks)`);
      state.jobs = [...jobs.values()];
      save(state);
    },
    pause(paused: boolean) { const state = readSubbeatsQueue(stateDir); state.paused = paused; save(state); },
    event(raw: unknown, allowedIds: readonly string[]) {
      const event = subbeatsEventSchema.parse(raw);
      if (!allowedIds.includes(event.id)) throw new Error('Unexpected preparation result');
      if (['prepared', 'unmeasurable'].includes(event.status) && !event.bundleKey) throw new Error('Preparation result has no verified cache bundle');
      const state = readSubbeatsQueue(stateDir);
      const job = state.jobs.find(j => j.id === event.id);
      if (!job || (event.status === 'running' ? job.status !== 'queued' : job.status !== 'running')) return;
      if (event.status === 'running') job.attempts++;
      Object.assign(job, event, { updatedAt: new Date().toISOString() });
      save(state);
    },
    failQueued(ids: readonly string[], message: string) {
      const state = readSubbeatsQueue(stateDir);
      for (const job of state.jobs) if (ids.includes(job.id) && job.status === 'queued') {
        Object.assign(job, { status: 'failed', error: message, updatedAt: new Date().toISOString() });
      }
      save(state);
    },
    interrupted(message: string) {
      const state = readSubbeatsQueue(stateDir);
      let changed = false;
      for (const job of state.jobs) if (job.status === 'running') {
        Object.assign(job, { status: 'failed', error: message, updatedAt: new Date().toISOString() });
        changed = true;
      }
      if (changed) save(state);
    },
    cacheId() {
      if (existsSync(root) && lstatSync(root).isSymbolicLink()) throw new Error('Sub/Beats requires its own cache folder');
      mkdirSync(root, { recursive: true });
      const marker = join(root, '.cache-id');
      if (!existsSync(marker)) writeFileAtomicSync(marker, randomUUID(), { replace: false });
      return readFileSync(marker, 'utf8').trim();
    },
  };
}
