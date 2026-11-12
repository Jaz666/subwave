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
    writeFileSync(join(target, file), Buffer.alloc(128, 1));
    files[file] = { bytes: 128 };
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

test('expanded live waveforms read cue stems before and throughout the buffered handoff', async () => {
  const { queue } = await import('../src/broadcast/queue.js');
  const { createNowPlayingFileRouter, nowPlayingStemTransition } = await import('../src/routes/now-playing-file.js');
  type Item = NonNullable<typeof queue.current>;
  seed('wave-out'); seed('wave-in');
  const sr = 44100;
  const playback = { version: 1 as const, transitionId: '11111111-1111-4111-8111-111111111111',
    outgoingId: 'wave-out', incomingId: 'wave-in', evidenceFingerprint: 'e'.repeat(64),
    mixStyle: 'long-blend' as const, loudnessSettings: '{}', gainsDb: [0, 0] as [number, number],
    clipPath: join(stateDir, 'in.wav'), leadPath: join(stateDir, 'out.wav'), incomingDurationSeconds: 120,
    timing: { sampleRate: 44100 as const, outgoingStartSample: 100 * sr, incomingEntryFrame: 4 * sr,
      handoverFrame: 18 * sr, outgoingEndFrame: 34 * sr, incomingRate: 1, releaseCurve: 'linear-rate' as const,
      releaseStartFrame: 34 * sr, releaseEndFrame: 37 * sr, clipFrames: 39 * sr, incomingResumeSample: 35 * sr } };
  const outgoing: Item = { track: { id: 'wave-out', duration: 120 }, sent: true,
    startedAt: new Date(Date.now() - 10_000).toISOString(),
    stemBlend: { clipPath: playback.clipPath, clipSec: 39, subbeats: playback, outCueSec: 100.3, inCueSec: 34.7 } };
  const incoming: Item = { track: { id: 'wave-in', duration: 120 }, stemSeam: true, subbeatsHandoff: playback };
  const saved = { current: queue.current, upcoming: queue.upcoming, history: queue.history };
  let onAir = 'wave-out';
  const app = express();
  app.use(createNowPlayingFileRouter({ nowPlaying: async () => ({ subsonic_id: onAir }), lookup: async () => null,
    nextTrackId: () => queue.upcoming[0]?.track.id ?? null, stemTransition: nowPlayingStemTransition }));
  const live = await listen(app);
  const get = (path: string) => fetch(live.url + path, { headers: auth });
  try {
    queue.current = outgoing; queue.upcoming = [incoming]; queue.history = [];
    const events = await get('/now-playing/visual-events?id=wave-out');
    assert.equal(events.status, 200);
    type Events = { stemTransition: NonNullable<Awaited<ReturnType<typeof nowPlayingStemTransition>>> };
    const meta = (await events.json() as Events).stemTransition;
    assert.equal(meta.kind, 'subbeats');
    assert.equal(meta.incomingAtSec, 4);
    assert.ok(meta.sources);
    assert.ok(meta.incomingAiredAt);
    assert.equal(meta.sources.outgoing.startSec, 100);
    assert.equal(meta.sources.incoming.startSec, 0);
    assert.ok(Date.parse(meta.incomingAiredAt) > Date.now() + 90_000, 'the view is available well before the transition');
    for (const side of ['outgoing', 'incoming']) for (const stem of cache.STEM_NAMES) {
      const response = await get(`/now-playing/stem-audio?side=${side}&stem=${stem}&outgoingId=wave-out`);
      assert.equal(response.status, 200);
      assert.equal((await response.arrayBuffer()).byteLength, 128);
    }
    onAir = 'wave-in'; incoming.startedAt = new Date().toISOString();
    queue.history = [outgoing]; queue.current = incoming; queue.upcoming = [{ track: { id: 'later' } }];
    for (const id of ['wave-out', 'wave-in']) {
      const response = await get('/now-playing/visual-events?id=' + id);
      assert.equal(response.status, 200, 'both sides of the listener buffer retain the active pair');
      assert.equal((await response.json() as Events).stemTransition.incomingAiredAt, incoming.startedAt);
    }
    assert.equal((await get('/now-playing/stem-audio?side=outgoing&stem=drums&outgoingId=wave-out')).status, 200);
    assert.equal((await get('/now-playing/visual-events?id=unrelated')).status, 409);
    assert.equal((await get('/now-playing/stem-audio?side=outgoing&stem=drums&outgoingId=unrelated')).status, 409);
    incoming.startedAt = new Date(Date.now() - 96_000).toISOString();
    assert.equal((await get('/now-playing/visual-events?id=wave-out')).status, 409, 'expired handoffs cannot expose old tracks');
  } finally {
    queue.current = saved.current; queue.upcoming = saved.upcoming; queue.history = saved.history;
    await live.close();
  }
});
