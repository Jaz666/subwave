import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('real Stem Beats decoding, completion stamps and rendering agree inside the analyzer image', {
  skip: !process.env.SUBWAVE_STEMBEATS_TEST_IMAGE && 'set SUBWAVE_STEMBEATS_TEST_IMAGE for the isolated audio check',
}, () => {
  const run = spawnSync('docker', ['run', '--rm', '--network', 'none', '--cpus=2',
    '-e', 'PYTHONPATH=/review', '-e', 'OMP_NUM_THREADS=1', '-e', 'OPENBLAS_NUM_THREADS=1',
    '-v', `${fileURLToPath(new URL('.', import.meta.url))}:/review:ro`,
    '--entrypoint', '/opt/analyzer/venv/bin/python', process.env.SUBWAVE_STEMBEATS_TEST_IMAGE!,
    '-c', "import runpy; runpy.run_path('/review/analyzer_stembeats_window_test.py', run_name='__main__'); runpy.run_path('/review/subbeats_live_v2_integration_test.py', run_name='__main__')"], { encoding: 'utf8', timeout: 120000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
  process.stdout.write(run.stdout);
});

test('Stem Beats pick-time windows require the versioned CPU window acknowledgement', async () => {
  let version: number | null = null;
  let wrong = '';
  let posts = 0;
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/health') {
      res.end(JSON.stringify({ ok: true, engines: ['analyze'], analyze_stembeats_stem_windows_version: version }));
      return;
    }
    posts++;
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    res.end(JSON.stringify({ ok: true, source: { stems_device: wrong === 'cpu' ? 'cuda' : 'cpu' },
      facets: { stems: { status: 'ok', data: { stembeats_window: {
        ...body.stembeats_window, device: 'cpu', sample_rate: 44100,
        samples: wrong === 'samples' ? 10 : Math.round(body.stembeats_window.end_ms * 44.1)
          - Math.round(body.stembeats_window.start_ms * 44.1),
        ...(wrong === 'key' ? { key: 'c'.repeat(64) } : {}),
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
    stems_dir: '/test-only/stembeats/job', complete: true,
    stembeats_window: { version: 1 as const, side: 'tail' as const,
      start_ms: 4410001 * 1000 / 44100, end_ms: 5821207 * 1000 / 44100, key: 'a'.repeat(64),
      source_sha256: 'b'.repeat(64), source_bytes: 123, model: 'htdemucs' } };
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
    version = null;
    await assert.rejects(analyzer.analyzeFacets('track', opts, '/test/audio.flac'), /does not support/);
    assert.equal(posts, 4);
  } finally {
    analyzer.shutdown();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
