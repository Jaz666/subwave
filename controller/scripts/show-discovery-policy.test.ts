import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';
import { discoveryPalette, discoveryCoreGenres, discoveryPoolProblem } from '../src/broadcast/show-discovery-policy.js';
import type { GeneratedShowSnapshot } from '../src/broadcast/show-preparation.js';
import type { GeneratedShowPlan } from '../src/schemas/show-preparation.js';
const root = createTempDir(join(tmpdir(), 'subwave-discovery-policy-'));
process.env.STATE_DIR = root;
const { generateAcceptedShowPlan } = await import('../src/broadcast/show-preparation.js');
after(() => removeTempDir(root));
const counts = { Tiny1: 1, Tiny2: 2, Tiny3: 3, Tiny4: 4, 'Rare A': 30, 'Rare B': 40, Neighbour: 80, Rock: 10000 };
const snapshot: GeneratedShowSnapshot = {
  occurrence: { id: 'preview', showId: 'show', source: 'scheduled', startsAt: 1_800_000_000_000, endsAt: 1_800_003_600_000 },
  configuration: 'fixture', template: 'deep-discovery', planningPrompt: '', minimumCoverage: null,
  cast: { hostPersonaId: 'a', guestPersonaIds: [] }, show: { id: 'show' },
};
const plan: GeneratedShowPlan = { name: 'Connected rarities', topic: 'Talking point: a musical connection.', genres: ['Rare A', 'Rare B'], moods: [], energies: [], eras: [], filtersStrict: true, rationale: '' };
const diagnostic = (effective: number) => ({ strict: true, library: { indexed: 20000, matchingFilters: effective, afterExclusions: effective, effective }, playlist: null, warnings: [] });
test('rarity is relative; modest neighbours are separate from the core', () => {
  const palette = discoveryPalette(counts, 15);
  assert.equal(palette.ceiling, 40);
  assert.deepEqual(discoveryCoreGenres(['Rare A', 'Neighbour', 'Rock'], counts), ['Rare A']);
  assert.deepEqual(palette.choices.slice(0, 2).map(genre => genre.name), ['Rare A', 'Rare B']);
});
test('empty, single-genre and almost uniform libraries have no meaningful rare core', () => {
  for (const counts of [{}, { Rock: 100 }, { Rock: 100, Pop: 101 }]) {
    assert.equal(discoveryPalette(counts).core.length, 0);
    assert.equal(discoveryPalette(counts).choices.length, 0);
  }
});
test('core dominance uses unique eligible tracks, not genre-label counts or sums', () => {
  assert.equal(discoveryPoolProblem(['Rare A'], 30, 60), null);
  assert.match(discoveryPoolProblem(['Rare A'], 29, 60)!, /At least half/);
  assert.match(discoveryPoolProblem([], 0, 20000)!, /only larger/);
});
test('a broad-only plan is corrected even when it has ample music', async () => {
  let calls = 0;
  const result = await generateAcceptedShowPlan(snapshot, async input => {
    if (++calls === 1) return { ...plan, genres: ['Rock'] };
    assert.match(input.coverageCorrection!, /Discovery correction/);
    return plan;
  }, async show => diagnostic(show.genres.includes('Rock') ? 10000 : 60), async () => counts);
  assert.equal(calls, 2);
  assert.deepEqual(result.genres, plan.genres);
});
test('a token rare tag beside a huge genre cannot pass the correction', async () => {
  let calls = 0;
  await assert.rejects(generateAcceptedShowPlan(snapshot, async () => { calls++; return { ...plan, genres: ['Rare A', 'Rock'] }; },
    async show => diagnostic(show.genres.includes('Rock') ? 10000 : 30), async () => counts),
    /At least half must match/);
  assert.equal(calls, 2);
});
test('core counts use the same era, mood, duration and exclusion settings', async () => {
  const inspected: Array<Record<string, unknown>> = [];
  await generateAcceptedShowPlan({ ...snapshot, show: { ...snapshot.show, excludedPlaylistIds: ['excluded'], maxTrackSeconds: 600, minTrackLengthSeconds: 90, vocals: 'instrumental' } },
    async () => ({ ...plan, genres: ['Rare A', 'Neighbour'], moods: ['reflective'], energies: ['low'], eras: [{ fromYear: 1980, toYear: 1989 }] }), async show => {
      inspected.push(show);
      return diagnostic(show.genres.includes('Neighbour') ? 50 : 30);
    }, async () => counts);
  assert.equal(inspected.length, 2);
  assert.deepEqual(inspected[1].genres, ['Rare A']);
  for (const key of ['eras', 'moods', 'energies', 'maxTrackSeconds', 'minTrackLengthSeconds', 'vocals']) assert.deepEqual(inspected[1][key], inspected[0][key]);
  assert.deepEqual(inspected[1].excludedPlaylistIds, ['excluded']);
});

test('configured exclusions cannot leave a nominally rare core as a token presence', async () => {
  await assert.rejects(generateAcceptedShowPlan(snapshot, async () => ({ ...plan, genres: ['Rare A', 'Neighbour'] }),
    async show => diagnostic(show.genres.includes('Neighbour') ? 50 : 5), async () => counts), /only 5 of 50 eligible/);
});
test('unverified core metadata cannot pass by retaining the full palette count', async () => {
  await assert.rejects(generateAcceptedShowPlan(snapshot, async () => ({ ...plan, genres: ['Rare A', 'Neighbour'] }),
    async show => show.genres.length === 1 ? { ...diagnostic(50), warnings: ['Could not resolve genre Rare A.'] } : diagnostic(50),
    async () => counts), /Could not verify/);
});
test('unavailable rarity counts are a library verification failure', async () => {
  await assert.rejects(generateAcceptedShowPlan(snapshot, async () => plan, async () => diagnostic(60), async () => { throw new Error('Offline'); }),
    /Could not assess genre representation/);
});

test('host genre terms rank related rare choices ahead of unrelated early labels', () => {
  const counts = { 'Acoustic Rock': 16, 'Afro-Cuban Jazz': 26, 'Alternative Hip Hop': 20, 'Conscious Hip Hop': 48, Small1: 70, Small2: 90, Neighbour: 150, Rock: 10000 };
  const plain = discoveryPalette(counts, 15);
  const anchored = discoveryPalette(counts, 15, ['Hip Hop']);
  assert.equal(anchored.ceiling, plain.ceiling);
  assert.deepEqual(anchored.choices.slice(0, 2).map(genre => genre.name), ['Alternative Hip Hop', 'Conscious Hip Hop']);
  assert.deepEqual(anchored.core, plain.core);
});
