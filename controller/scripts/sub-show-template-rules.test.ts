// Deterministic template contracts; no model, network or station state needed.
import assert from 'node:assert/strict';
import test, { after, afterEach } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';
import type { GeneratedShowSnapshot } from '../src/broadcast/show-preparation.js';
import type { GeneratedShowPlan } from '../src/schemas/show-preparation.js';

const root = createTempDir(join(tmpdir(), 'subwave-template-rules-'));
process.env.STATE_DIR = root;
const settings = await import('../src/settings.js');
const { showSchema } = await import('../src/schemas/show.js');
const { resolveGeneratedShowCast, generateShowPlan } = await import('../src/broadcast/show-generation.js');
const { generateAcceptedShowPlan } = await import('../src/broadcast/show-preparation.js');
const originalPools = settings.get().subShows;
afterEach(() => { settings.get().subShows = originalPools; });
after(() => removeTempDir(root));

const personas = [{ id: 'p_host' }, { id: 'p_guest' }, { id: 'p_other' }];
const schema = showSchema({ personaIds: personas.map(p => p.id), moodNames: null, themeIds: null, minTrackSeconds: null });
function show(template: string, generation: Record<string, unknown> = {}, fields: Record<string, unknown> = {}) {
  return { name: 'Template fixture', personaId: 'p_host', guestPersonaIds: [],
    generation: { mode: 'generated', template, hostMode: 'random', ...generation }, ...fields };
}
function pools(hosts: string[] | null, guests: string[] | null) {
  settings.get().subShows = { ...originalPools, eligibleHostPersonaIds: hosts, eligibleGuestPersonaIds: guests };
}
const snapshot: GeneratedShowSnapshot = {
  occurrence: { id: 'fixture', showId: 'show', source: 'scheduled', startsAt: 1_800_000_000_000, endsAt: 1_800_003_600_000 },
  configuration: 'fixture', template: 'common-ground', planningPrompt: '', minimumCoverage: null,
  cast: { hostPersonaId: 'p_host', guestPersonaIds: ['p_guest'] }, show: { id: 'show' },
};
const plan: GeneratedShowPlan = {
  name: 'A musical connection', topic: 'A musical brief. Talking point: texture and melody.',
  genres: ['Psychedelic Rock'], moods: [], energies: [], eras: [], filtersStrict: false, rationale: '',
};
const diagnostic = (effective: number) => ({ strict: true,
  library: { indexed: 1000, matchingFilters: effective, afterExclusions: effective, effective }, playlist: null, warnings: [] });

test('Common Ground defaults to exactly one random guest; saves reject zero or multiple selected guests', () => {
  const parsed = schema.parse(show('common-ground'));
  assert.ok(parsed.generation);
  assert.equal(parsed.generation.guestMode, 'random');
  assert.deepEqual(parsed.generation.guestCount, { min: 1, max: 1 });
  for (const guestPersonaIds of [[], ['p_guest', 'p_other']]) {
    assert.equal(schema.safeParse(show('common-ground', { guestMode: 'fixed' }, { guestPersonaIds })).success, false);
  }
  assert.equal(schema.safeParse(show('common-ground', { guestMode: 'fixed' }, { guestPersonaIds: ['p_guest'] })).success, true);
  for (const guestMode of ['none', 'random']) {
    assert.equal(schema.safeParse(show('common-ground', { guestMode, guestCount: { min: 0, max: 3 } })).success, false);
  }
});

test('Common Ground draws both participants only from the allowed host pool, deterministically', () => {
  pools(['p_host', 'p_guest'], ['p_other']);
  const parsed = schema.parse(show('common-ground'));
  const seenHosts = new Set<string>();
  for (let index = 0; index < 32; index++) {
    const input = { show: parsed, occurrence: { id: `airing-${index}` }, personas };
    const cast = resolveGeneratedShowCast(input)!;
    assert.deepEqual(cast, resolveGeneratedShowCast(input));
    assert.deepEqual(new Set([cast.hostPersonaId, ...cast.guestPersonaIds]), new Set(['p_host', 'p_guest']));
    assert.equal(cast.guestPersonaIds.length, 1);
    seenHosts.add(cast.hostPersonaId);
  }
  assert.equal(seenHosts.size, 2);
});

test('Common Ground preserves the selected guest while choosing a different host', () => {
  pools(['p_host', 'p_guest'], null);
  const parsed = schema.parse(show('common-ground', { guestMode: 'fixed' }, { guestPersonaIds: ['p_guest'] }));
  for (let index = 0; index < 16; index++) {
    assert.deepEqual(resolveGeneratedShowCast({ show: parsed, occurrence: { id: `fixed-${index}` }, personas }),
      { hostPersonaId: 'p_host', guestPersonaIds: ['p_guest'] });
  }
  pools(['p_host'], null);
  assert.equal(resolveGeneratedShowCast({ show: parsed, occurrence: { id: 'excluded-guest' }, personas }), null);
});

test('Common Ground stands down when two distinct eligible participants are unavailable', () => {
  const parsed = schema.parse(show('common-ground'));
  for (const allowed of [[], ['p_host'], ['p_deleted']]) {
    pools(allowed, null);
    assert.equal(resolveGeneratedShowCast({ show: parsed, occurrence: { id: 'insufficient-cast' }, personas }), null);
  }
});

test('random hosts preserve fixed guests on initial preparation for every optional-guest template', () => {
  for (const template of ['dj-choice', 'deep-discovery', 'time-capsule']) {
    pools(['p_host', 'p_guest'], null);
    const parsed = schema.parse(show(template, { guestMode: 'fixed' }, { guestPersonaIds: ['p_guest'] }));
    for (let index = 0; index < 32; index++) {
      assert.deepEqual(resolveGeneratedShowCast({ show: parsed, occurrence: { id: `initial-${index}` }, personas }),
        { hostPersonaId: 'p_host', guestPersonaIds: ['p_guest'] });
    }
    pools(['p_guest'], null);
    assert.equal(resolveGeneratedShowCast({ show: parsed, occurrence: { id: 'no-distinct-host' }, personas }), null);
  }
});

test('Outside the Comfort Zone defaults to solo and rejects guest configuration on save', () => {
  const parsed = schema.parse(show('outside-comfort-zone'));
  assert.ok(parsed.generation);
  assert.equal(parsed.generation.guestMode, 'none');
  assert.deepEqual(parsed.generation.guestCount, { min: 0, max: 0 });
  for (const guestMode of ['fixed', 'random']) {
    assert.equal(schema.safeParse(show('outside-comfort-zone', { guestMode })).success, false);
  }
  assert.equal(schema.safeParse(show('outside-comfort-zone', {}, { guestPersonaIds: ['p_guest'] })).success, false);
  pools(['p_host'], ['p_guest']);
  assert.deepEqual(resolveGeneratedShowCast({ show: parsed, occurrence: { id: 'solo' }, personas }),
    { hostPersonaId: 'p_host', guestPersonaIds: [] });
});

test('generation rejects invalid casts before reaching the model', async () => {
  const host = settings.get().personas[0].id;
  for (const guestPersonaIds of [[], [host], ['p_deleted'], [host, 'p_deleted']]) {
    await assert.rejects(generateShowPlan({ ...snapshot, cast: { hostPersonaId: host, guestPersonaIds } }),
      /exactly one distinct guest/);
  }
  await assert.rejects(generateShowPlan({ ...snapshot, template: 'outside-comfort-zone',
    cast: { hostPersonaId: host, guestPersonaIds: [settings.get().personas[1].id] } }), /solo host/);
});

test('Time Capsule uses the regular host and guest pools with bounded guest counts', () => {
  pools(['p_host'], ['p_guest', 'p_other']);
  const parsed = schema.parse(show('time-capsule', { guestMode: 'random', guestCount: { min: 1, max: 2 } }));
  for (let index = 0; index < 16; index++) {
    const cast = resolveGeneratedShowCast({ show: parsed, occurrence: { id: `capsule-${index}` }, personas })!;
    assert.equal(cast.hostPersonaId, 'p_host');
    assert.ok(cast.guestPersonaIds.length >= 1 && cast.guestPersonaIds.length <= 2);
    assert.equal(new Set(cast.guestPersonaIds).size, cast.guestPersonaIds.length);
    assert.ok(cast.guestPersonaIds.every(id => ['p_guest', 'p_other'].includes(id)));
  }
});

test('all three templates enforce strict filters and verify twice-airtime coverage', async () => {
  for (const template of ['common-ground', 'outside-comfort-zone', 'time-capsule']) {
    const generated = { ...plan, eras: template === 'time-capsule' ? [{ fromYear: 1980, toYear: 1989 }] : [] };
    let checks = 0;
    const accepted = await generateAcceptedShowPlan({ ...snapshot, template }, async () => generated, async show => {
      checks++;
      assert.equal(show.filtersStrict, true);
      assert.deepEqual(show.genres, generated.genres);
      assert.deepEqual(show.eras, generated.eras);
      return diagnostic(30);
    });
    assert.equal(accepted.filtersStrict, true);
    assert.equal(checks, 1);
  }
});

test('all three templates reject short pools after one correction, scaling the minimum to airtime', async () => {
  for (const template of ['common-ground', 'outside-comfort-zone', 'time-capsule']) {
    for (const minutes of [30, 60, 90]) {
      let calls = 0;
      const minimum = minutes / 2;
      await assert.rejects(generateAcceptedShowPlan({ ...snapshot, template,
        occurrence: { ...snapshot.occurrence, endsAt: snapshot.occurrence.startsAt + minutes * 60_000 } }, async () => {
        calls++;
        return { ...plan, eras: template === 'time-capsule' ? [{ fromYear: 1980, toYear: 1984 }] : [] };
      }, async () => diagnostic(minimum - 1)), new RegExp(`needs at least ${minimum}.*only ${minimum - 1}`));
      assert.equal(calls, 2);
    }
  }
});

test('Common Ground and Time Capsule cannot accept an empty genre palette', async () => {
  for (const template of ['common-ground', 'time-capsule']) {
    await assert.rejects(generateAcceptedShowPlan({ ...snapshot, template }, async () => ({ ...plan, genres: [],
      eras: template === 'time-capsule' ? [{ fromYear: 1980, toYear: 1984 }] : [] }),
    async () => { assert.fail('Empty palette reached coverage'); }), /requires a genre palette/);
  }
});

test('Outside the Comfort Zone refuses empty or multi-destination palettes before coverage', async () => {
  for (const genres of [[], ['Psychedelic Rock', 'Jazz']]) {
    await assert.rejects(generateAcceptedShowPlan({ ...snapshot, template: 'outside-comfort-zone' },
      async () => ({ ...plan, genres }), async () => { assert.fail('Invalid palette reached coverage'); }), /one destination genre/);
  }
});

test('Outside the Comfort Zone correction must replace the failed single destination', async () => {
  for (const replace of [true, false]) {
    let calls = 0;
    const result = generateAcceptedShowPlan({ ...snapshot, template: 'outside-comfort-zone' }, async input => {
      if (++calls === 2) assert.match(input.coverageCorrection!, /different single neighbouring destination/);
      return { ...plan, genres: [calls === 2 && replace ? 'Progressive Rock' : 'Psychedelic Rock'] };
    }, async show => diagnostic(show.genres[0] === 'Progressive Rock' ? 60 : 10));
    if (replace) assert.deepEqual((await result).genres, ['Progressive Rock']);
    else await assert.rejects(result, /needs at least 30/);
    assert.equal(calls, 2);
  }
});

test('Time Capsule accepts one year or ten inclusive years; rejects missing, open, disjoint or eleven-year periods', async () => {
  for (const toYear of [1980, 1989]) {
    const eras = [{ fromYear: 1980, toYear }];
    const accepted = await generateAcceptedShowPlan({ ...snapshot, template: 'time-capsule' },
      async () => ({ ...plan, eras }), async () => diagnostic(30));
    assert.deepEqual(accepted.eras, eras);
  }
  for (const eras of [[], [{ fromYear: null, toYear: 1989 }], [{ fromYear: 1980, toYear: null }],
    [{ fromYear: 1980, toYear: 1990 }], [{ fromYear: 1980, toYear: 1984 }, { fromYear: 1986, toYear: 1989 }]]) {
    await assert.rejects(generateAcceptedShowPlan({ ...snapshot, template: 'time-capsule' }, async () => ({ ...plan, eras }),
      async () => { assert.fail('Invalid period reached coverage'); }), /one closed period/);
  }
});

test('a Time Capsule coverage correction cannot remove its era restriction', async () => {
  let calls = 0;
  await assert.rejects(generateAcceptedShowPlan({ ...snapshot, template: 'time-capsule' }, async input => {
    if (++calls === 2) assert.match(input.coverageCorrection!, /never remove the era restriction/);
    return { ...plan, eras: calls === 1 ? [{ fromYear: 1980, toYear: 1984 }] : [] };
  }, async () => diagnostic(10)), /one closed period/);
  assert.equal(calls, 2);
});
