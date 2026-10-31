import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import { z } from 'zod';
import { createTempDir } from './test-utils/temp-dir.js';

const stateDir = createTempDir(join(tmpdir(), 'subwave-stem-regression-'));
const snapFile = join(stateDir, 'stem-cache-usage.json');
const MB = 1024 ** 2;
const GB = 1024 ** 3;
const HOUR = 3600_000;
let writeWindow: 'head' | 'tail' = 'head';
let writeBytes = 0;
let cacheExpected = true;
let starredIds: string[] = [];
const requestSchema = z.object({ stems_dir: z.string().optional() });
const snapshotSchema = z.object({
  bytes: z.number(), dirs: z.number(),
  pending: z.object({ pid: z.number(), since: z.string() }).optional(),
});
const snapshot = () => snapshotSchema.parse(JSON.parse(readFileSync(snapFile, 'utf8')));

// Sparse payloads exercise the real byte budget without allocating a gigabyte.
function payload(dir: string, window: 'head' | 'tail', bytes: number): void {
  mkdirSync(dir, { recursive: true });
  const file = join(dir, `${window}-drums.flac`);
  writeFileSync(file, '');
  truncateSync(file, bytes);
}

const fixture = createServer(async (req, res) => {
  if (req.url?.includes('getStarred2')) {
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({'subsonic-response':{status:'ok',version:'1.16.1',starred2:{song:starredIds.map(id=>({id,title:id}))}}}));
    return;
  }
  if (req.url === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      ok: true, engines: ['analyze'], analyze_vocal_capable: true,
      analyze_audio_capable: false, analyze_text_capable: false,
    }));
    return;
  }
  if (req.method === 'POST' && req.url === '/analyze') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = requestSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    if (cacheExpected) assert.ok(body.stems_dir, 'eligible analysis must allocate a stem directory');
    else assert.equal(body.stems_dir, undefined, 'ineligible analysis must not allocate cache space');
    if (body.stems_dir) payload(body.stems_dir, writeWindow, writeBytes);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, bpm: 120, key: 'Am', bars: [0,2000,4000], stems_cached: body.stems_dir ? true : null }));
    return;
  }
  res.setHeader('Content-Type', 'audio/mpeg');
  res.end(Buffer.alloc(2048, 0x41));
});

let cache: typeof import('../src/music/stem-cache.js');
let db: typeof import('../src/music/library-db.js');
let settings: typeof import('../src/settings.js');
let analyzer: typeof import('../src/music/analyzer.js');
let runAnalysisPass: typeof import('../src/music/analyze.js').runAnalysisPass;

before(async () => {
  await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
  const address = fixture.address();
  assert.ok(address && typeof address === 'object');
  process.env.STATE_DIR = stateDir;
  process.env.ANALYZE_URL = `http://127.0.0.1:${address.port}`;
  process.env.NAVIDROME_URL = process.env.ANALYZE_URL;
  process.env.ANALYZE_QUIET_ONLY = '0';
  process.env.ANALYZE_CONCURRENCY = '1';
  cache = await import('../src/music/stem-cache.js');
  db = await import('../src/music/library-db.js');
  settings = await import('../src/settings.js');
  analyzer = await import('../src/music/analyzer.js');
  ({ runAnalysisPass } = await import('../src/music/analyze.js'));
});

beforeEach(async () => {
  cacheExpected = true;
  starredIds = [];
  await settings.update({ audio: { stemCache: true, stemCacheGb: 1, analyzeQuietOnly: false } });
  await db.open({ embeddingDim: 768, adoptStoredDim: true });
});

afterEach(() => {
  chmodSync(stateDir, 0o700);
  db.close();
  for (const name of ['stems', 'subbeats', 'stem-cache-usage.json', 'library.db', 'library.db-wal', 'library.db-shm']) {
    rmSync(join(stateDir, name), { recursive: true, force: true });
  }
});

after(async () => {
  analyzer?.shutdown();
  await new Promise<void>((resolve, reject) => fixture.close(err => err ? reject(err) : resolve()));
  rmSync(stateDir, { recursive: true, force: true });
});

const addTrack = (id: string) => {
  db.upsertTrackMeta(id, { title: id, artist: 'A', album: 'B', duration: 200, genres: ['House'] });
  db.getDb()!.prepare('UPDATE tracks SET bpm=120,bars_json=? WHERE id=?').run('[0,2000,4000]',id);
};
const runPass = () => runAnalysisPass({ audioBackfill: false, vocalBackfill: false });

test('reanalysis completes a partial stem dir and evicts its growth above budget', async () => {
  addTrack('partial');
  payload(cache.dirFor('partial'), 'head', 600 * MB);
  await cache.usage();
  writeWindow = 'tail';
  writeBytes = 600 * MB;
  assert.equal((await runPass()).analyzed, 1);
  assert.equal(existsSync(cache.dirFor('partial')), false, 'the completed dir exceeds the 1 GB budget');
  assert.equal((await cache.usage()).bytes, 0);
});

test('a doctor usage walk during a pass does not double-count its new dirs', async () => {
  payload(cache.dirFor('old'), 'head', 100);
  await cache.usage();
  await cache.markPassPending();
  payload(cache.dirFor('new1'), 'head', 200);
  assert.equal((await cache.usage()).bytes, 300);
  payload(cache.dirFor('new2'), 'head', 300);
  assert.deepEqual(await cache.settlePassWrites(['new1', 'new2'], 1000), {
    bytes: 600, dirs: 3, withinBudget: true,
  });
  assert.equal((await cache.usage()).bytes, 600);
});

test('failed pending publication forces post-pass eviction despite an old snapshot', async () => {
  addTrack('new');
  payload(cache.dirFor('old'), 'head', 100 * MB);
  await cache.usage();
  writeWindow = 'head';
  writeBytes = 1200 * MB;
  // The analyzer can write inside stems while the state directory rejects publication.
  chmodSync(stateDir, 0o500);
  try {
    assert.equal((await runPass()).analyzed, 1);
    assert.equal(existsSync(cache.dirFor('new')), false, 'old usage must not hide the over-budget write');
  } finally {
    chmodSync(stateDir, 0o700);
  }
});

test('an untrustworthy settlement forces the next sweep to measure fresh usage', async () => {
  payload(cache.dirFor('old'), 'head', 100);
  await cache.usage();
  await cache.markPassPending();
  payload(cache.dirFor('new'), 'head', 200);
  const now = new Date().toISOString();
  writeFileSync(snapFile, JSON.stringify({
    version: 1, root: cache.stemsRoot(), bytes: 100, dirs: 1,
    measuredAt: now, updatedAt: now,
  }));
  assert.equal(await cache.settlePassWrites(['new'], 200), null);
  const swept = await cache.sweep(200);
  assert.equal(swept.skipped, undefined);
  assert.ok(swept.removed > 0);
  assert.ok((await cache.usage()).bytes <= 200);
});

test('a live pending pass keeps its dirs when its idle measurement expires', async () => {
  payload(cache.dirFor('writing'), 'head', 300);
  const now = new Date().toISOString();
  writeFileSync(snapFile, JSON.stringify({
    version: 1, root: cache.stemsRoot(), bytes: 100, dirs: 1,
    measuredAt: new Date(Date.now() - 25 * HOUR).toISOString(), updatedAt: now,
    pending: { pid: process.ppid, since: new Date(Date.now() - 2 * HOUR).toISOString() },
  }));
  const swept = await cache.sweep(200);
  assert.equal(swept.skipped, 'pass-running');
  assert.equal(statSync(join(cache.dirFor('writing'), 'head-drums.flac')).size, 300);
});

test('a successful no-work analysis pass leaves no pending snapshot marker', async () => {
  const result = await runPass();
  assert.equal(result.scope, 0);
  assert.equal(result.available, true);
  assert.equal(snapshot().pending, undefined);
  assert.equal((await cache.sweep(GB)).skipped, 'snapshot');
});


test('ordinary analysis measures fresh tracks and later backfills stems only for eligible dance recordings', async () => {
  const { updateSubbeatsStemPolicy } = await import('../src/music/subbeats-stem-policy.js');
  updateSubbeatsStemPolicy({enabled:true});
  db.upsertTrackMeta('fresh-dance', {title:'Fresh dance',genres:['House'],duration:200});
  addTrack('rock');
  db.upsertTrackMeta('rock', {genres:['Rock']});
  cacheExpected = false;
  assert.equal((await runPass()).analyzed, 2, 'all genres still receive ordinary analysis');
  assert.equal(existsSync(cache.dirFor('fresh-dance')), false);
  assert.equal(existsSync(cache.dirFor('rock')), false);
  assert.deepEqual(db.needsStemsIds(undefined, {selectiveStems:true}), ['fresh-dance']);
  cacheExpected = true;
  writeBytes = 100;
  assert.equal((await runPass()).analyzed, 1, 'a later automatic pass selects only the measured dance recording');
  assert.equal(existsSync(cache.dirFor('fresh-dance')), true);
  assert.equal(existsSync(cache.dirFor('rock')), false);
  assert.equal(db.getDb()!.prepare('SELECT stems_at FROM tracks WHERE id=?').pluck().get('rock'), null);
});


test('ordinary analysis caches played, Navidrome-starred and Sub/Beats-prepared non-dance tracks without existing beat evidence', async () => {
  const { updateSubbeatsStemPolicy } = await import('../src/music/subbeats-stem-policy.js');
  updateSubbeatsStemPolicy({enabled:true});
  updateSubbeatsStemPolicy({track:{id:'manual-rock',include:true}});
  const ids = ['played-rock','starred-rock','subbeats-rock','manual-rock'];
  for (const id of ids) db.upsertTrackMeta(id, {title:id,genres:['Rock'],duration:200});
  db.recordPlay({trackId:ids[0],title:ids[0],artist:'A',album:'B',playedAt:'2000-01-01T00:00:00.000Z',source:'auto',requestedBy:null,showId:null,showName:null});
  starredIds = [ids[1]];
  const { createSubbeatsStore } = await import('../src/music/subbeats-store.js');
  const store = createSubbeatsStore(stateDir);
  store.enqueue([{id:ids[2],title:ids[2],artist:'A',album:'B'}]);
  store.event({id:ids[2],status:'running'},[ids[2]]);
  store.event({id:ids[2],status:'prepared',bundleKey:'a'.repeat(64)},[ids[2]]);
  const before = store.read();
  writeBytes = 100;
  assert.equal((await runPass()).analyzed,4);
  for (const id of ids) assert.equal(existsSync(cache.dirFor(id)),true,id);
  assert.deepEqual(store.read(),before,'ordinary analysis must not rewrite extended Sub/Beats preparation');
});

test('turning the selective policy off restores regular caching without deleting existing stems', async () => {
  const { updateSubbeatsStemPolicy } = await import('../src/music/subbeats-stem-policy.js');
  updateSubbeatsStemPolicy({enabled:true});
  addTrack('kept-existing');
  payload(cache.dirFor('kept-existing'), 'head', 100);
  db.upsertTrackAnalysis('kept-existing', {stemsAttempted:true});
  updateSubbeatsStemPolicy({enabled:false});
  addTrack('legacy-rock');
  db.upsertTrackMeta('legacy-rock', {genres:['Rock']});
  cacheExpected = true;
  writeBytes = 100;
  await runPass();
  assert.equal(existsSync(cache.dirFor('legacy-rock')), true);
  assert.equal(existsSync(cache.dirFor('kept-existing')), true);
});
