// Real managed child and per-track stdio; the HTTP analyzer/audio are fixtures.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createServer } from 'node:http';
import { readFileSync, mkdirSync, rmdirSync } from 'node:fs';

let release: (() => void) | null = null;
let requests = 0;
const fixture = createServer(async (req, res) => {
  if (req.url === '/health') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, engines: ['analyze'], analyze_subbeats_capable: true })); return;
  }
  if (req.url?.startsWith('/rest/stream')) {
    res.setHeader('Content-Type', 'audio/mpeg'); res.end(Buffer.alloc(2048, 1)); return;
  }
  if (req.url === '/prepare-subbeats') {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString());
    assert.equal(payload.complete, true);
    assert.equal(readFileSync(payload.path).length, 2048);
    requests++;
    if (requests === 1 || requests === 4) await new Promise<void>(resolve => { release = resolve; });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: true, subbeats_result: { status: 'prepared', bundleKey: 'a'.repeat(64), error: null } })); return;
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
const { subbeatsStore: store, kickSubbeats } = await import('../src/music/subbeats-manager.js');
const { tagger, stopTagger, startSubbeats } = await import('../src/broadcast/tagger.js');
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
  store.enqueue([track('first'), track('second')]); kickSubbeats();
  await waitUntil(() => release !== null);
  assert.equal(store.read().jobs[0].status, 'running');
  store.pause(true);
  store.enqueue([track('third')]);
  release!();
  await waitUntil(() => !tagger.running && store.read().jobs[0].status === 'prepared');
  assert.equal(requests, 1, 'pause must prevent another source/analysis request');
  assert.deepEqual(store.read().jobs.map(j => j.status), ['prepared', 'queued', 'queued']);
  store.pause(false); kickSubbeats();
  await waitUntil(() => store.read().jobs.every(j => j.status === 'prepared') && !tagger.running);
  assert.equal(requests, 3);
  assert.deepEqual(store.read().jobs.map(j => j.attempts), [1, 1, 1]);
  assert.ok(store.read().jobs.every(j => j.bundleKey === 'a'.repeat(64)));
});


test('the existing Stop control pauses queued Sub/Beats work instead of restarting it', async () => {
  release = null;
  store.enqueue([track('fourth'), track('fifth')]); kickSubbeats();
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
