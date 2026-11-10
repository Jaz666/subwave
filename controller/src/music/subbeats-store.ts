// The controller alone writes queue.json. Managed children read it and report
// outcomes over stdio, so an enqueue/pause cannot race a child overwriting it.
import { mkdirSync, readFileSync, existsSync, lstatSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { writeFileAtomicSync } from '../util/atomic-file.js';
import { subbeatsQueueSchema, subbeatsEventSchema, type subbeatsJobSchema } from '../schemas/subbeats.js';

export type SubbeatsJob = z.infer<typeof subbeatsJobSchema>;
export type SubbeatsQueue = z.infer<typeof subbeatsQueueSchema>;

const invalidBundlePath = (stateDir: string, id: string, key: string) =>
  join(stateDir, 'subbeats', 'invalid-bundles', createHash('sha256').update(id).digest('hex') + '-' + key);

export function readSubbeatsQueue(stateDir: string): SubbeatsQueue {
  const file = join(stateDir, 'subbeats', 'queue.json');
  if (!existsSync(file)) return { version: 1, paused: false, jobs: [] };
  const state = subbeatsQueueSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  for (const job of state.jobs) {
    if (job.bundleKey && existsSync(invalidBundlePath(stateDir, job.id, job.bundleKey))) {
      job.status = 'failed';
      job.error = 'The source audio was replaced. Recheck this track to prepare new stems.';
      job.bundleKey = null;
      delete job.suitability;
      delete job.cuePoints;
      delete job.cueCoverage;
      delete job.task;
    }
  }
  return state;
}

// The library walker runs in another process: invalidate bundles without writing
// the controller-owned queue. A new preparation has a source-keyed bundle identity.
export function invalidateSubbeatsBundles(stateDir: string, ids: readonly string[]): void {
  const selected = new Set(ids);
  const jobs = readSubbeatsQueue(stateDir).jobs.filter(job => selected.has(job.id) && job.bundleKey);
  if (!jobs.length) return;
  const dir = join(stateDir, 'subbeats', 'invalid-bundles');
  mkdirSync(dir, { recursive: true });
  for (const job of jobs) writeFileAtomicSync(invalidBundlePath(stateDir, job.id, job.bundleKey!), 'Source audio replaced', { durable: true });
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
    enqueue(tracks: Array<Pick<SubbeatsJob, 'id' | 'title' | 'artist' | 'album'>>, method: 'classic'|'small0'|'final0' = 'classic') {
      const state = readSubbeatsQueue(stateDir);
      const jobs = new Map(state.jobs.map(j => [j.id, j]));
      for (const track of tracks) {
        const previous = jobs.get(track.id);
        if (previous && ['queued', 'running'].includes(previous.status)) continue;
        jobs.set(track.id, { ...track, status: 'queued', attempts: previous?.attempts ?? 0,
          ...(method === 'classic' ? {} : {preparationMethod:method}),
          bundleKey: null, error: null, updatedAt: new Date().toISOString() });
      }
      state.jobs = [...jobs.values()];
      save(state);
    },
    assess(ids:string[]) {
      const state = readSubbeatsQueue(stateDir);
      const selected = [...new Set(ids)].map(id => state.jobs.find(job => job.id === id));
      if (selected.some(job => !job?.bundleKey || ['queued','running'].includes(job.status))) throw new Error('Choose completed entries with saved bundles');
      for (const job of selected) if (job) {
        job.status = 'queued'; job.task = 'assess'; delete job.suitability; job.error = null; job.updatedAt = new Date().toISOString();
      }
      save(state);
    },
    upgradeCoverage(ids:string[]) {
      const state = readSubbeatsQueue(stateDir);
      const selected = [...new Set(ids)].map(id => state.jobs.find(job => job.id === id));
      if (selected.some(job => !job?.bundleKey || !job.cuePoints || ['queued','running'].includes(job.status))) throw new Error('Choose completed tracks with saved cue points');
      for (const job of selected) if (job) {
        job.status='queued';job.task='coverage';job.error=null;job.updatedAt=new Date().toISOString();
        job.preparationMethod=job.cuePoints!.model;
      }
      save(state);
    },
    remove(id: string) {
      const state = readSubbeatsQueue(stateDir);
      const job = state.jobs.find(job => job.id === id);
      if (job && ['queued', 'running'].includes(job.status)) throw new Error('Wait for preparation to finish before removing this entry');
      state.jobs = state.jobs.filter(job => job.id !== id);
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
      if (event.bundleKey && !job.task && ['prepared', 'unmeasurable'].includes(event.status)) {
        const invalid = invalidBundlePath(stateDir, job.id, event.bundleKey);
        if (existsSync(invalid)) unlinkSync(invalid);
      }
      // Running/error events default to no bundle; a read-only assessment must
      // retain its saved bundle for cache protection and a source-free retry.
      const bundleKey = !!job.task && !event.bundleKey ? job.bundleKey : event.bundleKey;
      Object.assign(job, event, { bundleKey, updatedAt: new Date().toISOString() });
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
