// Deep Discovery catalogue selection and explicit upcoming-episode regeneration.
// Run: npm test -- generated-shows
import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';
import type { SessionContext } from '../src/broadcast/session.js';
import type { GeneratedShowSnapshot } from '../src/broadcast/show-preparation.js';

const root = createTempDir(join(tmpdir(), 'subwave-generated-shows-'));
process.env.STATE_DIR = root;
process.env.ADMIN_USER = 'test';
process.env.ADMIN_PASS = 'test';
const { createShowPreparation } = await import('../src/broadcast/show-preparation.js');
const { showGenreChoices, discoveryGenreCounts, normalizeGeneratedMusicSettings } = await import('../src/broadcast/show-generation.js');
const { generatedShowPlanSchema } = await import('../src/schemas/show-preparation.js');
after(() => removeTempDir(root));

test('rarity counts include finer genre matches and count a multi-tagged track once per genre', () => {
  const counts = discoveryGenreCounts(['Rock', 'Indie', 'Indie Rock', 'Garage Rock', 'Math Rock'], [
    { genres: ['Indie Rock', 'Garage Rock'] },
    { genres: ['Indie Rock', 'Rock'] },
    { genres: ['Math Rock'] },
    { genres: ['Indietronica'] },
  ]);
  assert.deepEqual(counts, { Rock: 3, Indie: 2, 'Indie Rock': 2, 'Garage Rock': 1, 'Math Rock': 1 });
});

test('Deep Discovery finds rare workable candidates across the whole catalogue before bounding the prompt', () => {
  const counts = Object.fromEntries(Array.from({ length: 486 }, (_, i) => [`Genre ${i}`, 486 - i]));
  counts.Empty = 0;
  const discovery = showGenreChoices(counts, 'deep-discovery', 30);
  assert.equal(discovery.length, 80);
  assert.deepEqual(discovery[0], { name: 'Genre 456', tracks: 30 });
  assert.equal(discovery[59]?.tracks, 89);
  assert.equal(discovery.at(-1)?.tracks, 263);
  assert.equal(discovery.some(genre => genre.name === 'Genre 0'), false, 'the largest catalogue genre is not a default neighbour');
  assert.deepEqual(showGenreChoices({ Tiny: 2, Small: 5 }, 'deep-discovery', 30), [
    { name: 'Tiny', tracks: 2 }, { name: 'Small', tracks: 5 },
  ], 'a sparse library keeps its rare core first and an available neighbour to combine');
  const choice = showGenreChoices(counts, 'dj-choice');
  assert.equal(choice.length, 80);
  assert.equal(choice[0]?.name, 'Genre 0');
  assert.equal(choice.at(-1)?.name, 'Genre 79');
});

test('format recovery normalizes observed local-model shorthands while retaining strict validation', () => {
  const schema = generatedShowPlanSchema.omit({ name: true, topic: true });
  const valid = { moods: [], genres: ['Math Rock'], eras: [{ fromYear: [1980], toYear: null }, { fromYear: null, toYear: null }], energies: [], filtersStrict: false, rationale: 'x'.repeat(600) };
  const normalized = schema.parse(normalizeGeneratedMusicSettings(valid));
  assert.deepEqual(normalized.eras, [{ fromYear: 1980, toYear: null }]);
  assert.equal(normalized.rationale.length, 500);
  for (const eras of [[{ fromYear: [1980, 1990], toYear: null }], [{ fromYear: 3000, toYear: null }], [{ fromYear: 1990, toYear: 1980 }]]) {
    assert.equal(schema.safeParse(normalizeGeneratedMusicSettings({ ...valid, eras })).success, false);
  }
});

function fixture(name: string) {
  let clock = Date.now();
  let snap: GeneratedShowSnapshot | null = {
    occurrence: { id: name, showId: 's_discovery', source: 'scheduled', startsAt: clock + 3600_000, endsAt: clock + 7200_000 },
    configuration: 'same-cast', template: 'deep-discovery', planningPrompt: '', minimumCoverage: null,
    cast: { hostPersonaId: 'host', guestPersonaIds: ['guest'] }, show: { id: 's_discovery' },
  };
  let calls = 0;
  let fail = false;
  let finish: (() => void) | undefined;
  let waiting: Promise<void> | null = null;
  const file = join(root, `${name}.json`);
  const owner = createShowPreparation({
    file, snapshot: () => null, generatedSnapshot: () => snap, scheduledGeneratedSnapshot: () => snap,
    execute: async () => null, source: async () => null, now: () => clock,
    discoveryCounts: async () => ({ 'Math Rock': 100, Rock: 10000 }),
    diagnose: async () => ({ strict: true, library: { indexed: 100, matchingFilters: 100, afterExclusions: 100, effective: 100 }, playlist: null, warnings: [] }),
    generate: async () => {
      calls++;
      await waiting;
      if (fail) throw new Error('Model unavailable');
      return { name: `Episode ${calls}`, topic: 'A grounded discovery idea', moods: [], genres: ['Math Rock'], eras: [], energies: [], filtersStrict: false, rationale: '' };
    },
  });
  return {
    owner, file, calls: () => calls,
    prepare: () => owner.ensureGenerated({ context: {} as SessionContext, source: 'scheduled' }),
    move: (ms: number) => { clock += ms; },
    change: (newSnapshot: GeneratedShowSnapshot | null) => { snap = newSnapshot; },
    snapshot: () => snap!, fail: (value: boolean) => { fail = value; },
    hold: () => { waiting = new Promise<void>(resolve => { finish = resolve; }); },
    release: () => { finish?.(); waiting = null; },
  };
}

test('regeneration bypasses the accepted-plan cache, preserves casting, and coalesces simultaneous requests', async () => {
  const f = fixture('manual');
  await f.prepare();
  await f.prepare();
  assert.equal(f.calls(), 1);
  f.hold();
  const requests = [f.owner.regenerateGenerated('manual'), f.owner.regenerateGenerated('manual')];
  f.release();
  const [a, b] = await Promise.all(requests);
  assert.equal(f.calls(), 2);
  assert.equal(a?.kind, 'ready');
  assert.deepEqual(a, b);
  assert.equal(a?.kind === 'ready' && a.plan.name, 'Episode 2');
  assert.equal(a?.hostPersonaId, 'host');
  assert.deepEqual(a?.guestPersonaIds, ['guest']);
  const stored = JSON.parse(await readFile(f.file, 'utf8'));
  assert.equal(stored.generated.length, 1);
  assert.equal(stored.generated[0].plan.name, 'Episode 2');
});

test('a failed regeneration keeps the accepted plan and permits another explicit attempt', async () => {
  const f = fixture('failure');
  await f.prepare();
  f.fail(true);
  await assert.rejects(f.owner.regenerateGenerated('failure'), /Model unavailable/);
  const records = await f.owner.generatedRecords();
  assert.equal(records[0]?.kind === 'ready' && records[0].plan.name, 'Episode 1');
  f.fail(false);
  assert.equal((await f.owner.regenerateGenerated('failure'))?.kind, 'ready');
  assert.equal(f.calls(), 3);
});

test('manual regeneration bypasses a failed record’s automatic retry cooldown', async () => {
  const f = fixture('retry');
  f.fail(true);
  assert.equal((await f.prepare())?.kind, 'failed');
  f.fail(false);
  assert.equal((await f.owner.regenerateGenerated('retry'))?.kind, 'ready');
  assert.equal(f.calls(), 2);
});

test('missing, changed, on-air and past occurrences cannot be regenerated', async () => {
  const f = fixture('guards');
  await f.prepare();
  await assert.rejects(f.owner.regenerateGenerated('missing'), /no longer available/);
  const initial = f.snapshot();
  f.change({ ...initial, occurrence: { ...initial.occurrence, id: 'different-occurrence' } });
  await assert.rejects(f.owner.regenerateGenerated('guards'), /schedule has changed/);
  f.change(initial);
  f.move(3600_000);
  await assert.rejects(f.owner.regenerateGenerated('guards'), /slot has started/);
  f.move(7200_000);
  await assert.rejects(f.owner.regenerateGenerated('guards'), /slot has started/);
  assert.equal(f.calls(), 1);
});

test('a result arriving after airtime or a schedule edit cannot replace the accepted plan', async () => {
  for (const reason of ['airtime', 'schedule', 'duration']) {
    const f = fixture(reason);
    await f.prepare();
    f.hold();
    const reroll = f.owner.regenerateGenerated(reason);
    // Let the async store recovery and generator enter the held request.
    await new Promise(resolve => setImmediate(resolve));
    if (reason === 'airtime') f.move(3600_000);
    else if (reason === 'schedule') f.change(null);
    else f.change({ ...f.snapshot(), occurrence: { ...f.snapshot().occurrence, endsAt: f.snapshot().occurrence.endsAt + 3600_000 } });
    f.release();
    assert.equal(await reroll, null);
    const records = await f.owner.generatedRecords();
    assert.equal(records[0]?.kind === 'ready' && records[0].plan.name, 'Episode 1');
  }
});

test('the regenerate endpoint requires admin auth, validates its input and reports success and failures', async t => {
  const { default: express } = await import('express');
  const { router } = await import('../src/routes/shows.js');
  const { showPreparation } = await import('../src/broadcast/show-preparation.js');
  const f = fixture('http');
  await f.prepare();
  const regenerate = t.mock.method(showPreparation, 'regenerateGenerated', f.owner.regenerateGenerated);
  t.mock.method(showPreparation, 'generatedRecords', f.owner.generatedRecords);
  const app = express();
  app.use(express.json(), router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const authorization = `Basic ${Buffer.from('test:test').toString('base64')}`;
  const post = (body: unknown, authenticated = true) => fetch(`${baseUrl}/shows/generated/regenerate`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authenticated ? { authorization } : {}) },
    body: JSON.stringify(body),
  });
  assert.equal((await post({ occurrenceId: 'http' }, false)).status, 401);
  assert.equal((await post({})).status, 400);
  assert.equal(regenerate.mock.callCount(), 0);
  assert.equal((await post({ occurrenceId: 'http' })).status, 200);
  const history = await fetch(`${baseUrl}/shows/generated`, { headers: { authorization } }).then(r => r.json()) as {
    episodes: Array<{ plan: { name: string } }>;
  };
  const episode = history.episodes[0];
  assert.ok(episode);
  assert.equal(episode.plan.name, 'Episode 2');
  assert.equal('configuration' in episode, false);
  assert.equal((await post({ occurrenceId: 'missing' })).status, 404);
  f.fail(true);
  assert.equal((await post({ occurrenceId: 'http' })).status, 502);
  const records = await f.owner.generatedRecords();
  assert.equal(records[0]?.kind === 'ready' && records[0].plan.name, 'Episode 2');
  f.move(3600_000);
  assert.equal((await post({ occurrenceId: 'http' })).status, 409);
});
