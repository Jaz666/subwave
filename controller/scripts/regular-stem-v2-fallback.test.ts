import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { BeatGridProvenance } from '../src/schemas/beat-grid.js';

test('a V2-ready refusal releases the real Regular runtime, with independent tempo and deadline gates', async () => {
  const audio = Buffer.alloc(2048, 1), fingerprint = createHash('sha256').update(audio).digest('hex');
  const events: string[] = [];
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') {
      res.end(JSON.stringify({ ok: true, engines: ['analyze'], analyze_regular_stems_version: 2 })); return;
    }
    if (!['/analyze', '/render-transition'].includes(req.url!)) {
      res.setHeader('Content-Type', 'audio/flac');
      res.end(audio); return;
    }
    let raw = ''; for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    if (req.url === '/analyze') {
      const window = body.regular_stem_window;
      assert.ok(window, 'current grids must not trigger unrelated analysis');
      assert.ok(events.includes('v2-declined'), 'Regular extraction must follow V2 refusal');
      events.push(window.side);
      // Ensure the sender really yields to the preparation owner.
      await new Promise(resolve => setTimeout(resolve, 50));
      const stamp = { ...window, device: 'cpu', sample_rate: 44100,
        samples: Math.round((window.end_ms-window.start_ms)*44.1) };
      for (const name of ['drums', 'bass', 'other', 'vocals'])
        await writeFile(path.join(body.stems_dir, `${window.side}-${name}.flac`), 'fixture');
      await writeFile(path.join(body.stems_dir, `${window.side}-regular.json`), JSON.stringify(stamp));
      res.end(JSON.stringify({ ok: true, source: { stems_device: 'cpu' },
        facets: { stems: { status: 'ok', data: { regular_window: stamp } } } }));
    } else {
      const tail = JSON.parse(await readFile(path.join(body.out.stems_dir, 'tail-regular.json'), 'utf8'));
      const head = JSON.parse(await readFile(path.join(body.in.stems_dir, 'head-regular.json'), 'utf8'));
      assert.equal(body.out.regular_key, tail.key); assert.equal(body.in.regular_key, head.key);
      events.push('regular-render');
      await mkdir(body.out_dir, { recursive: true });
      const clip = path.join(body.out_dir, body.clip_name);
      await writeFile(clip, 'fixture');
      const duration = (tail.end_ms-tail.start_ms)/1000;
      res.end(JSON.stringify({ ok: true, path: clip, blend_start_sec: tail.start_ms/1000,
        in_cue_sec: head.start_ms/1000+duration, clip_sec: duration, regular_style: body.regular_style }));
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  process.env.LRCLIB_URL = process.env.ANALYZE_URL = process.env.NAVIDROME_URL = `http://127.0.0.1:${address.port}`;
  process.env.NAVIDROME_USER = 'u'; process.env.NAVIDROME_PASS = 'p';
  process.env.SUBWAVE_REGULAR_STEMS_ROLLOUT = 'working';
  const { config } = await import('../src/config.js');
  const settings = await import('../src/settings.js');
  const db = await import('../src/music/library-db.js');
  const library = await import('../src/music/library.js');
  const analyzer = await import('../src/music/analyzer.js');
  const { createSubbeatsPrepV2Store } = await import('../src/music/subbeats-prep-v2-store.js');
  await settings.load(); await library.load();
  await settings.update({ personas: settings.get().personas.map(p => ({ ...p, djMode: true })),
    transitions: { pairDrain: true, stemBlends: true, subbeatsLive: true }, loudness: { source: 'measured' } });
  const ids = ['out', 'in', 'late-out', 'late-in', 'fast-out', 'fast-in', 'force-out', 'force-in', 'cancel-out', 'cancel-in'];
  const store = createSubbeatsPrepV2Store(config.stateDir);
  const run = store.createRun({ baselineSha256: null, scope: 'selected', algorithmVersion: 4,
    jobs: ids.map(id => ({ id, title: id, artist: 'Fixture', album: '' })) });
  const grid: BeatGridProvenance = { version: 1, backend: 'beat-this-onnx', model: 'small0',
    modelSha256: 'a'.repeat(64), preprocessingVersion: 1, windowStartMs: 0, windowEndMs: 40000,
    evidence: { medianBpm: 120, intervalSupport: 1, librosaBeatSupport: null },
    source: { sha256: fingerprint, bytes: audio.length, complete: true } };
  for (const id of ids) {
    db.upsertTrackMeta(id, { title: id, artist: 'Fixture', duration: 240, fileSize: audio.length, genres: ['House'] });
    db.upsertTrackAnalysis(id, { bpm: 120, beats: [500, 1000],
      bars: Array.from({ length: 16 }, (_, i) => 1000+i*2000), loudnessLufs: -14, peakDb: -2,
      gridProvenance: id === 'fast-in' ? { ...grid, evidence: { ...grid.evidence, medianBpm: 140 } } : grid });
    db.getDb()!.prepare('UPDATE tracks SET outro_json=? WHERE id=?').run(JSON.stringify({
      startMs: 235000, ending: 'cold', bars: Array.from({ length: 24 }, (_, i) => 190000+i*2000),
      gridProvenance: { ...grid, windowStartMs: 180000, windowEndMs: 240000 },
    }), id);
    const artifact = store.writeGridArtifact(run.runId, id, 'outgoing', {
      version: 1, backend: 'beat-this-onnx', model: 'small0', modelSha256: 'a'.repeat(64), preprocessingVersion: 1,
      sourceSha256: fingerprint, sourceBytes: audio.length, windowStartSeconds: 0, windowEndSeconds: 240,
      beatsSeconds: Array.from({ length: 480 }, (_, i) => i*.5),
      downbeatsSeconds: Array.from({ length: 120 }, (_, i) => i*2),
    });
    store.claim(run.runId, id);
    const role = (sourceSeconds: number) => ({ status: 'cue-ready' as const, reason: null, gridArtifact: artifact,
      cuePoints: [{ sourceSeconds, phraseEndSeconds: sourceSeconds+6, bpm: 120, strength: 1, reason: 'arrangement' as const }],
      coverageStartSeconds: 0, coverageEndSeconds: 240 });
    store.complete(run.runId, id, { source: { sha256: fingerprint, bytes: audio.length, durationSeconds: 240 },
      roles: { incoming: role(32), outgoing: role(210) } });
  }
  // Import the production lookup only after its on-disk evidence exists.
  const subbeats = await import('../src/broadcast/subbeats.js');
  const { queue } = await import('../src/broadcast/queue.js');
  const { regularStemRuntime: runtime } = await import('../src/broadcast/regular-stem-runtime.js');
  const until = Date.now()+5000;
  while (!subbeats.subbeatsPairHasV2Plan('out', 'in') && Date.now()<until)
    await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(subbeats.subbeatsPairHasV2Plan('out', 'in'), true);
  // Control private sender timing and bypass mixer I/O without a production test API.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = queue as any;
  q.verifyPushResolved = async () => {};
  const make = (id: string) => ({ track: { id, title: id, artist: 'Fixture', duration: 240, gainDb: 0 },
    sent: false, queuedAt: new Date().toISOString() });
  const current = () => ({ track: { id: 'live', duration: 300 }, startedAt: new Date(Date.now()-120000).toISOString() });
  let attempts = 0;
  q._renderSubbeats = async (out: { id: string }, incoming: { id: string }) => {
    attempts++; assert.equal(subbeats.subbeatsPairHasV2Plan(out.id, incoming.id), true);
    assert.ok(!events.includes('tail') && !events.includes('head'));
    if (out.id === 'out') assert.ok(runtime.pair(out.id, incoming.id), 'V2 priority must not revoke Regular admission');
    events.push('v2-declined');
    if (out.id === 'late-out') q.current.startedAt = new Date(Date.now()-260000).toISOString();
    if (out.id === 'cancel-out') q.upcoming = [];
    return null;
  };
  const consumer = setInterval(() => { void rm(config.liquidsoap.queueFile, { force: true }); }, 20);
  try {
    q.current = current(); q.upcoming = [make('out'), make('in')];
    const outgoing = q.upcoming[0];
    await queue.drainToLiquidsoap();
    assert.equal(outgoing.sent, false, 'the Regular owner gets time to prepare');
    const deadline = Date.now()+10000;
    while ((!outgoing.sent || q.senderBusy) && Date.now()<deadline) {
      await new Promise(resolve => setTimeout(resolve, 20)); await queue.drainToLiquidsoap();
    }
    assert.equal(outgoing.sent, true);
    assert.equal(q.senderBusy, false);
    assert.ok(outgoing.stemBlend?.regular, 'the real admitted windows reach the Regular renderer');
    assert.deepEqual(events, ['v2-declined', 'tail', 'head', 'regular-render']);
    assert.equal(attempts, 1, 'preparation wakeups must not restart V2');
    for (const prefix of ['late', 'fast', 'force', 'cancel']) {
      events.length = 0;
      q.current = current(); q.upcoming = [make(`${prefix}-out`), make(`${prefix}-in`)];
      const item = q.upcoming[0];
      await queue.drainToLiquidsoap(prefix === 'force');
      assert.deepEqual(events, ['v2-declined'], `${prefix} must not start Regular extraction or render`);
      if (prefix === 'cancel') assert.deepEqual(q.upcoming, []);
      else assert.equal(item.sent, true, `${prefix} commits ordinary audio`);
    }
  } finally {
    runtime.update(null, [], () => {}, () => {});
    clearInterval(consumer);
    if (q._persistTimer) clearTimeout(q._persistTimer);
    if (q._recentPlaysTimer) clearTimeout(q._recentPlaysTimer);
    analyzer.shutdown(); library.shutdown(); db.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
