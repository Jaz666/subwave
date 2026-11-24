import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';

test('queued Regular grids have one owner and new grid phases yield to Stem Beats priority', async () => {
  const audio = Buffer.alloc(2048, 1), sha256 = createHash('sha256').update(audio).digest('hex');
  const requests: Array<{ facets: string[]; tail_grid_seconds?: number }> = [];
  let held: ServerResponse | undefined;
  const grid = (start: number, end: number) => ({ version: 1, backend: 'beat-this-onnx', model: 'small0',
    modelSha256: 'a'.repeat(64), preprocessingVersion: 1, windowStartMs: start, windowEndMs: end,
    evidence: { medianBpm: 120, intervalSupport: 1, librosaBeatSupport: null },
    source: { sha256, bytes: audio.length, complete: true } });
  const head = () => ({ ok: true, facets: { head: { status: 'ok', data: {
    beats: [500, 1000], bars: Array.from({ length: 16 }, (_, i) => 1000+i*2000),
    grid_provenance: grid(0, 60000),
  } } } });
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') { res.end(JSON.stringify({ ok: true, engines: ['analyze'] })); return; }
    if (req.url !== '/analyze') { res.setHeader('Content-Type', 'audio/flac'); res.end(audio); return; }
    let raw = ''; for await (const part of req) raw += part;
    const body = JSON.parse(raw); requests.push(body);
    if (body.facets.includes('head')) { held = res; return; }
    res.end(JSON.stringify({ ok: true, facets: { tail: { status: 'ok', data: { outro: {
      startMs: 235000, ending: 'cold', beats: [181000, 182000],
      bars: Array.from({ length: 28 }, (_, i) => 181000+i*2000), gridProvenance: grid(180000, 240000),
    } } } } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  process.env.NAVIDROME_URL = process.env.ANALYZE_URL = `http://127.0.0.1:${address.port}`;
  process.env.NAVIDROME_USER = 'fixture'; process.env.NAVIDROME_PASS = 'fixture';
  const settings = await import('../src/settings.js');
  const library = await import('../src/music/library.js');
  const db = await import('../src/music/library-db.js');
  const analyzer = await import('../src/music/analyzer.js');
  const tail = await import('../src/music/regular-tail-grid.js');
  const generic = await import('../src/music/beat-grid-upgrade.js');
  const { queue } = await import('../src/broadcast/queue.js');
  const { regularStemRuntime: runtime } = await import('../src/broadcast/regular-stem-runtime.js');
  await library.load(); await settings.load();
  await settings.update({ transitions: { stemsStyle: 'legacy', stemBlends: true, pairDrain: true },
    personas: settings.get().personas.map(p => ({ ...p, djMode: true })) });
  for (const id of ['a', 'b']) db.upsertTrackMeta(id, { title: id, artist: 'Fixture', duration: 240, fileSize: audio.length });
  // This test controls pair priority and avoids mixer I/O; grid/source workers are real.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q = queue as any;
  const saved = { drain: q.drainToLiquidsoap, priority: q.stemBeatsHasPriority };
  q.drainToLiquidsoap = async () => {};
  let priority = false;
  q.stemBeatsHasPriority = () => priority;
  q.current = { track: { id: 'live', duration: 300 }, startedAt: new Date(Date.now()-120000).toISOString() };
  q.upcoming = ['a', 'b'].map(id => ({ track: { id, title: id, duration: 240 }, sent: false }));
  const waitFor = async (ready: () => boolean) => {
    const limit = Date.now()+5000;
    while (!ready() && Date.now()<limit) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(ready(), 'grid operation settled');
  };
  try {
    q.syncRegularStemPreparation();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(requests.length, 0, 'Legacy never upgrades the shared beat grid');
    assert.equal(generic.upgradeDue('a'), false, 'shared grid refresh is opt-in');
    assert.equal(await generic.ensureCurrent('a', () => {}), false, 'direct shared-grid refresh is blocked in Legacy');
    assert.equal(tail.regularTailGridDue('a'), false, 'wider shared-grid measurement is opt-in');
    tail.ensureRegularTailGrid('a', () => {}, () => {});
    await settings.update({ transitions: { stemsStyle: 'new-style', newStyleStemBlends: true } });
    q.syncRegularStemPreparation();
    await waitFor(() => !!held);
    assert.deepEqual(requests.map(r => r.facets), [['head']], 'generic and Regular must not both own the queued track');
    priority = true;
    q.syncRegularStemPreparation();
    held!.end(JSON.stringify(head())); held = undefined;
    await waitFor(() => !tail.regularTailGridPending('a'));
    assert.equal(requests.length, 1, 'a priority change prevents the next tail measurement');
    q.syncRegularStemPreparation();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(requests.length, 1, 'no new grid work competes with the immediate V2 pair');
    priority = false;
    q.syncRegularStemPreparation();
    await waitFor(() => !tail.regularTailGridPending('a'));
    assert.deepEqual(requests.map(r => r.facets), [['head'], ['tail']]);
    assert.equal(requests[1].tail_grid_seconds, 60);
    assert.equal(db.getTrack('a')!.outro!.gridProvenance!.windowStartMs, 180000);
    assert.equal(tail.regularTailGridDue('a'), false, 'wider coverage survives subsequent queue synchronization');
    q.syncRegularStemPreparation(true);
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(requests.length, 2, 'force-send starts no new grid preparation');
    await settings.update({ transitions: { newStyleStemBlends: false } });
    q.syncRegularStemPreparation();
    await waitFor(() => !!held);
    assert.deepEqual(requests[2].facets, ['head', 'tail'], 'the generic refresh remains available with Regular disabled');
    await settings.update({ transitions: { newStyleStemBlends: true } });
    q.syncRegularStemPreparation();
    await new Promise(resolve => setTimeout(resolve, 30));
    assert.equal(requests.length, 3, 'an in-flight generic refresh settles before Regular can take ownership');
    const genericAnswer = head();
    held!.end(JSON.stringify({ ...genericAnswer, facets: { ...genericAnswer.facets, tail: { status: 'ok', data: { outro: {
      startMs: 235000, ending: 'cold', beats: [221000, 222000], bars: [221000, 223000],
      gridProvenance: grid(220000, 240000),
    } } } } })); held = undefined;
    await waitFor(() => !generic.upgradePending());
    q.syncRegularStemPreparation();
    await waitFor(() => !tail.regularTailGridPending('b'));
    assert.deepEqual(requests[3].facets, ['tail']);
    assert.equal(db.getTrack('b')!.outro!.gridProvenance!.windowStartMs, 180000,
      'wider coverage is written after the generic owner releases the track');
  } finally {
    if (held) held.end(JSON.stringify(head()));
    await waitFor(() => !tail.regularTailGridPending('a'));
    q.upcoming = []; q.current = null;
    q.drainToLiquidsoap = saved.drain; q.stemBeatsHasPriority = saved.priority;
    runtime.update(null, [], () => {}, () => {});
    analyzer.shutdown(); library.shutdown(); db.close(); server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
