import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';
import { missingMusicalEvidence, musicalDetailError, libraryFitError, coverageUnavailable, ShowPlanningError } from '../src/broadcast/show-planning-policy.js';
import type { GeneratedShowSnapshot } from '../src/broadcast/show-preparation.js';
import type { GeneratedShowPlan } from '../src/schemas/show-preparation.js';
import type { ShowCandidateDiagnostic } from '../src/music/show-candidates.js';
const root = createTempDir(join(tmpdir(), 'subwave-planning-policy-'));
process.env.STATE_DIR = root;
const { generateAcceptedShowPlan } = await import('../src/broadcast/show-preparation.js');
after(() => removeTempDir(root));
const profiles = [
  { id: 'a', name: 'First DJ', soul: 'Warm voice. Loves folk and soul music.', musicLean: '' },
  { id: 'b', name: 'Second DJ', soul: 'Dry humour and short links.', musicLean: 'Enjoys jazz and instrumental hip hop.' },
];
test('Soul alone or optional Leanings provide evidence; every required participant is checked', () => {
  const evidence = [{ personaId: 'a', source: 'soul' as const, quote: 'Loves folk and soul music.' }];
  assert.deepEqual(missingMusicalEvidence(profiles, evidence), ['Second DJ']);
  assert.deepEqual(missingMusicalEvidence(profiles, [...evidence, { personaId: 'b', source: 'musicLean', quote: 'Enjoys jazz and instrumental hip hop.' }]), []);
});
test('invented quotations, another DJ’s text and wrong sources cannot supply evidence', () => {
  assert.deepEqual(missingMusicalEvidence(profiles, [
    { personaId: 'a', source: 'soul', quote: 'Enjoys jazz and instrumental hip hop.' },
    { personaId: 'b', source: 'soul', quote: 'Enjoys jazz and instrumental hip hop.' },
  ]), ['First DJ', 'Second DJ']);
});
test('persona advice includes the guide; library fit is a separate failure', () => {
  assert.match(musicalDetailError(['First DJ']).message, /First DJ needs/);
  assert.match(musicalDetailError(['First DJ']).message, /https:\/\/github.com\/perminder-klair\/subwave\/discussions\/1817$/);
  assert.equal(libraryFitError('No connection').code, 'library-fit');
});
const snapshot: GeneratedShowSnapshot = {
  occurrence: { id: 'preview', showId: 'show', source: 'scheduled', startsAt: 1_800_000_000_000, endsAt: 1_800_003_600_000 },
  configuration: 'fixture', template: 'deep-discovery', planningPrompt: '', minimumCoverage: null,
  cast: { hostPersonaId: 'a', guestPersonaIds: [] }, show: { id: 'show' },
};
const plan: GeneratedShowPlan = { name: 'A musical connection', topic: 'Talking point: a connection.', genres: ['Folk'], moods: [], energies: [], eras: [], filtersStrict: true, rationale: '' };
function diagnostic(count: number, warnings: string[] = []): ShowCandidateDiagnostic {
  return { strict: true, library: { indexed: 1000, matchingFilters: count, afterExclusions: count, effective: count }, playlist: null, warnings };
}
test('one hour requires 30 tracks after exclusions and permits only one correction', async () => {
  let calls = 0;
  await assert.rejects(generateAcceptedShowPlan(snapshot, async input => {
    calls++;
    if (calls === 2) assert.match(input.coverageCorrection!, /at least 30 tracks/);
    return plan;
  }, async () => diagnostic(18)), error => error instanceof ShowPlanningError && error.code === 'library-coverage'
    && /60-minute show needs at least 30.*only 18/.test(error.message));
  assert.equal(calls, 2);
});
test('a corrected palette can pass and an operator’s higher target is retained', async () => {
  let checks = 0;
  assert.equal((await generateAcceptedShowPlan({ ...snapshot, minimumCoverage: 50 }, async () => plan,
    async () => diagnostic(++checks === 1 ? 40 : 55))).name, plan.name);
  assert.equal(checks, 2);
});
test('inactive locks cannot inflate coverage into an accepted show', async () => {
  let calls = 0;
  await assert.rejects(generateAcceptedShowPlan(snapshot, async () => { calls++; return plan; },
    async () => diagnostic(1000, ['Genre “Folk” is not present in the library, so it is not an active lock.'])),
  error => error instanceof ShowPlanningError && error.code === 'library-unavailable');
  assert.equal(calls, 1);
  assert.equal(coverageUnavailable(['Tracks with known duration above 600s are excluded. Unknown durations pass.']), false);
});
test('semantic library refusal is preserved without retrying or switching templates', async () => {
  let calls = 0;
  await assert.rejects(generateAcceptedShowPlan(snapshot, async () => { calls++; throw libraryFitError('Only familiar repertoire is available.'); }),
    error => error instanceof ShowPlanningError && error.code === 'library-fit');
  assert.equal(calls, 1);
});
test('Time Capsule correction retains closed-period instructions', async () => {
  let calls = 0;
  await generateAcceptedShowPlan({ ...snapshot, template: 'time-capsule' }, async input => {
    if (++calls === 2) assert.match(input.coverageCorrection!, /never remove the era restriction/);
    return { ...plan, eras: [{ fromYear: 1980, toYear: 1984 }] };
  }, async () => diagnostic(calls === 1 ? 10 : 40));
  assert.equal(calls, 2);
});

test('unchanged shipped Souls stand down for all templates before loading a library', async () => {
  const settings = await import('../src/settings.js');
  const { generateShowPlan } = await import('../src/broadcast/show-generation.js');
  const personas = settings.get().personas;
  for (const template of ['dj-choice', 'deep-discovery', 'common-ground', 'outside-comfort-zone', 'time-capsule']) {
    await assert.rejects(generateShowPlan({ ...snapshot, template,
      cast: { hostPersonaId: personas[0].id, guestPersonaIds: template === 'common-ground' ? [personas[1].id] : [] } }),
    error => error instanceof ShowPlanningError && error.code === 'persona-readiness');
  }
});
test('Common Ground requires evidence from the guest as well as the host', async () => {
  const settings = await import('../src/settings.js');
  const { generateShowPlan } = await import('../src/broadcast/show-generation.js');
  const [host, guest] = settings.get().personas;
  const previous = host.musicLean;
  host.musicLean = 'Enjoys folk and psychedelic rock.';
  try {
    await assert.rejects(generateShowPlan({ ...snapshot, template: 'common-ground', cast: { hostPersonaId: host.id, guestPersonaIds: [guest.id] } }),
      error => error instanceof ShowPlanningError && error.code === 'persona-readiness' && error.message.includes(guest.name) && !error.message.includes(host.name));
  } finally { host.musicLean = previous; }
});

test('a failed coverage lookup reports unavailable information rather than insufficient tracks', async () => {
  await assert.rejects(generateAcceptedShowPlan(snapshot, async () => plan, async () => { throw new Error('Offline'); }),
    error => error instanceof ShowPlanningError && error.code === 'library-unavailable' && !error.message.includes('Not enough'));
});

test('a genuine quote about delivery cannot be passed off as musical evidence', () => {
  const profile = { id: 'a', name: 'First DJ', soul: 'A relaxed presenter with dry humour.', musicLean: '' };
  assert.deepEqual(missingMusicalEvidence([profile], [{ personaId: 'a', source: 'soul', quote: 'A relaxed presenter with dry humour' }]), ['First DJ']);
  const musical = { ...profile, soul: 'A relaxed presenter who loves Art Rock.' };
  assert.deepEqual(missingMusicalEvidence([musical], [{ personaId: 'a', source: 'soul', quote: musical.soul }], ['Art Rock']), []);
});

test('clear catalogue-genre preferences survive a model quoting the wrong source', () => {
  assert.deepEqual(missingMusicalEvidence(profiles, [], ['Folk', 'Soul', 'Jazz']), []);
  assert.deepEqual(missingMusicalEvidence([{ id: 'a', name: 'First DJ', soul: 'A relaxed presenter with dry humour.', musicLean: '' }], [], ['Folk', 'Soul']), ['First DJ']);
});
