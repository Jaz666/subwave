import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const stateDir = mkdtempSync(join(tmpdir(), 'subwave-render-source-'));
process.env.STATE_DIR = stateDir;
const cache = await import('../src/music/stem-cache.js');
const storeModule = await import('../src/music/subbeats-store.js');
const store = storeModule.createSubbeatsStore(stateDir);
const id = 'subbeats-track';
const key = 'a'.repeat(64);
const trackDir = join(stateDir, 'stems', id);
const bundleDir = join(trackDir, 'subbeats', 'v1', key);

mkdirSync(bundleDir, { recursive: true });
const files: Record<string, { bytes: number }> = {};
for (const stem of cache.STEM_NAMES) {
  const name = `head-${stem}.flac`;
  const bytes = Buffer.from(`fixture ${stem}`);
  writeFileSync(join(bundleDir, name), bytes);
  files[name] = { bytes: bytes.length };
}
writeFileSync(join(bundleDir, 'analysis.json'), JSON.stringify({ duration_seconds: 120 }));
writeFileSync(join(bundleDir, 'manifest.json'), JSON.stringify({
  identity: {
    mode: 'analysis_and_stems', source_sha256: 'b'.repeat(64),
    separator: { sample_rate: 44100, subtype: 'PCM_24-shared-gain-v1' },
  },
  metadata: { stem_regions: [{ name: 'head', start_sample: 0, end_sample: 44100, sample_rate: 44100, storage_gain: 1 }] },
  files,
}));
store.enqueue([{ id, title: 'Track', artist: 'Artist', album: 'Album' }]);
store.event({ id, status: 'running' }, [id]);
store.event({ id, status: 'prepared', bundleKey: key }, [id]);

after(() => rmSync(stateDir, { recursive: true, force: true }));

test('regular blend source can use a complete prepared Sub/Beats head region', async () => {
  assert.equal(await cache.hasWindow(id, 'head'), false, 'ordinary cache semantics remain unchanged');
  assert.deepEqual(await cache.subbeatsBundleSource(id, 'head'), { subbeatsBundleDir: bundleDir, subbeatsBundleKey: key });
  assert.deepEqual(await cache.renderSource(id, 'head'), {
    stemsDir: trackDir, subbeatsBundleDir: bundleDir, subbeatsBundleKey: key,
  });
});

test('corrupt or incomplete Sub/Beats regions remain cache misses', async () => {
  writeFileSync(join(bundleDir, 'head-drums.flac'), 'bad size');
  assert.equal(await cache.renderSource(id, 'head'), null);
});

test('a canonical regular stem window takes precedence over Sub/Beats', async () => {
  for (const stem of cache.STEM_NAMES) writeFileSync(join(trackDir, `head-${stem}.flac`), 'regular');
  assert.deepEqual(await cache.renderSource(id, 'head'), { stemsDir: trackDir });
});
