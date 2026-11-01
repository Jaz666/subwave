import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync } from 'node:fs';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';
import { createSubbeatsStore, readSubbeatsQueue } from '../src/music/subbeats-store.js';
import { subbeatsEnqueueSchema } from '../src/schemas/subbeats.js';

const state = createTempDir(join(tmpdir(), 'subwave-subbeats-'));
const store = createSubbeatsStore(state);
const a = { id: 'a', title: 'Driving track', artist: 'Artist', album: 'Album' };
const b = { ...a, id: 'b' };
after(() => removeTempDir(state));

test('admission persists, deduplicates and leaves a pause intact', () => {
  store.pause(true); store.enqueue([a, a, b]);
  const reloaded = readSubbeatsQueue(state);
  assert.equal(reloaded.paused, true);
  assert.equal(reloaded.jobs.length, 2);
  assert.equal(reloaded.jobs[0].status, 'queued');
});

test('events preserve other admissions and terminal results cannot increment attempts', () => {
  store.event({ id: 'a', status: 'running' }, ['a']);
  store.enqueue([{ ...a, id: 'c' }]);
  store.pause(false);
  store.event({ id: 'a', status: 'prepared', bundleKey: 'a'.repeat(64) }, ['a']);
  store.event({ id: 'a', status: 'running' }, ['a']);
  const saved = store.read();
  assert.equal(saved.jobs[0].status, 'prepared');
  assert.equal(saved.jobs[0].attempts, 1);
  assert.equal(saved.jobs.length, 3);
  assert.equal(saved.paused, false);
  assert.throws(() => store.event({ id: 'c', status: 'running' }, ['a']));
});

test('restart interrupts only active work and failed tracks can be explicitly retried', () => {
  store.event({ id: 'b', status: 'running' }, ['b']);
  store.interrupted('Restarted');
  assert.equal(store.read().jobs.find(j => j.id === 'a')?.status, 'prepared');
  assert.equal(store.read().jobs.find(j => j.id === 'b')?.status, 'failed');
  assert.equal(store.read().jobs.find(j => j.id === 'c')?.status, 'queued');
  store.enqueue([b]);
  store.event({ id: 'b', status: 'running' }, ['b']);
  assert.equal(store.read().jobs.find(j => j.id === 'b')?.attempts, 2);
  store.event({ id: 'b', status: 'unmeasurable', bundleKey: 'b'.repeat(64) }, ['b']);
  store.enqueue([b]);
  assert.equal(store.read().jobs.find(j => j.id === 'b')?.status, 'queued', 'explicit recheck can refresh changed sources or algorithms');
});

test('failed startup terminates queued work without touching existing results', () => {
  store.failQueued(['a', 'c'], 'Could not start');
  assert.equal(store.read().jobs.find(j => j.id === 'a')?.status, 'prepared');
  assert.equal(store.read().jobs.find(j => j.id === 'c')?.status, 'failed');
});

test('cache-only assessment preserves bundles and persists role evidence without admitting new tracks', () => {
  const before = store.read();
  assert.throws(() => store.assess(['a', 'missing']));
  assert.deepEqual(store.read(), before, 'a rejected batch changes nothing');
  store.pause(true);
  store.assess(['a', 'a']);
  const queued = store.read().jobs.find(job => job.id === 'a')!;
  assert.equal(queued.task, 'assess'); assert.equal(queued.status, 'queued');
  assert.equal(queued.bundleKey, 'a'.repeat(64)); assert.equal(queued.suitability, undefined);
  assert.equal(store.read().paused, true);
  assert.throws(() => store.assess(['a']), /completed/);
  store.event({id:'a',status:'running'}, ['a']);
  const role = {level:'beat',bpm:120,cueSeconds:2,leadSeconds:null,postSeconds:null,reason:'Supported grid'};
  const suitability = {version:1,assessedAt:'2026-11-01T00:00:00Z',incoming:role,outgoing:{...role,level:'regular',bpm:null,cueSeconds:null}};
  store.event({id:'a',status:'prepared',bundleKey:queued.bundleKey,suitability}, ['a']);
  assert.deepEqual(readSubbeatsQueue(state).jobs.find(job => job.id === 'a')?.suitability, suitability);
  store.event({id:'a',status:'prepared',bundleKey:queued.bundleKey}, ['a']);
  assert.deepEqual(store.read().jobs.find(job => job.id === 'a')?.suitability, suitability, 'late events cannot erase evidence');
});

test('shared-cache identity is stable and malformed state is preserved', () => {
  const marker = store.cacheId();
  assert.ok(marker.length > 16);
  assert.equal(createSubbeatsStore(state).cacheId(), marker);
  const file = join(state, 'subbeats', 'queue.json');
  writeFileSync(file, 'broken');
  assert.throws(() => store.read());
  assert.throws(() => store.enqueue([a]));
  assert.equal(readFileSync(file, 'utf8'), 'broken');
  assert.equal(subbeatsEnqueueSchema.safeParse({ ids: [] }).success, false);
  assert.equal(subbeatsEnqueueSchema.safeParse({ ids: Array(101).fill('a') }).success, false);
});
