// Dashboard coverage must count cue artifacts, without relaxing blend admission.
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import { listen } from './test-utils/http.js';

process.env.ADMIN_USER = 'test';
process.env.ADMIN_PASS = 'test';
const stateDir = process.env.STATE_DIR!;
const cache = await import('../src/music/stem-cache.js');
const { createSubbeatsStore, invalidateSubbeatsBundles } = await import('../src/music/subbeats-store.js');
const { router } = await import('../src/routes/stem-cache.js');
const store = createSubbeatsStore(stateDir);
const app = express();
app.use(router);
const http = await listen(app);
after(http.close);
const auth = { Authorization: `Basic ${Buffer.from('test:test').toString('base64')}` };
const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const baseKey = 'a'.repeat(64), cueKey = 'b'.repeat(64), coverageKey = 'c'.repeat(64);
const source = 'd'.repeat(64);
const separator = { sample_rate: 44100, subtype: 'PCM_24-shared-gain-v1' };
const activity = { version: 1, method: 'stem-energy', barAlignment: 'unverified',
  coverageStartSeconds: 0, coverageEndSeconds: 120, resolutionSeconds: 0.05, passages: [] };

function seed(id: string, { legacy = false, classic = false } = {}) {
  const root = legacy ? join(stateDir, 'subbeats', 'v1') : join(cache.dirFor(id), 'subbeats', 'v1');
  const base = join(root, baseKey), cue = join(root, cueKey), coverage = join(root, coverageKey);
  for (const folder of [base, cue, coverage]) mkdirSync(folder, { recursive: true });
  const regions = ['head', 'exit'].map(name => ({ name, start_sample: name === 'head' ? 0 : 44100 * 100,
    end_sample: name === 'head' ? 44100 * 40 : 44100 * 120, sample_rate: 44100, storage_gain: 1 }));
  const files: Record<string, { bytes: number }> = {};
  const target = classic ? base : coverage;
  for (const name of ['head', 'exit']) for (const stem of cache.STEM_NAMES) {
    const file = `${name}-${stem}.flac`;
    writeFileSync(join(target, file), 'fixture stems');
    files[file] = { bytes: Buffer.byteLength('fixture stems') };
  }
  const parent = JSON.stringify({ identity: { mode: classic ? 'analysis_and_stems' : 'cue-source',
    source_sha256: source, separator }, metadata: { stem_regions: classic ? regions : [] }, files: classic ? files : {} });
  const cueManifest = JSON.stringify({ identity: { mode: 'cue-points', source_sha256: source } });
  writeFileSync(join(base, 'manifest.json'), parent);
  writeFileSync(join(base, 'analysis.json'), JSON.stringify({ duration_seconds: 120 }));
  writeFileSync(join(cue, 'manifest.json'), cueManifest);
  writeFileSync(join(coverage, 'manifest.json'), JSON.stringify({ identity: { mode: 'cue-coverage', version: 2,
    source_sha256: source, separator, bundle_sha256: sha(parent), cue_sha256: sha(cueManifest) },
  metadata: { stem_regions: regions }, files }));
  store.enqueue([{ id, title: id, artist: 'Fixture', album: '' }]);
  store.event({ id, status: 'running' }, [id]);
  store.event({ id, status: 'prepared', bundleKey: baseKey,
    ...(classic ? {} : {
      cuePoints: { version: 1, model: 'small0', artifactKey: cueKey, incoming: [], outgoing: [] },
      cueCoverage: { version: 1, artifactKey: coverageKey, incoming: activity, outgoing: activity },
    }),
  }, [id]);
  return { base, cue, target };
}

async function coverage(...ids: string[]) {
  const response = await fetch(`${http.url}/stem-cache/coverage?ids=${encodeURIComponent(ids.join(','))}`, { headers: auth });
  assert.equal(response.status, 200);
  return (await response.json() as { coverage: Record<string, {
    regular: { head: boolean; tail: boolean }; subbeats: { head: boolean; exit: boolean };
  }> }).coverage;
}

test('Queue tooltip reports full cue coverage and independent regular stems', async () => {
  seed('cue-track');
  for (const stem of cache.STEM_NAMES) writeFileSync(join(cache.dirFor('cue-track'), `head-${stem}.flac`), 'regular');
  assert.deepEqual((await coverage('cue-track'))['cue-track'], {
    regular: { head: true, tail: false }, subbeats: { head: true, exit: true },
  });
  assert.equal(await cache.subbeatsBundleSource('cue-track', 'head'), null, 'tooltip coverage does not authorise a regular blend');
});

test('classic and unmigrated Sub/Beats bundles are still reported', async () => {
  seed('classic', { classic: true });
  seed('legacy', { legacy: true });
  const result = await coverage('classic', 'legacy', 'not-cached');
  for (const id of ['classic', 'legacy']) assert.deepEqual(result[id].subbeats, { head: true, exit: true });
  assert.deepEqual(result['not-cached'].subbeats, { head: false, exit: false });
});

test('missing or truncated cue stems are reported per window', async () => {
  const { target } = seed('damaged');
  unlinkSync(join(target, 'head-drums.flac'));
  assert.deepEqual((await coverage('damaged')).damaged.subbeats, { head: false, exit: true });
  writeFileSync(join(target, 'exit-vocals.flac'), 'short');
  assert.deepEqual((await coverage('damaged')).damaged.subbeats, { head: false, exit: false });
});

test('coverage must still match its source and cue manifests', async () => {
  const { cue } = seed('stale-cues');
  writeFileSync(join(cue, 'manifest.json'), readFileSync(join(cue, 'manifest.json'), 'utf8') + '\n');
  assert.deepEqual((await coverage('stale-cues'))['stale-cues'].subbeats, { head: false, exit: false });
  seed('replaced');
  invalidateSubbeatsBundles(stateDir, ['replaced']);
  assert.deepEqual((await coverage('replaced')).replaced.subbeats, { head: false, exit: false });
});

test('existing coverage remains visible while a cache-only assessment is queued', async () => {
  seed('assessing');
  store.assess(['assessing']);
  assert.deepEqual((await coverage('assessing')).assessing.subbeats, { head: true, exit: true });
});

test('coverage remains admin-only and limited to eight queue tracks', async () => {
  assert.equal((await fetch(`${http.url}/stem-cache/coverage?ids=cue-track`)).status, 401);
  assert.equal((await fetch(`${http.url}/stem-cache/coverage?ids=${Array.from({ length: 9 }, (_, i) => i).join(',')}`, { headers: auth })).status, 400);
});
