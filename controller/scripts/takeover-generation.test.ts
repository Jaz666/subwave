// Real preview/activation flow with a tiny SQLite library and a stubbed LLM transport.
import assert from 'node:assert/strict';
import test, { beforeEach, afterEach, after, mock } from 'node:test';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';

const root = createTempDir(join(tmpdir(), 'subwave-takeover-generation-'));
process.env.STATE_DIR = root;
process.env.NAVIDROME_URL = 'http://127.0.0.1:9';
process.env.NAVIDROME_USER = 'fixture';
process.env.NAVIDROME_PASS = 'fixture';
const settings = await import('../src/settings.js');
const library = await import('../src/music/library.js');
const db = await import('../src/music/library-db.js');
const { showSchema } = await import('../src/schemas/show.js');
const { showPreparation } = await import('../src/broadcast/show-preparation.js');
const { prepareTakeoverPreview, activateTakeoverPreview, takeoverPreviewRequestSchema } = await import('../src/broadcast/takeover-generation.js');
await settings.load();
await library.load();
const epoch = Date.parse('2026-10-26T08:00:00Z');
const persona = { ...settings.get().personas[0], id: 'p_fixture', name: 'Alex Vale', soul: 'Enjoys folk music.', musicLean: '' };
const request = () => takeoverPreviewRequestSchema.parse({ showId: null, template: 'dj-choice', until: 'fixed', minutes: 60 });
const plan = { name: 'Melody and Space', topic: 'A folk show exploring spare arrangements and memorable melodies.',
  talkingPoint: 'How does an arrangement leave space for a melody?', genres: ['Folk'], moods: [], eras: [], energies: [], filtersStrict: true, rationale: 'A familiar folk palette.' };
let modelCalls = 0;
let refuse = false;
let genresUnavailable = false;
let unavailableStage: 'concept' | 'compiler' | null = null;

beforeEach(async () => {
  mock.timers.enable({ apis: ['Date'], now: epoch });
  modelCalls = 0; refuse = false; genresUnavailable = false; unavailableStage = null;
  mock.method(globalThis, 'fetch', async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin, 'http://127.0.0.1:9', 'No real service may be called');
    if (/\/getGenres(?:\.view)?$/.test(url.pathname)) {
      if (genresUnavailable) return new Response(JSON.stringify({ 'subsonic-response': { status: 'failed',
        error: { code: 0, message: 'Fixture genre lookup unavailable' } } }), { headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify({ 'subsonic-response': { status: 'ok', genres: {
        genre: [{ value: 'Folk', songCount: 40 }, { value: 'Other', songCount: 20 }],
      } } }), { headers: { 'content-type': 'application/json' } });
    }
    assert.match(String(input), /^http:\/\/127\.0\.0\.1:9\/v1\//, 'No real service may be called');
    modelCalls++;
    const body = JSON.parse(String(init?.body));
    const concept = body.messages.some((message: { content?: string }) => message.content?.includes('mandatory musical-readiness gate'));
    if (unavailableStage === (concept ? 'concept' : 'compiler')) {
      return new Response(JSON.stringify({ error: { message: 'Fixture provider unavailable', type: 'authentication_error', code: 'invalid_api_key' } }),
        { status: 401, headers: { 'content-type': 'application/json' } });
    }
    const output = concept ? {
      assessment: { problem: refuse ? 'library-fit' : 'none', reason: refuse ? 'No coherent musical fit.' : '',
        evidence: [{ personaId: persona.id, source: 'soul', quote: persona.soul }] },
      proposal: refuse ? null : { name: plan.name, topic: plan.topic, intendedGenres: plan.genres, eras: [], talkingPoint: plan.talkingPoint },
    } : plan;
    const toolName = body.tools?.[0]?.function?.name;
    const message = toolName
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'fixture', type: 'function', function: { name: toolName, arguments: JSON.stringify(output) } }] }
      : { role: 'assistant', content: JSON.stringify(output) };
    return new Response(JSON.stringify({ id: 'fixture', object: 'chat.completion', created: 1, model: 'fixture-model',
      choices: [{ index: 0, message, finish_reason: toolName ? 'tool_calls' : 'stop' }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }), { headers: { 'content-type': 'application/json' } });
  });
  await settings.update({ personas: [persona], shows: [], scheduleOverride: null, timezone: 'UTC',
    schedule: Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, Array(24).fill(null)])),
    subShows: { eligibleHostPersonaIds: [persona.id], eligibleGuestPersonaIds: [] },
    llm: { provider: 'openai-compatible', model: 'fixture-model', baseUrl: 'http://127.0.0.1:9/v1',
      compatibleMode: 'local', fallback: { enabled: false } },
  });
  for (const record of await showPreparation.generatedRecords()) await showPreparation.discardPreparedGenerated(record.occurrence.id);
  for (let index = 0; index < 40; index++) {
    const id = `fixture-${index}`;
    db.upsertTrackMeta(id, { title: `Song ${index}`, artist: `Artist ${index}`, genres: ['Folk'], duration: 240 });
    db.upsertTrackTags(id, { moods: ['reflective'], energy: 'low', source: 'llm' });
  }
  library.stats({ fresh: true });
});
afterEach(() => { mock.restoreAll(); mock.timers.reset(); });
after(() => { library.shutdown(); removeTempDir(root); });

function regular(id: string) {
  return { ...showSchema({ personaIds: [persona.id], moodNames: null, themeIds: null, minTrackSeconds: null })
    .parse({ name: 'Regular fixture', personaId: persona.id, genres: ['Folk'] }), id };
}

test('preparing a takeover returns a draft without changing programming or publishing an episode', async () => {
  const preview = await prepareTakeoverPreview(request());
  assert.equal(preview.plan.name, plan.name);
  assert.equal(preview.host.id, persona.id);
  assert.deepEqual(preview.guests, []);
  assert.equal(settings.get().scheduleOverride, null);
  assert.deepEqual(settings.get().shows, []);
  assert.deepEqual(await showPreparation.generatedRecords(), []);
  assert.equal(modelCalls, 2);
});

test('activation publishes the exact preview before switching and starts the full duration at activation', async () => {
  const preview = await prepareTakeoverPreview(request());
  mock.timers.setTime(epoch + 90_000);
  const activated = await activateTakeoverPreview(preview.token);
  assert.equal(activated.newlyActivated, true);
  assert.equal(activated.override.startedAt, epoch + 90_000);
  assert.equal(activated.override.expiresAt, epoch + 90_000 + 3600_000);
  assert.deepEqual(settings.get().scheduleOverride, activated.override);
  const [record] = await showPreparation.generatedRecords();
  assert.equal(record.kind, 'ready');
  assert.deepEqual(record.kind === 'ready' && record.plan, preview.plan);
  assert.equal(settings.resolveActiveShow(new Date())?.name, preview.plan.name);
  assert.equal(modelCalls, 2, 'activation must not regenerate');
});

test('simultaneous activation requests share one commit and only one reports a new takeover', async () => {
  const preview = await prepareTakeoverPreview(request());
  const results = await Promise.all([activateTakeoverPreview(preview.token), activateTakeoverPreview(preview.token)]);
  assert.deepEqual(results.map(result => result.newlyActivated).sort(), [false, true]);
  assert.deepEqual(results[0].override, results[1].override);
  assert.equal((await showPreparation.generatedRecords()).length, 1);
  assert.equal((await activateTakeoverPreview(preview.token)).newlyActivated, false);
  assert.equal(modelCalls, 2);
});

test('expired and unknown preview tokens cannot activate programming', async () => {
  const preview = await prepareTakeoverPreview(request());
  mock.timers.setTime(preview.expiresAt + 1);
  for (const token of [preview.token, 'missing-preview-token']) {
    await assert.rejects(activateTakeoverPreview(token), /expired or the controller restarted/);
  }
  assert.equal(settings.get().scheduleOverride, null);
  assert.deepEqual(await showPreparation.generatedRecords(), []);
});

test('changed persona eligibility requires a new preview rather than silently changing the host', async () => {
  const preview = await prepareTakeoverPreview(request());
  await settings.update({ subShows: { eligibleHostPersonaIds: [] } });
  await assert.rejects(activateTakeoverPreview(preview.token), /roster or Sub\/Shows settings changed/);
  assert.equal(settings.get().scheduleOverride, null);
  assert.deepEqual(await showPreparation.generatedRecords(), []);
});

test('a reduced music pool rejects activation and leaves current programming alone', async () => {
  const preview = await prepareTakeoverPreview(request());
  for (let index = 0; index < 20; index++) db.upsertTrackMeta(`fixture-${index}`, { genres: ['Other'] });
  await assert.rejects(activateTakeoverPreview(preview.token), /available music pool changed/);
  assert.equal(settings.get().scheduleOverride, null);
  assert.deepEqual(await showPreparation.generatedRecords(), []);
});

test('a failed switch rolls back the staged plan and preserves an existing regular show', async () => {
  const existing = regular('s_takeover_dj_choice');
  await settings.update({ shows: [existing] });
  const preview = await prepareTakeoverPreview(request());
  await assert.rejects(activateTakeoverPreview(preview.token), /already used by a regular show/);
  assert.equal(settings.get().scheduleOverride, null);
  assert.notEqual(settings.get().shows[0].generation?.mode, 'generated');
  assert.equal(settings.get().shows[0].name, existing.name);
  assert.deepEqual(await showPreparation.generatedRecords(), []);
});

test('changed schedule-change boundaries reject the old preview', async () => {
  const show = regular('s_regular');
  const schedule = structuredClone(settings.get().schedule);
  schedule[1][9] = show.id;
  await settings.update({ shows: [show], schedule });
  const preview = await prepareTakeoverPreview(takeoverPreviewRequestSchema.parse({ showId: null,
    template: 'dj-choice', until: 'schedule-change', expectedEndsAt: epoch + 3600_000 }));
  schedule[1][9] = null; schedule[1][10] = show.id;
  await settings.update({ schedule });
  await assert.rejects(activateTakeoverPreview(preview.token), /schedule window changed/);
  assert.equal(settings.get().scheduleOverride, null);
  assert.deepEqual(await showPreparation.generatedRecords(), []);
});

test('a semantic generation refusal creates no takeover or accepted episode', async () => {
  refuse = true;
  await assert.rejects(prepareTakeoverPreview(request()), /No coherent musical fit/);
  assert.equal(modelCalls, 1);
  assert.equal(settings.get().scheduleOverride, null);
  assert.deepEqual(await showPreparation.generatedRecords(), []);
});

test('unavailable genre metadata cannot turn strict takeover filters into an inactive lock', async () => {
  const preview = await prepareTakeoverPreview(request());
  mock.timers.setTime(epoch + 6 * 60_000); // Expire the genre-name cache, keeping the preview valid.
  genresUnavailable = true;
  await assert.rejects(activateTakeoverPreview(preview.token), /Could not verify.*music filters/);
  assert.equal(settings.get().scheduleOverride, null);
  assert.deepEqual(await showPreparation.generatedRecords(), []);
});

test('provider failures in either call leave programming and accepted episodes untouched', async () => {
  for (const stage of ['concept', 'compiler'] as const) {
    unavailableStage = stage; modelCalls = 0;
    await assert.rejects(prepareTakeoverPreview(request()), /Fixture provider unavailable/);
    assert.equal(modelCalls, stage === 'concept' ? 2 : 3, 'shared SDK recovery may repeat the failed call; no coverage correction starts');
    assert.equal(settings.get().scheduleOverride, null);
    assert.deepEqual(settings.get().shows, []);
    assert.deepEqual(await showPreparation.generatedRecords(), []);
  }
});

test('a provider failure preparing another takeover preserves the already-active accepted show', async () => {
  const preview = await prepareTakeoverPreview(request());
  const active = await activateTakeoverPreview(preview.token);
  const records = await showPreparation.generatedRecords();
  unavailableStage = 'concept';
  await assert.rejects(prepareTakeoverPreview(request()), /Fixture provider unavailable/);
  assert.deepEqual(settings.get().scheduleOverride, active.override);
  assert.deepEqual(await showPreparation.generatedRecords(), records);
  assert.equal(settings.resolveActiveShow(new Date())?.name, preview.plan.name);
});

test('a short pool permits only one concept/compiler correction pair, without activating a fallback show', async () => {
  for (let index = 0; index < 11; index++) db.upsertTrackMeta(`fixture-${index}`, { genres: ['Other'] });
  library.stats({ fresh: true });
  await assert.rejects(prepareTakeoverPreview(request()), /needs at least 30.*only 29/);
  assert.equal(modelCalls, 4, 'two structured calls per proposal, at most two proposals for coverage');
  assert.equal(settings.get().scheduleOverride, null);
  assert.deepEqual(await showPreparation.generatedRecords(), []);
});

test('a small library can support a shorter slot without inventing broader filters', async () => {
  for (let index = 0; index < 11; index++) db.upsertTrackMeta(`fixture-${index}`, { genres: ['Other'] });
  library.stats({ fresh: true });
  const preview = await prepareTakeoverPreview({ ...request(), minutes: 30 });
  assert.deepEqual(preview.plan.genres, ['Folk']);
  assert.equal(preview.plan.filtersStrict, true);
  assert.equal(modelCalls, 2);
  assert.equal(settings.get().scheduleOverride, null);
});

test('a narrow single-genre library cannot fabricate a Deep Discovery rarity core', async () => {
  await assert.rejects(prepareTakeoverPreview({ ...request(), template: 'deep-discovery' }), /no smaller genre pools/);
  assert.equal(modelCalls, 0);
  assert.equal(settings.get().scheduleOverride, null);
  assert.deepEqual(await showPreparation.generatedRecords(), []);
});

test('an empty library stops before spending a model call', async () => {
  db.pruneMissingTracks(new Set());
  library.stats({ fresh: true });
  await assert.rejects(prepareTakeoverPreview(request()), /no available genre palette/);
  assert.equal(modelCalls, 0);
  assert.equal(settings.get().scheduleOverride, null);
});

test('indexed tracks without genre metadata cannot fabricate a genre palette', async () => {
  db.pruneMissingTracks(new Set());
  db.upsertTrackMeta('no-genres', { title: 'Fixture Song', artist: 'Fixture Artist', duration: 240 });
  db.upsertTrackTags('no-genres', { moods: ['reflective'], energy: 'low', source: 'llm' });
  library.stats({ fresh: true });
  await assert.rejects(prepareTakeoverPreview(request()), /no available genre palette/);
  assert.equal(modelCalls, 0);
  assert.equal(settings.get().scheduleOverride, null);
});
