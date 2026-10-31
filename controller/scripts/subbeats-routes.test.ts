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
  db.upsertTrackMeta(id, { title: id, artist: 'Test artist', album: 'Test collection', genres: ['Trance'] });
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

test('dance discovery handles genre variants and refuses malformed or unrelated tags', async () => {
  const { subbeatsDanceGenresFromJson: matches } = await import('../src/music/subbeats-eligibility.js');
  for (const genre of ['Progressive House', 'Tech-House', 'Uplifting Trance', 'Nu-Disco',
    'Drum & Bass', 'Drum and Bass', 'D&B', 'DnB', 'Big Beat', 'UK Garage', 'Garage',
    'Dubstep', 'Dance-Pop', 'Jungle', 'Disco', 'EDM', 'Electronica']) {
    assert.equal(matches(JSON.stringify([genre])), 1, genre);
  }
  for (const genre of ['Rock', 'Pop', 'Garage Rock', 'Acid Rock', 'Hardcore Punk',
    'Ambient', 'Jazz', 'Country', 'Warehouse', 'Trancey']) {
    assert.equal(matches(JSON.stringify([genre])), 0, genre);
  }
  for (const value of [null, '', 'broken', '{}', 'null', '"Dance"', '[1,null,{}]']) assert.equal(matches(value), 0);
  assert.equal(matches(JSON.stringify(['Rock', 'Breakbeat'])), 1);
});

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

test('default suggestions require dance-family genres even with strong beat evidence; search remains open', async () => {
  const fixtures: Array<[string, string[]]> = [
    ['kinks', ['Rock']], ['unknown-genre', []], ['punk-hardcore', ['Hardcore Punk']],
    ['garage-rock', ['Garage Rock']], ['fatboy', ['Big Beat']],
    ['deep-house', ['Deep House']], ['multi-genre', ['Pop', 'Drum & Bass']],
    ['broad-electronic', ['Electronic']],
  ];
  try {
    for (const [id, genres] of fixtures) {
      db.upsertTrackMeta(id, { title: id, artist: id, genres });
      db.getDb()!.prepare('UPDATE tracks SET bpm=138, beats_json=?, analysis_confidence=1 WHERE id=?')
        .run(JSON.stringify(Array.from({length:64}, (_,i) => i * 435)), id);
    }
    const page = subbeatsCandidatePageSchema.parse(await (await fetch(base + '/library/subbeats/candidates', {headers})).json());
    const ids = new Set(page.rows.map(row => row.id));
    for (const id of ['fatboy', 'deep-house', 'multi-genre', 'broad-electronic']) assert.ok(ids.has(id), id);
    for (const id of ['kinks', 'unknown-genre', 'punk-hardcore', 'garage-rock']) assert.ok(!ids.has(id), id);
    const search = subbeatsCandidatePageSchema.parse(await (await fetch(base + '/library/subbeats/candidates?q=kinks', {headers})).json());
    assert.equal(search.rows[0]?.id, 'kinks');
  } finally {
    for (const [id] of fixtures) db.getDb()!.prepare('DELETE FROM tracks WHERE id=?').run(id);
  }
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
      return new Response(audio, { headers: { 'Content-Type': 'audio/wav', 'X-Subbeats-Timeline': JSON.stringify({ duration: 44, events: [{ at: 0, label: 'Outgoing lead' }, { at: 36, label: 'Exchange complete' }] }) } });
    }
    return realFetch(url, init);
  }) as typeof fetch;
  try {
    const response = await post('/library/subbeats/join-preview', { trackIds: ['beat-grid', 'tempo-only'] });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type')!, /audio\/wav/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(JSON.parse(response.headers.get('x-subbeats-timeline')!).events[1].at, 36);
    assert.equal(response.headers.get('access-control-expose-headers'), 'X-Subbeats-Timeline');
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), audio);
    assert.deepEqual(subbeatsStore.read(), before);
    assert.equal((payload as { out_key: string }).out_key, 'a'.repeat(64));
    assert.equal((payload as { in_key: string }).in_key, 'b'.repeat(64));
    assert.equal((payload as { bar_shift: number }).bar_shift, 0);
    for (const barShift of [-2, -1, 1, 2]) {
      const shifted = await post('/library/subbeats/join-preview', { trackIds: ['beat-grid', 'tempo-only'], barShift });
      assert.equal(shifted.status, 200);
      await shifted.arrayBuffer();
      assert.equal((payload as { bar_shift: number }).bar_shift, barShift);
    }
    for (const barShift of [-3, 3, .5, true, '1', null]) {
      assert.equal((await post('/library/subbeats/join-preview', { trackIds: ['beat-grid', 'tempo-only'], barShift })).status, 400);
    }
    assert.deepEqual(subbeatsStore.read(), before);
  } finally { globalThis.fetch = realFetch; analyzer.shutdown(); }
});

test('annotated preview resolves server-owned points and URLs, rejects unsuitable windows and old analyzers', async () => {
  const analyzer = await import('../src/music/analyzer.js');
  const { subbeatsReferences } = await import('../src/music/subbeats-references.js');
  const ids = ['4yJmvI0lrITSbffov6oEO6', '4d45b9VOH8reQ0PSjcuOB4'];
  for (const [index, id] of ids.entries()) {
    db.upsertTrackMeta(id, { title:id, artist:'Reference artist',album:'Reference collection' });
    subbeatsStore.enqueue([{ id, title:id, artist:'Reference artist',album:'' }]);
    subbeatsStore.event({ id, status:'running' }, [id]);
    subbeatsStore.event({ id, status:'prepared', bundleKey:(index ? 'd' : 'c').repeat(64) }, [id]);
  }
  const view = subbeatsViewSchema.parse(await (await fetch(base+'/library/subbeats', {headers})).json());
  assert.deepEqual(view.references, subbeatsReferences);
  const before = subbeatsStore.read();
  const realFetch = globalThis.fetch;
  let seen: Record<string, unknown> | undefined;
  let oldAnalyzer = false;
  const audio = Buffer.alloc(44); audio.write('RIFF'); audio.write('WAVE',8);
  globalThis.fetch = (async (url, init) => {
    if (String(url).startsWith('http://127.0.0.1:9/')) {
      if (String(url).endsWith('/health')) return Response.json({ok:true,engines:['analyze']});
      seen = JSON.parse(String(init?.body));
      return new Response(audio, {headers:{'Content-Type':'audio/wav','X-Subbeats-Timeline':JSON.stringify({
        ...(oldAnalyzer ? {} : {kind:'reference'}), duration:76,events:[{at:0,label:'Outgoing original'},{at:59,label:'Incoming release'}],
      })}});
    }
    return realFetch(url,init);
  }) as typeof fetch;
  analyzer._resetBackendCacheForTests();
  try {
    const response = await post('/library/subbeats/join-preview', { trackIds:ids, referenceBars:32,
      reference:{out_url:'http://untrusted',in_resolve:1} });
    assert.equal(response.status,200); await response.arrayBuffer();
    const ref = seen!.reference as Record<string,unknown>;
    assert.equal(ref.out_seconds,219); assert.equal(ref.in_resolve,68); assert.equal(ref.bars,32);
    assert.ok(String(ref.out_url).includes(ids[0])); assert.ok(String(ref.in_url).includes(ids[1]));
    assert.ok(!JSON.stringify(ref).includes('untrusted'));
    for (const body of [
      {trackIds:ids,referenceBars:4}, {trackIds:ids,referenceBars:15},
      {trackIds:ids,referenceBars:32,barShift:1},
      {trackIds:['beat-grid','tempo-only'],referenceBars:16},
    ]) assert.equal((await post('/library/subbeats/join-preview',body)).status,400);
    oldAnalyzer=true;
    const stale = await post('/library/subbeats/join-preview',{trackIds:ids,referenceBars:32});
    assert.equal(stale.status,400); assert.match((await stale.json() as {error:string}).error,/Update the analyzer/);
    assert.deepEqual(subbeatsStore.read(),before);
  } finally {globalThis.fetch=realFetch;analyzer.shutdown();}
});
