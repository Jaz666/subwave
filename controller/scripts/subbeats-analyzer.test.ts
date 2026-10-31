import test, { after } from 'node:test';
import assert from 'node:assert/strict';

process.env.ANALYZE_URL = 'http://127.0.0.1:9';
process.env.ANALYZE_PYTHON = '';
const analyzer = await import('../src/music/analyzer.js');
const realFetch = globalThis.fetch;
after(() => { globalThis.fetch = realFetch; analyzer.shutdown(); });

let supported: boolean | undefined;
let version:number | undefined;
let payload: Record<string, unknown> | null = null;
globalThis.fetch = (async (url, options) => {
  if (String(url).endsWith('/health')) return Response.json({ ok: true, engines: ['analyze'], analyze_subbeats_capable: supported, analyze_subbeats_cache_version:version });
  payload = JSON.parse(String(options?.body));
  return Response.json({ ok: true, cache_added_bytes:12, subbeats_result: { status: 'prepared', bundleKey: 'a'.repeat(64), error: null } });
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

test('migration receives the same root and byte headroom without a source download', async () => {
  const result = await analyzer.migrateSubbeatsCache('/state','shared-cache-id-1',{stems_root:'/stems',remaining_bytes:1024});
  assert.equal(result.addedBytes,12);
  assert.deepEqual(payload,{state_dir:'/state',cache_id:'shared-cache-id-1',stems_root:'/stems',remaining_bytes:1024});
});

test('Sub/Beats preserves the analyzer failure detail for the preparation list', async () => {
  globalThis.fetch = (async url => String(url).endsWith('/health')
    ? Response.json({ ok: true, engines: ['analyze'], analyze_subbeats_capable: true, analyze_subbeats_cache_version:2 })
    : Response.json({ detail: 'CUDA out of memory' }, { status: 422 })) as typeof fetch;
  await assert.rejects(analyzer.prepareSubbeats('/audio', '/state', 'shared-cache-id-1', 'track-1', {stems_root:'/stems',remaining_bytes:1024}),
    /analyze sidecar 422: CUDA out of memory/);
});
