import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BeatGridProvenance } from '../src/schemas/beat-grid.js';
import type { RenderTransitionPayload } from '../src/music/analyzer.js';

test('the real queue arms a working stem blend and forwards its selected style to the analyzer', async () => {
  const requests: RenderTransitionPayload[] = [];
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') { res.end(JSON.stringify({ ok: true, engines: ['analyze'] })); return; }
    assert.equal(req.url, '/render-transition');
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body: RenderTransitionPayload = JSON.parse(raw); requests.push(body);
    assert.equal(body.out.regular_key, 'tail-proof');
    assert.equal(body.in.regular_key, 'head-proof');
    assert.ok(['drums-late', 'rhythm-late', 'vocals-late'].includes(body.regular_style ?? ''));
    const clip = path.join(body.out_dir, body.clip_name);
    await mkdir(body.out_dir, { recursive: true }); await writeFile(clip, 'rendered seam');
    res.end(JSON.stringify({ ok: true, path: clip, blend_start_sec: 209, in_cue_sec: 25, clip_sec: 24 }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  process.env.ANALYZE_URL = `http://127.0.0.1:${address.port}`;
  process.env.NAVIDROME_URL = 'http://127.0.0.1:9';
  process.env.SUBWAVE_REGULAR_STEMS_ROLLOUT = 'working';
  const settings = await import('../src/settings.js');
  const library = await import('../src/music/library.js');
  const db = await import('../src/music/library-db.js');
  const analyzer = await import('../src/music/analyzer.js');
  const { config } = await import('../src/config.js');
  const { queue } = await import('../src/broadcast/queue.js');
  const { regularStemRuntime: runtime } = await import('../src/broadcast/regular-stem-runtime.js');
  await settings.load(); await library.load();
  await settings.update({ personas: settings.get().personas.map(p => ({ ...p, djMode: true })),
    transitions: { pairDrain: true, stemBlends: true }, loudness: { source: 'measured' } });
  const grid: BeatGridProvenance = { version: 1, backend: 'beat-this-onnx', model: 'small0',
    modelSha256: 'a'.repeat(64), preprocessingVersion: 1, windowStartMs: 0, windowEndMs: 40000,
    evidence: { medianBpm: 80, intervalSupport: 1, librosaBeatSupport: null },
    source: { sha256: 'b'.repeat(64), bytes: 12345, complete: true } };
  for (const id of ['out', 'in']) {
    const trackGrid = id === 'in' ? { ...grid, evidence: { ...grid.evidence, medianBpm: 136.364 } } : grid;
    db.upsertTrackMeta(id, { title: id, artist: id, duration: 240, genres: ['Rock'] });
    db.upsertTrackAnalysis(id, { bpm: id === 'out' ? 63 : 143.6, bars: Array.from({ length: 12 }, (_, i) => 1000 + i * 2000),
      beats: [500, 1000], gridProvenance: trackGrid, loudnessLufs: -14, peakDb: -2 });
    db.getDb()!.prepare('UPDATE tracks SET outro_json=? WHERE id=?').run(JSON.stringify({
      startMs: 235000, ending: 'cold', bars: Array.from({ length: 12 }, (_, i) => 200000 + i * 3000),
      gridProvenance: { ...grid, windowStartMs: 180000, windowEndMs: 240000 },
    }), id);
  }
  const original = { update: runtime.update, pending: runtime.pending, sources: runtime.sources };
  const releases: boolean[] = [];
  runtime.update = () => {}; runtime.pending = () => false;
  runtime.sources = async () => ({ valid: () => true,
    tail: { stemsDir: '/test/working/out', regularKey: 'tail-proof' },
    head: { stemsDir: '/test/working/in', regularKey: 'head-proof' },
    release: async (completed = true) => { releases.push(completed); } });
  const q = queue as any;
  q._renderSubbeats = async () => null; q.verifyPushResolved = async () => {};
  q.current = { track: { id: 'live', duration: 300 }, startedAt: new Date(Date.now() - 120000).toISOString() };
  q.upcoming = ['out', 'in'].map(id => ({ track: { id, title: id, artist: id, duration: 240, gainDb: 0 },
    sent: false, queuedAt: new Date().toISOString() }));
  const consumer = setInterval(() => { void rm(config.liquidsoap.queueFile, { force: true }); }, 20);
  try {
    await queue.drainToLiquidsoap();
    assert.equal(requests.length, 1, 'a large shared-grid tempo difference still reaches the analyzer');
    assert.equal(q.upcoming[0].sent, true);
    assert.equal(q.upcoming[0].stemBlend.regular.style, requests[0].regular_style);
    assert.equal(q.upcoming[1].stemSeam, true);
    assert.deepEqual(releases, [true]);
  } finally {
    Object.assign(runtime, original); clearInterval(consumer);
    if (q._persistTimer) clearTimeout(q._persistTimer);
    if (q._recentPlaysTimer) clearTimeout(q._recentPlaysTimer);
    analyzer.shutdown(); db.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
