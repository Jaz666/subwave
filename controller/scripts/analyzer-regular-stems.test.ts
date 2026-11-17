import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';

test('regular jobs reject old workers before POST and verify CPU/window acknowledgements', async () => {
  let version: number | null = null;
  let wrong = '';
  let posts = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') {
      res.end(JSON.stringify({ ok: true, engines: ['analyze'], analyze_regular_stems_version: version }));
      return;
    }
    posts++;
    if (wrong === 'path') {
      res.statusCode = 422;
      res.end(JSON.stringify({ detail: { code: 'path_unavailable', message: 'missing shared source' } }));
      return;
    }
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    res.end(JSON.stringify({ ok: true, source: { stems_device: wrong === 'cpu' ? 'cuda' : 'cpu' },
      facets: { stems: { status: 'ok', data: { regular_window: {
        ...body.regular_stem_window, device: 'cpu', sample_rate: 44100,
        samples: wrong === 'samples' ? 10 : 1411200,
        ...(wrong === 'key' ? { key: 'wrong-recording' } : {}),
      } } } } }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  process.env.ANALYZE_URL = `http://127.0.0.1:${address.port}`;
  process.env.NAVIDROME_URL = process.env.ANALYZE_URL;
  process.env.NAVIDROME_USER = 'u'; process.env.NAVIDROME_PASS = 'p';
  const analyzer = await import('../src/music/analyzer.js');
  const opts = { facets: ['stems'] as ['stems'], stems_device: 'cpu' as const,
    stems_dir: '/test-only/working/job', complete: true,
    regular_stem_window: { version: 1 as const, side: 'tail' as const,
      start_ms: 100000, end_ms: 132000, key: 'recording-window-model' } };
  try {
    await assert.rejects(analyzer.analyzeFacets('track', opts, '/test/audio.flac'), /does not support/);
    assert.equal(posts, 0);
    version = 1;
    await analyzer.analyzeFacets('track', opts, '/test/audio.flac');
    assert.equal(posts, 1);
    for (const failure of ['key', 'samples', 'cpu']) {
      wrong = failure;
      await assert.rejects(analyzer.analyzeFacets('track', opts, '/test/audio.flac'), /acknowledge|mismatched/);
    }
    wrong = 'path';
    await assert.rejects(analyzer.analyzeFacets('track', opts, '/test/audio.flac'), /missing shared source/);
    version = null;
    await assert.rejects(analyzer.analyzeFacets('track', opts, '/test/audio.flac'), /does not support/);
    assert.equal(posts, 5);
  } finally {
    analyzer.shutdown();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
