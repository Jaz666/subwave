import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import express from 'express';
import { listen } from './test-utils/http.js';
import { stemBlendPreviewReportSchema } from '../src/schemas/stem-blend-preview.js';

process.env.ANALYZE_URL = 'http://stem-preview.invalid';
process.env.ANALYZE_PYTHON = '';
process.env.ADMIN_USER = 'test'; process.env.ADMIN_PASS = 'test';
const db = await import('../src/music/library-db.js');
const library = await import('../src/music/library.js');
const settings = await import('../src/settings.js');
const cache = await import('../src/music/stem-cache.js');
const analyzer = await import('../src/music/analyzer.js');
const { router } = await import('../src/routes/stem-blend-preview.js');
await library.load(); await settings.load();
await settings.update({ loudness: { source: 'measured' } });
for (const id of ['out','in','evicted','subbeats-only']) {
  db.upsertTrackMeta(id, { title: `Track ${id}`, artist: 'Test artist', duration: 120 });
  db.getDb()!.prepare('UPDATE tracks SET bars_json=?, outro_json=?, loudness_lufs=-14, peak_db=-2 WHERE id=?')
    .run(JSON.stringify([250,1250,2250,3250,4250,5250,6250]), JSON.stringify({startMs:117000,ending:'cold',bars:[112000,114000,116000]}), id);
}
for (const id of ['out','in','subbeats-only']) {
  const dir = cache.dirFor(id); await mkdir(dir, {recursive:true});
  if (id === 'subbeats-only') continue;
  for (const window of ['head','tail']) for (const stem of cache.STEM_NAMES) await writeFile(join(dir,`${window}-${stem}.flac`),'fixture');
  await writeFile(join(dir,'tail-meta.json'), JSON.stringify({tail_start_sec:100,duration_sec:120}));
}
const report = {version:1,mode:'mix',clipSec:6.25,beforeSec:6,afterSec:6,durationSec:18.25,
  blendStartSec:116,loopStartSec:114,loopEndSec:116,carryStartSec:.25,incomingDrumsSec:4.25,
  loopSourceRmsDb:-79,loopDuckDb:0,wholeGainDb:0,gainsDb:[0,0],barLevels:[],warnings:['Quiet loop']};
const wave = Buffer.alloc(44); wave.write('RIFF',0); wave.write('WAVE',8);
const realFetch = globalThis.fetch;
let calls = 0, payload: Record<string, unknown> | undefined, failure = false;
globalThis.fetch = (async (url, init) => {
  if (!String(url).startsWith('http://stem-preview.invalid')) return realFetch(url,init);
  if (String(url).endsWith('/health')) return Response.json({ok:true,engines:['analyze']});
  calls++; payload = JSON.parse(String(init?.body));
  if (failure) return Response.json({detail:'Regular Stem Blend unavailable: no-usable-out-bar.'},{status:422});
  return new Response(wave, {headers:{'Content-Type':'audio/wav','X-Stem-Blend-Report':JSON.stringify({...report,mode:payload?.mode})}});
}) as typeof fetch;
const app = express(); app.use(express.json()); app.use(router);
const {server,url:base} = await listen(app);
const headers = {Authorization:`Basic ${Buffer.from('test:test').toString('base64')}`,'Content-Type':'application/json'};
const post = (body:unknown) => fetch(`${base}/stems/blend-preview`,{method:'POST',headers,body:JSON.stringify(body)});
after(async () => { globalThis.fetch = realFetch; analyzer.shutdown(); await new Promise<void>(resolve => server.close(()=>resolve())); db.close(); });

test('audition reads and renders are admin-only', async () => {
  assert.equal((await fetch(`${base}/stems/blend-preview/tracks`)).status,401);
  assert.equal((await fetch(`${base}/stems/blend-preview`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{"trackIds":["out","in"]}'})).status,401);
  assert.equal(calls,0);
});
test('search uses cache directories, reports missing regular windows, and supports ID lookup', async () => {
  const response = await fetch(`${base}/stems/blend-preview/tracks`,{headers});
  const page = await response.json() as {rows:Array<{id:string;head:boolean;tail:boolean}>};
  assert.equal(page.rows.length,3);
  assert.equal(page.rows.some(row=>row.id==='evicted'),false);
  assert.deepEqual(page.rows.find(row=>row.id==='subbeats-only'),{id:'subbeats-only',title:'Track subbeats-only',artist:'Test artist',head:false,tail:false,headGrid:true,tailGrid:true});
  const exact = await (await fetch(`${base}/stems/blend-preview/tracks?q=out`,{headers})).json() as {rows:Array<{id:string}>};
  assert.deepEqual(exact.rows.map(row=>row.id),['out']);
  assert.equal((await fetch(`${base}/stems/blend-preview/tracks?offset=-1`,{headers})).status,400);
});
test('invalid, missing, identical and Sub/Beats-only pairs never issue a render', async () => {
  const before = calls;
  for (const body of [{trackIds:['out','out']},{trackIds:['out','missing']},{trackIds:['out','subbeats-only']},
    {trackIds:['out','in'],mode:'normalise'},{trackIds:['out']}]) assert.equal((await post(body)).status,400);
  assert.equal(calls,before);
});
test('the regular payload uses station gains and returns an auditable WAV with no fallback bundle', async () => {
  for (const mode of ['mix','clip','outgoing','incoming']) {
    const response = await post({trackIds:['out','in'],mode});
    assert.equal(response.status,200,await response.clone().text());
    assert.equal(stemBlendPreviewReportSchema.parse(JSON.parse(response.headers.get('x-stem-blend-report')!)).mode,mode);
    assert.equal((await response.arrayBuffer()).byteLength,44);
    assert.deepEqual(payload, {out:{stems_dir:cache.dirFor('out'),duration_s:120,outro:{start_ms:117000,bars:[112000,114000,116000]},gain_db:0},
      in:{stems_dir:cache.dirFor('in'),bars:[250,1250,2250,3250,4250,5250,6250],gain_db:0},state_dir:join(cache.stemsRoot(),'..'),mode});
  }
});
test('upstream refusal is shown instead of silently substituting a regular crossfade', async () => {
  failure = true;
  const response = await post({trackIds:['out','in']});
  assert.equal(response.status,400);
  assert.match(JSON.stringify(await response.json()),/no-usable-out-bar/);
});
