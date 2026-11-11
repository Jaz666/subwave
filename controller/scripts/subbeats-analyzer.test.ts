import test, { after } from 'node:test';
import assert from 'node:assert/strict';

process.env.ANALYZE_URL = 'http://127.0.0.1:9';
process.env.ANALYZE_PYTHON = '';
const analyzer = await import('../src/music/analyzer.js');
const role = {level:'subbeat',bpm:120,cueSeconds:4,leadSeconds:4,postSeconds:8,reason:'Verified test grid'};
const suitability = {version:1,assessedAt:'2026-11-01T00:00:00Z',incoming:role,outgoing:role};
const realFetch = globalThis.fetch;
after(() => { globalThis.fetch = realFetch; analyzer.shutdown(); });

let supported: boolean | undefined;
let suitabilityVersion:number | undefined = 1;
let version:number | undefined;
let payload: Record<string, unknown> | null = null;
let cueResponse: object | undefined;
let coverageResponse:object|undefined;
globalThis.fetch = (async (url, options) => {
  if (String(url).endsWith('/health')) return Response.json({ ok: true, engines: ['analyze'], analyze_subbeats_capable: supported, analyze_subbeats_cache_version:version, analyze_subbeats_suitability_version:suitabilityVersion });
  payload = JSON.parse(String(options?.body));
  return Response.json({ ok: true, cache_added_bytes:12, subbeats_result: { status: 'prepared', bundleKey: 'a'.repeat(64), error: null, suitability, ...(cueResponse ? {cuePoints:cueResponse} : {}),...(coverageResponse ? {cueCoverage:coverageResponse} : {}) } });
}) as typeof fetch;

test('older and lean analyzers refuse Sub/Beats without issuing work', async () => {
  analyzer._resetBackendCacheForTests();
  assert.equal(await analyzer.subbeatsAvailable(), false, 'missing capability on an older backend');
  supported = true;
  assert.equal(await analyzer.subbeatsAvailable(),false,'a v1 analyzer cannot write the shared cache');
  supported = false;
  assert.equal(await analyzer.subbeatsAvailable(), false, 'explicitly unsupported lean backend');
  await assert.rejects(analyzer.prepareSubbeats('/audio', '/state', 'shared-cache-id-1', 'track-1', {stems_root:'/stems',remaining_bytes:1024}), /updated heavy analyzer/);
  assert.equal(payload, null);
});

test('supported analyzers receive complete source and shared-cache proof', async () => {
  supported = true; version = 2;
  const result = await analyzer.prepareSubbeats('/audio', '/state', 'shared-cache-id-1', 'track-1', {stems_root:'/stems',remaining_bytes:1024});
  assert.equal(result.status, 'prepared');
  assert.equal(result.addedBytes,12);
  assert.deepEqual(payload, { path: '/audio', state_dir: '/state', cache_id: 'shared-cache-id-1', complete: true, track_id:'track-1', stems_root:'/stems',remaining_bytes:1024 });
});

test('assessment requires its protocol version but does not require separation capability', async () => {
  supported = false; suitabilityVersion = undefined;
  const before = payload;
  await assert.rejects(analyzer.assessSubbeats('/state','shared-cache-id-1','track-1','a'.repeat(64),'/stems'), /Update the analyzer/);
  assert.equal(payload,before);
  supported = true;
  assert.equal(await analyzer.subbeatsAvailable(),false,'shared-cache-only analyzers cannot silently omit flags');
  suitabilityVersion = 1; supported = false;
  const result = await analyzer.assessSubbeats('/state','shared-cache-id-1','track-1','a'.repeat(64),'/stems');
  assert.deepEqual(result.suitability,suitability);
  assert.equal(result.addedBytes,0);
  assert.deepEqual(payload,{state_dir:'/state',cache_id:'shared-cache-id-1',stems_root:'/stems',track_id:'track-1',bundle_key:'a'.repeat(64)});
  supported = true;
});

test('cue methods are forwarded and an older analyzer cannot silently return classic preparation', async () => {
  await assert.rejects(analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0'),/Update the heavy analyzer/);
  assert.equal(payload?.method,'small0');
  cueResponse={version:1,model:'small0',artifactKey:'f'.repeat(64),incoming:[],outgoing:[]};
  await assert.rejects(analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0'),/Update the heavy analyzer for natural-start cue preparation/);
  cueResponse={...cueResponse,durationSeconds:200};
  await assert.rejects(analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0'),/Update the heavy analyzer for natural-start cue preparation/);
  cueResponse={...cueResponse,algorithmVersion:3};
  await assert.rejects(analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0'),/Update the heavy analyzer for natural-start cue preparation/);
  cueResponse={...cueResponse,algorithmVersion:4};
  await assert.rejects(analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0'),/Update the heavy analyzer for natural-start cue preparation/);
  cueResponse={...cueResponse,algorithmVersion:5};
  await assert.rejects(analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0'),/Update the heavy analyzer for natural-start cue preparation/);
  cueResponse={...cueResponse,algorithmVersion:6};
  await assert.rejects(analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0'),/Update the heavy analyzer for natural-start cue preparation/);
  cueResponse={...cueResponse,algorithmVersion:7};
  await assert.rejects(analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0'),/Update the heavy analyzer for natural-start cue preparation/);
  cueResponse={...cueResponse,algorithmVersion:8};
  await assert.rejects(analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0'),/Update the heavy analyzer for natural-start cue preparation/);
  cueResponse={...cueResponse,algorithmVersion:12};
  await assert.rejects(analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0'),/Update the heavy analyzer for natural-start cue preparation/);
  cueResponse={...cueResponse,algorithmVersion:13};
  await assert.rejects(analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0'),/save cue coverage/);
  coverageResponse={version:1,artifactKey:'d'.repeat(64),incoming:null,outgoing:null};
  const result=await analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0');
  assert.equal(result.cuePoints?.model,'small0');
  assert.equal(payload?.method,'small0');
  await analyzer.prepareSubbeats('/audio','/state','shared-cache-id-1','track-1',{stems_root:'/stems',remaining_bytes:1024},'small0',{bundle_key:'a'.repeat(64),cue_key:'f'.repeat(64)});
  assert.equal(payload?.bundle_key,'a'.repeat(64));assert.equal(payload?.cue_key,'f'.repeat(64));
  cueResponse=undefined;coverageResponse=undefined;
});

test('migration receives the same root and byte headroom without a source download', async () => {
  const result = await analyzer.migrateSubbeatsCache('/state','shared-cache-id-1',{stems_root:'/stems',remaining_bytes:1024});
  assert.equal(result.addedBytes,12);
  assert.deepEqual(payload,{state_dir:'/state',cache_id:'shared-cache-id-1',stems_root:'/stems',remaining_bytes:1024});
});

test('Sub/Beats preserves the analyzer failure detail for the preparation list', async () => {
  globalThis.fetch = (async url => String(url).endsWith('/health')
    ? Response.json({ ok: true, engines: ['analyze'], analyze_subbeats_capable: true, analyze_subbeats_cache_version:2, analyze_subbeats_suitability_version:1 })
    : Response.json({ detail: 'CUDA out of memory' }, { status: 422 })) as typeof fetch;
  await assert.rejects(analyzer.prepareSubbeats('/audio', '/state', 'shared-cache-id-1', 'track-1', {stems_root:'/stems',remaining_bytes:1024}),
    /analyze sidecar 422: CUDA out of memory/);
});
