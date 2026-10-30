import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import express from 'express';
import { subbeatsCandidatePageSchema, subbeatsViewSchema } from '../src/schemas/subbeats.js';

process.env.ANALYZE_URL = 'http://127.0.0.1:9';
process.env.ANALYZE_PYTHON = '';
process.env.ADMIN_USER = 'test';
process.env.ADMIN_PASS = 'test';
const db = await import('../src/music/library-db.js');
const library = await import('../src/music/library.js');
const { subbeatsStore } = await import('../src/music/subbeats-manager.js');
const { router } = await import('../src/routes/library/subbeats.js');
await library.load();
subbeatsStore.pause(true); // This test never launches a real analysis job.
for (const [id, bpm, beats] of [
  ['beat-grid', 138, JSON.stringify(Array.from({ length: 20 }, (_, i) => i * 440))],
  ['tempo-only', 135, 'broken'], ['quiet-intro', null, null],
] as const) {
  db.upsertTrackMeta(id, { title: id, artist: 'Test artist', album: 'Test collection' });
  db.getDb()!.prepare('UPDATE tracks SET bpm=?, beats_json=? WHERE id=?').run(bpm, beats, id);
}
const app = express();
app.use(express.json()); app.use(router);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const headers = { Authorization: `Basic ${Buffer.from('test:test').toString('base64')}`, 'Content-Type': 'application/json' };
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); });

const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });

test('all Sub/Beats reads and writes require admin authentication', async () => {
  for (const path of ['/library/subbeats', '/library/subbeats/candidates']) assert.equal((await fetch(base + path)).status, 401);
  assert.equal((await fetch(base + '/library/subbeats/join-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"trackIds":["beat-grid","tempo-only"]}' })).status, 401);
  assert.equal((await fetch(base + '/library/subbeats/queue', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"ids":["beat-grid"]}' })).status, 401);
});

test('discovery uses existing evidence and search can find tracks without a BPM', async () => {
  const suggestions = subbeatsCandidatePageSchema.parse(await (await fetch(base + '/library/subbeats/candidates', { headers })).json());
  assert.deepEqual(suggestions.rows.map((r: { id: string }) => r.id), ['beat-grid', 'tempo-only']);
  assert.equal(suggestions.rows[0].hasBeatGrid, true);
  assert.equal(suggestions.rows[1].hasBeatGrid, false);
  const searched = subbeatsCandidatePageSchema.parse(await (await fetch(base + '/library/subbeats/candidates?q=quiet-intro', { headers })).json());
  assert.equal(searched.rows[0].id, 'quiet-intro');
  assert.equal(searched.rows[0].bpm, null);
});

test('invalid and missing IDs cannot enqueue work; valid admission is durable and idempotent', async () => {
  assert.equal((await post('/library/subbeats/queue', { ids: [] })).status, 400);
  assert.equal((await post('/library/subbeats/queue', { ids: ['missing'] })).status, 400);
  const accepted = await post('/library/subbeats/queue', { ids: ['beat-grid', 'beat-grid'] });
  assert.equal(accepted.status, 202);
  const view = subbeatsViewSchema.parse(await accepted.json());
  assert.equal(view.jobs.length, 1); assert.equal(view.jobs[0].status, 'queued'); assert.equal(view.paused, true);
  await post('/library/subbeats/queue', { ids: ['beat-grid'] });
  assert.equal(subbeatsStore.read().jobs.length, 1);
  assert.equal(subbeatsStore.read().jobs[0].attempts, 0);
  assert.equal(db.getTrack('beat-grid')?.bpm, 138);
});

test('pause accepts only a boolean and remains visible after reloading', async () => {
  assert.equal((await post('/library/subbeats/pause', { paused: 'false' })).status, 400);
  assert.equal((await post('/library/subbeats/pause', { paused: true })).status, 200);
  const view = subbeatsViewSchema.parse(await (await fetch(base + '/library/subbeats', { headers })).json());
  assert.equal(view.paused, true); assert.equal(view.jobs[0].id, 'beat-grid');
});

test('preview refuses invalid, duplicate and unprepared pairs without changing preparation', async () => {
  const before = subbeatsStore.read();
  for (const trackIds of [[], ['beat-grid'], ['beat-grid', 'beat-grid'], ['beat-grid', 'tempo-only']]) {
    assert.equal((await post('/library/subbeats/join-preview', { trackIds })).status, 400);
  }
  assert.deepEqual(subbeatsStore.read(), before);
});

test('prepared preview returns isolated audio without changing the preparation list', async () => {
  const analyzer = await import('../src/music/analyzer.js');
  analyzer._resetBackendCacheForTests();
  subbeatsStore.enqueue(['beat-grid', 'tempo-only'].map(id => ({ id, title: id, artist: 'Test', album: '' })));
  for (const [id, key] of [['beat-grid', 'a'], ['tempo-only', 'b']]) {
    subbeatsStore.event({ id, status: 'running' }, [id!]);
    subbeatsStore.event({ id, status: 'prepared', bundleKey: key!.repeat(64) }, [id!]);
  }
  const before = subbeatsStore.read();
  const realFetch = globalThis.fetch;
  const audio = Buffer.alloc(44); audio.write('RIFF'); audio.write('WAVE', 8);
  let payload: unknown;
  globalThis.fetch = (async (url, init) => {
    if (String(url).startsWith('http://127.0.0.1:9/')) {
      if (String(url).endsWith('/health')) return Response.json({ ok: true, engines: ['analyze'] });
      payload = JSON.parse(String(init?.body));
      return new Response(audio, { headers: { 'Content-Type': 'audio/wav' } });
    }
    return realFetch(url, init);
  }) as typeof fetch;
  try {
    const response = await post('/library/subbeats/join-preview', { trackIds: ['beat-grid', 'tempo-only'] });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /audio\/wav/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), audio);
    assert.deepEqual(subbeatsStore.read(), before);
    assert.equal((payload as { out_key: string }).out_key, 'a'.repeat(64));
    assert.equal((payload as { in_key: string }).in_key, 'b'.repeat(64));
  } finally { globalThis.fetch = realFetch; analyzer.shutdown(); }
});
