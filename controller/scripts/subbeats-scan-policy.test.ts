import assert from 'node:assert/strict';
import test from 'node:test';
import { queuedSubbeatsForScan, runnableSubbeatsJobs, suppressRegularStems } from '../src/music/subbeats-scan-policy.js';

const jobs = [
  { id: 'selected-a', status: 'queued' },
  { id: 'assessment', status: 'queued', task: 'assess' },
  { id: 'already-running', status: 'running' },
  { id: 'selected-b', status: 'queued', task: 'coverage' },
];

test('scan releases queued preparation jobs in scope and respects the track limit', () => {
  assert.deepEqual(queuedSubbeatsForScan(jobs), ['selected-a', 'selected-b']);
  assert.deepEqual(queuedSubbeatsForScan(jobs, new Set(['assessment', 'selected-b'])), ['selected-b']);
  assert.deepEqual(queuedSubbeatsForScan(jobs, null, 1), ['selected-a']);
});

test('regular pick-time caching does not start queued Sub/Beats preparation', () => {
  assert.deepEqual(runnableSubbeatsJobs(jobs, new Set()), ['assessment']);
  assert.deepEqual(runnableSubbeatsJobs(jobs, new Set(['selected-b'])), ['assessment', 'selected-b']);
  assert.deepEqual(runnableSubbeatsJobs(jobs, new Set(['selected-a', 'selected-b']), 1), ['selected-a']);
});

test('a Library scan can release more than 100 selected tracks in one worker batch', () => {
  const jobs = Array.from({ length: 197 }, (_, i) => ({ id: `selected-${i}`, status: 'queued' }));
  const ready = new Set(queuedSubbeatsForScan(jobs));
  assert.equal(runnableSubbeatsJobs(jobs, ready).length, 197);
});

test('queued Sub/Beats tracks suppress only their own regular stem writes', () => {
  const queued = new Set(['selected-a']);
  assert.equal(suppressRegularStems('selected-a', queued), true);
  assert.equal(suppressRegularStems('other', queued), false);
});
