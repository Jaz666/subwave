import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import express from 'express';
import { subbeatsCandidatePageSchema } from '../src/schemas/subbeats.js';

process.env.ADMIN_USER = 'test'; process.env.ADMIN_PASS = 'test';
process.env.ANALYZE_URL = 'http://127.0.0.1:9'; process.env.ANALYZE_PYTHON = '';
const db = await import('../src/music/library-db.js');
const library = await import('../src/music/library.js');
const { subbeatsStore } = await import('../src/music/subbeats-manager.js');
const { router } = await import('../src/routes/library/subbeats.js');
await library.load(); subbeatsStore.pause(true);
for (let i = 0; i < 135; i++) {
  const id = `dance-${String(i).padStart(3, '0')}`;
  db.upsertTrackMeta(id, { title: id, artist: 'Dance artist', album: 'Fixture', genres: [i < 80 ? 'House' : 'Trance'] });
  db.getDb()!.prepare('UPDATE tracks SET bpm=138 WHERE id=?').run(id);
}
db.upsertTrackMeta('rock', { title: 'Rock recording', artist: 'Rock artist', genres: ['Rock'] });
db.upsertTrackMeta('no-tempo', { title: 'Unmeasured recording', genres: ['House'] });
const entries = ['prepared', 'running', 'queued', 'failed', 'unmeasurable', 'unavailable'] as const;
for (const [i, status] of entries.entries()) {
  const id = `dance-${String(i).padStart(3, '0')}`;
  subbeatsStore.enqueue([{id, title:id, artist:'Dance artist', album:'Fixture'}]);
  if (status !== 'queued') subbeatsStore.event({id, status:'running'}, [id]);
  if (!['queued','running'].includes(status)) subbeatsStore.event({id, status, bundleKey:'a'.repeat(64)}, [id]);
}
const app = express(); app.use(express.json()); app.use(router);
const server = app.listen(0, '127.0.0.1');
await new Promise<void>(resolve => server.once('listening', resolve));
const base = `http://127.0.0.1:${(server.address() as {port:number}).port}`;
const headers = {Authorization:`Basic ${Buffer.from('test:test').toString('base64')}`};
const browse = async (query: string) => subbeatsCandidatePageSchema.parse(await (await fetch(`${base}/library/subbeats/candidates?${query}`, {headers})).json());
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); });

test('counts and matching selection cover the full result, with bounded pages and no duplicate pages', async () => {
  const first = await browse('scope=dance');
  assert.equal(first.total, 135); assert.equal(first.rows.length, 50); assert.equal(first.hasMore, true);
  assert.equal(first.selectableCount, 131); assert.equal(first.selectableRows.length, 100);
  assert.ok(first.selectableRows.every(row => ['not-started','failed','unavailable'].includes(row.status)));
  const second = await browse('scope=dance&offset=50');
  assert.equal(second.total, 135); assert.equal(second.rows.length, 50);
  assert.ok(second.rows.every(row => !first.rows.some(previous => previous.id === row.id)));
  const last = await browse('scope=dance&offset=100');
  assert.equal(last.rows.length, 35); assert.equal(last.hasMore, false);
  const beyond = await browse('scope=dance&offset=1000000');
  assert.equal(beyond.offset, 100); assert.deepEqual(beyond.rows, last.rows);
});

test('genre/status facets filter before pagination and preserve counts for other options', async () => {
  const house = await browse('scope=dance&genre=house');
  assert.equal(house.total, 80);
  assert.deepEqual(house.genres, [{value:'House',count:80}, {value:'Trance',count:55}]);
  assert.equal(house.statuses.find(item => item.value === 'prepared')?.count, 1);
  const notStarted = await browse('scope=dance&genre=House&status=not-started');
  assert.equal(notStarted.total, 74); assert.equal(notStarted.selectableCount, 74);
  assert.ok(notStarted.rows.every(row => row.status === 'not-started'));
  const prepared = await browse('scope=prepared');
  assert.equal(prepared.total, 1); assert.equal(prepared.rows[0].id, 'dance-000');
  assert.equal(prepared.selectableCount, 0); assert.deepEqual(prepared.selectableRows, []);
});

test('explicit collection scoping keeps dance search narrow and whole-library search available', async () => {
  assert.equal((await browse('scope=dance&q=Rock')).total, 0);
  assert.equal((await browse('scope=library&q=Rock')).total, 1);
  assert.equal((await browse('q=Rock')).total, 1, 'legacy searches retain manual override');
  assert.equal((await browse('scope=library&q=Unmeasured')).rows[0].bpm, null);
  assert.equal((await browse('scope=dance&genre=missing')).total, 0);
  assert.equal((await browse('scope=dance&genre=%27%20OR%201%3D1--')).total, 0);
});

test('invalid filters are rejected and browsing never changes the saved preparation list', async () => {
  const before = subbeatsStore.read();
  for (const query of ['sort=invalid','sort=title-asc&sort=title-desc','scope=invalid','status=invalid','offset=-1','offset=1.5','genre=x&genre=y']) {
    assert.equal((await fetch(`${base}/library/subbeats/candidates?${query}`, {headers})).status, 400);
  }
  await browse('scope=dance&status=failed');
  assert.deepEqual(subbeatsStore.read(), before);
});

test('browse counts and beat-data ranking follow metadata changes without a manual refresh', async () => {
  const update = db.getDb()!.prepare('UPDATE tracks SET bpm=?, genres=?, beats_json=? WHERE id=?');
  try {
    update.run(80, JSON.stringify(['Trance']), null, 'dance-134');
    assert.equal((await browse('scope=dance')).total, 134);
    update.run(138, JSON.stringify(['Rock']), null, 'dance-134');
    assert.equal((await browse('scope=dance')).total, 134);
    update.run(138, JSON.stringify(['Trance']), JSON.stringify(Array(16).fill(0)), 'dance-134');
    const refreshed = await browse('scope=dance');
    assert.equal(refreshed.total, 135);
    assert.equal(refreshed.rows[0].id, 'dance-134');
    assert.equal(refreshed.rows[0].hasBeatGrid, true);
  } finally { update.run(138, JSON.stringify(['Trance']), null, 'dance-134'); }
});

test('sorts the complete matching collection before pagination and bulk selection', async () => {
  const descending = await browse('scope=dance&sort=title-desc');
  assert.equal(descending.rows[0].id, 'dance-134');
  const next = await browse('scope=dance&sort=title-desc&offset=50');
  assert.equal(next.rows[0].id, 'dance-084');
  assert.equal(descending.selectableRows[0].id, 'dance-134');
  assert.equal(descending.total, 135);
  assert.deepEqual(descending.genres, (await browse('scope=dance')).genres);
});

test('named sorts have deterministic ties and keep missing BPMs last in both directions', async () => {
  const fixtures = [
    ['sort-a', 'Alpha', 'Zulu', 'Z', 140], ['sort-b', 'Zulu', 'Alpha', 'A', 120],
    ['sort-c', 'Beta', 'Alpha', 'B', null], ['sort-d', 'Beta', 'Alpha', 'B', 120],
  ] as const;
  try {
    for (const [id,title,artist,album,bpm] of fixtures) {
      db.upsertTrackMeta(id, {title,artist,album:`Sort fixture ${album}`,genres:['House']});
      db.getDb()!.prepare('UPDATE tracks SET bpm=? WHERE id=?').run(bpm,id);
    }
    const expected = {
      recommended: ['c','d','b','a'], 'artist-asc': ['c','d','b','a'], 'artist-desc': ['a','c','d','b'],
      'title-asc': ['a','c','d','b'], 'title-desc': ['b','c','d','a'], 'album-asc': ['b','c','d','a'],
      'bpm-asc': ['d','b','a','c'], 'bpm-desc': ['a','d','b','c'],
    };
    for (const [sort, ids] of Object.entries(expected)) {
      const page = await browse(`scope=library&q=Sort%20fixture&sort=${sort}`);
      assert.deepEqual(page.rows.map(row=>row.id), ids.map(id=>`sort-${id}`), sort);
      assert.deepEqual(page.selectableRows.map(row=>row.id), page.rows.map(row=>row.id), sort);
    }
  } finally { for (const [id] of fixtures) db.getDb()!.prepare('DELETE FROM tracks WHERE id=?').run(id); }
});
