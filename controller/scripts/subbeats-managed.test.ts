// Real managed child and per-track stdio; the HTTP analyzer/audio are fixtures.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, rmdirSync } from 'node:fs';

const role = {level:'subbeat',bpm:120,cueSeconds:4,leadSeconds:4,postSeconds:8,reason:'Verified test grid'};
const suitability = {version:1,assessedAt:'2026-11-01T00:00:00Z',incoming:role,outgoing:role};
let release: (() => void) | null = null;
let requests = 0;
let migrations = 0;
let assessments = 0;
let streams = 0;
let rejectBudget = false;
let catalogueWalks = 0;
const fixture = createServer(async (req, res) => {
  if (req.url === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, engines: ['analyze'], analyze_vocal_capable: true, analyze_facets_capable: true,
      analyze_audio_capable: false, analyze_text_capable: false,
      analyze_subbeats_capable: true, analyze_subbeats_cache_version:2, analyze_subbeats_suitability_version:1 })); return;
  }
  if (req.url?.includes('getAlbumList2')) { catalogueWalks++; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ 'subsonic-response': { status: 'ok', albumList2: { album: [] } } })); return; }
  if (req.url?.startsWith('/rest/stream')) {
    streams++;
    res.setHeader('Content-Type', 'audio/mpeg'); res.end(Buffer.alloc(2048, 1)); return;
  }
  if (req.url === '/migrate-subbeats') { migrations++; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ok:true,migrated:0,cache_added_bytes:0})); return; }
  if (req.url === '/assess-subbeats') { assessments++; res.setHeader('Content-Type','application/json'); res.end(JSON.stringify({ok:true,cache_added_bytes:0,subbeats_result:{status:'prepared',bundleKey:'a'.repeat(64),suitability,error:null}})); return; }
  if (req.url === '/prepare-subbeats') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(payload.complete, true);
    assert.equal(readFileSync(payload.path).length, 2048);
    requests++;
    if (rejectBudget) { res.writeHead(422,{'Content-Type':'application/json'}); res.end(JSON.stringify({detail:'prepared result exceeds remaining Sub/Beats cache budget'})); return; }
    if (requests === 1 || requests === 4) await new Promise<void>(resolve => { release = resolve; });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, cache_added_bytes:0, subbeats_result: { status: 'prepared', bundleKey: 'a'.repeat(64), error: null, suitability } })); return;
  }
  res.writeHead(404).end();
});
await new Promise<void>(resolve => fixture.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${(fixture.address() as { port: number }).port}`;
process.env.ANALYZE_URL = address;
process.env.ANALYZE_PYTHON = '';
process.env.NAVIDROME_URL = address;
process.env.NAVIDROME_USER = 'fixture';
process.env.NAVIDROME_PASS = 'fixture';
const settings = await import('../src/settings.js');
await settings.update({transitions:{pickTimeStems:true}});
const { subbeatsStore: store, kickSubbeats } = await import('../src/music/subbeats-manager.js');
const { tagger, stopTagger, startSubbeats, startTagger } = await import('../src/broadcast/tagger.js');
after(async () => { release?.(); if (tagger.running) stopTagger(); await new Promise<void>(resolve => fixture.close(() => resolve())); });
const track = (id: string) => ({ id, title: id, artist: 'Fixture artist', album: 'Fixture album' });
async function waitUntil(fn: () => boolean, timeout = 30000) {
  const deadline = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > deadline) throw new Error(`managed preparation timeout: ${JSON.stringify(tagger.lastLog)}`);
    await new Promise(r => setTimeout(r, 40));
  }
}

test('managed preparation preserves new admissions, pauses between tracks and resumes', async () => {
  store.enqueue([track('first'), track('second')]); kickSubbeats(0, ['first', 'second']);
  await waitUntil(() => release !== null);
  assert.equal(store.read().jobs[0].status, 'running');
  store.pause(true);
  store.enqueue([track('third')]);
  release!();
  await waitUntil(() => !tagger.running && store.read().jobs[0].status === 'prepared');
  assert.equal(requests, 1, 'pause must prevent another source/analysis request');
  assert.deepEqual(store.read().jobs.map(j => j.status), ['prepared', 'queued', 'queued']);
  store.pause(false); kickSubbeats();
  await waitUntil(() => store.read().jobs.find(j => j.id === 'second')?.status === 'prepared' && !tagger.running);
  assert.equal(store.read().jobs.find(j => j.id === 'third')?.status, 'queued', 'new selections await their own Library scan');
  kickSubbeats(0, ['third']);
  await waitUntil(() => store.read().jobs.every(j => j.status === 'prepared') && !tagger.running);
  assert.equal(requests, 3);
  assert.deepEqual(store.read().jobs.map(j => j.attempts), [1, 1, 1]);
  assert.ok(store.read().jobs.every(j => j.bundleKey === 'a'.repeat(64)));
});


test('the existing Stop control pauses queued Sub/Beats work instead of restarting it', async () => {
  release = null;
  store.enqueue([track('fourth'), track('fifth')]); kickSubbeats(0, ['fourth', 'fifth']);
  await waitUntil(() => requests === 4 && release !== null);
  stopTagger();
  release!();
  await waitUntil(() => !tagger.running && store.read().paused);
  assert.equal(store.read().jobs.find(j => j.id === 'fourth')?.status, 'failed');
  assert.equal(store.read().jobs.find(j => j.id === 'fifth')?.status, 'queued');
  await new Promise(r => setTimeout(r, 1300));
  assert.equal(requests, 4);
});


test('a refused process-lock write cannot orphan or crash a managed child', async () => {
  const { pidfilePath } = await import('../src/music/tagger-lock.js');
  const file = pidfilePath();
  mkdirSync(file);
  let closed = false;
  try {
    assert.doesNotThrow(() => startSubbeats(['first'], () => {}, () => { closed = true; }));
    await waitUntil(() => closed && !tagger.running);
  } finally { rmdirSync(file); }
});


test('legacy migration uses the managed slot while preparation is paused', async () => {
  const {join} = await import('node:path');
  mkdirSync(join(process.env.STATE_DIR!, 'subbeats','v1'),{recursive:true});
  const before = store.read();
  const count = migrations;
  const sources = requests;
  kickSubbeats();
  await waitUntil(() => migrations > count && !tagger.running);
  assert.deepEqual(store.read(),before);
  assert.equal(requests,sources,'migration must not download or separate tracks');
});

test('cache-only assessments use the managed slot without fetching or separating the source', async () => {
  const sources = streams;
  const preparations = requests;
  store.failQueued(['fifth'], 'Test: skip leftover queued work');
  store.assess(['first']); store.pause(false); kickSubbeats();
  await waitUntil(() => assessments === 1 && store.read().jobs.find(job => job.id === 'first')?.status === 'prepared' && !tagger.running);
  assert.equal(streams, sources, 'assessment must not fetch source audio');
  assert.equal(requests, preparations, 'assessment must not run preparation');
  assert.deepEqual(store.read().jobs.find(job => job.id === 'first')?.suitability, suitability);
});


test('Explore selections wait with pick-time caching off, then run after a Library Demucs scan', async () => {
  await settings.update({transitions:{pickTimeStems:false}});
  store.enqueue([track('deferred')]);store.pause(false);
  const before = requests;
  kickSubbeats();
  await new Promise(resolve => setTimeout(resolve,300));
  assert.equal(requests,before);
  assert.equal(store.read().jobs.find(job => job.id === 'deferred')?.status,'queued');
  kickSubbeats(0,['deferred']);
  await waitUntil(() => store.read().jobs.find(job => job.id === 'deferred')?.status === 'prepared' && !tagger.running);
  assert.equal(requests,before+1);
});


test('a full cache keeps selected tracks queued without a retry loop', async () => {
  await settings.update({transitions:{pickTimeStems:true}});
  store.enqueue([track('budget-held')]);
  const before=requests;rejectBudget=true;
  try {
    kickSubbeats(0, ['budget-held']);
    await waitUntil(()=>store.read().jobs.find(job=>job.id==='budget-held')?.error?.startsWith('Waiting for cache space:')===true && !tagger.running);
    assert.equal(store.read().jobs.find(job=>job.id==='budget-held')?.status,'queued');
    await new Promise(resolve=>setTimeout(resolve,1300));
    assert.equal(requests,before+1,'no repeated separation while space is unavailable');
  } finally {rejectBudget=false;}
  kickSubbeats(0, ['budget-held']);
  await waitUntil(()=>store.read().jobs.find(job=>job.id==='budget-held')?.status==='prepared' && !tagger.running);
});

test('stems-only launches and drains queued work on a current library with embeddings disabled', async () => {
  const db = await import('../src/music/library-db.js');
  await db.open({ embeddingDim: 768, adoptStoredDim: true });
  db.upsertTrackMeta('scan-release', { title: 'scan-release', artist: 'A', duration: 200, genres: ['House'] });
  db.upsertTrackAnalysis('scan-release', { bpm: 120, bars: [0, 2000, 4000] });
  db.close();
  await settings.update({ embedding: { enabled: false }, audio: { stemCache: true, embeddings: false, vocalActivity: false } });
  store.enqueue([track('scan-release')]);
  const before = requests;
  const walks = catalogueWalks;
  startTagger({ reconcile: false, enrich: false, tagMoods: false, analyze: false, stems: true, limit: 500 });
  assert.equal(tagger.mode, 'analyze');
  await waitUntil(() => store.read().jobs.find(j => j.id === 'scan-release')?.status === 'prepared' && !tagger.running);
  assert.equal(requests, before + 1, 'a real analysis child must release the queue even with no regular work');
  assert.equal(catalogueWalks, walks, 'stems-only must not walk Navidrome');
});

test('the Library stems checkbox stays off even when automatic caching is enabled', async () => {
  store.enqueue([track('unchecked')]);
  const before = requests;
  startTagger({ reconcile: false, enrich: false, tagMoods: false, analyze: true, stems: false, vocal: false });
  await waitUntil(() => !tagger.running);
  assert.equal(tagger.lastRun?.outcome, 'ok');
  assert.equal(store.read().jobs.find(j => j.id === 'unchecked')?.status, 'queued');
  assert.equal(requests, before);
});

test('stems can be combined with reconciliation while embeddings are disabled', async () => {
  const before = requests;
  const walks = catalogueWalks;
  startTagger({ reconcile: true, enrich: false, tagMoods: false, analyze: false, stems: true });
  await waitUntil(() => store.read().jobs.find(j => j.id === 'unchecked')?.status === 'prepared' && !tagger.running);
  assert.ok(catalogueWalks > walks, 'the selected reconciliation must still walk Navidrome');
  assert.equal(requests, before + 1);
});
