import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import { listen as listenHttp } from './test-utils/http.js';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';

const stateDir = createTempDir(join(tmpdir(), 'stembeats-routes-'));
process.env.STATE_DIR = stateDir;
process.env.ADMIN_USER = 'test-admin';
process.env.ADMIN_PASS = 'test-pass';
process.env.ANALYZE_URL = 'http://127.0.0.1:9';
process.env.ANALYZE_PYTHON = '';

const express = (await import('express')).default;
const db = await import('../src/music/library-db.js');
const library = await import('../src/music/library.js');
const { router } = await import('../src/routes/library/subbeats.js');
await library.load();

const app = express();
app.use(express.json());
app.use(router);
const { server, url: base } = await listenHttp(app);
server.unref();

const ADMIN = { authorization: `Basic ${Buffer.from('test-admin:test-pass').toString('base64')}` };
const jsonHeaders = { ...ADMIN, 'content-type': 'application/json' };
const post = (path: string, body: unknown, headers: Record<string, string> = jsonHeaders) => fetch(`${base}${path}`, {
  method: 'POST', headers, body: JSON.stringify(body),
});

const id = 'stembeats-route-fixture';
db.upsertTrackMeta(id, {
  title: 'Route Fixture', artist: 'Test Artist', album: 'Test Album',
  genres: ['Trance'], fileSize: 4096,
});
db.getDb()!.prepare('UPDATE tracks SET bpm=120 WHERE id=?').run(id);

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  db.getDb()?.prepare('DELETE FROM tracks WHERE id=?').run(id);
  db.close();
  await removeTempDir(stateDir);
});

test('Stem Beats run, candidate, and extraction-metric reads require admin auth', async () => {
  for (const path of [
    '/library/subbeats/prep-v2/runs',
    '/library/subbeats/prep-v2/candidates',
    '/library/stems/pick-time-metrics',
  ]) {
    assert.equal((await fetch(`${base}${path}`)).status, 401, path);
  }
  assert.equal((await post('/library/subbeats/prep-v2/runs', { scope: 'track', id }, {
    'content-type': 'application/json',
  })).status, 401);
});

test('candidate listing and selected prep expose current source and run progress', async () => {
  const candidates = await fetch(`${base}/library/subbeats/prep-v2/candidates`, { headers: ADMIN });
  assert.equal(candidates.status, 200);
  const candidate = (await candidates.json() as { tracks: Array<Record<string, unknown>> })
    .tracks.find(track => track.id === id);
  assert.deepEqual(candidate, {
    id, title: 'Route Fixture', artist: 'Test Artist', album: 'Test Album',
    scanned: false, incomingReady: false, outgoingReady: false,
  });

  const created = await post('/library/subbeats/prep-v2/runs', { scope: 'library-selected', ids: [id] });
  assert.equal(created.status, 201, await created.clone().text());
  const run = await created.json() as { runId: string; scope: string; jobs: Array<{ id: string; expectedSourceBytes: number }> };
  assert.equal(run.scope, 'library-selected');
  assert.deepEqual(run.jobs.map(job => [job.id, job.expectedSourceBytes]), [[id, 4096]]);

  const listed = await fetch(`${base}/library/subbeats/prep-v2/runs`, { headers: ADMIN });
  assert.equal(listed.status, 200);
  const summary = (await listed.json() as { runs: Array<{
    runId: string; counts: { queued: number }; currentJob: { title: string; status: string; stage: string | null } | null;
  }> }).runs.find(item => item.runId === run.runId);
  assert.equal(summary?.counts.queued, 1);
  assert.deepEqual(summary?.currentJob, { title: 'Route Fixture', artist: 'Test Artist', status: 'queued', stage: null });

  const paused = await post(`/library/subbeats/prep-v2/runs/${run.runId}/pause`, { paused: true });
  assert.equal(paused.status, 200);
  assert.equal((await paused.json() as { status: string }).status, 'paused');
  const detail = await fetch(`${base}/library/subbeats/prep-v2/runs/${run.runId}`, { headers: ADMIN });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json() as { status: string }).status, 'paused');
});

test('extraction metrics return all transition classes with empty history', async () => {
  const response = await fetch(`${base}/library/stems/pick-time-metrics`, { headers: ADMIN });
  assert.equal(response.status, 200);
  const summaries = (await response.json() as { summaries: Array<{ mode: string; samples: number }> }).summaries;
  assert.deepEqual(summaries.map(({ mode, samples }) => [mode, samples]), [
    ['stem-blend', 0],
    ['stem-beats-8-8', 0],
    ['stem-beats-8-16', 0],
    ['stem-beats-16-16', 0],
    ['stem-beats-other', 0],
  ]);
});

test('selected prep rejects duplicate and non-candidate IDs', async () => {
  assert.equal((await post('/library/subbeats/prep-v2/runs', {
    scope: 'library-selected', ids: [id, id],
  })).status, 400);
  assert.equal((await post('/library/subbeats/prep-v2/runs', {
    scope: 'library-selected', ids: ['not-a-candidate'],
  })).status, 400);
});
