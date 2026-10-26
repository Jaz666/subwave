// Bundled skill installation and upgrade defaults, without a station or model.
import assert from 'node:assert/strict';
import test, { beforeEach, after } from 'node:test';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTempDir, removeTempDir } from './test-utils/temp-dir.js';
import { coldLoadSettings } from './test-utils/settings.js';

const root = createTempDir(join(tmpdir(), 'subwave-skill-install-'));
process.env.STATE_DIR = root;
const settings = await import('../src/settings.js');
const { DEFAULTS } = await import('../src/settings/defaults.js');
const { seedBuiltinSkills } = await import('../src/skills/scaffold.js');
const { loadSkills, readTemplate, SEEDED_KINDS } = await import('../src/skills/loader.js');
const { skillCatalog } = await import('../src/skills/_agent.js');
const { skillEligible } = await import('../src/skills/eligibility.js');
const toolUrl = new URL('../src/skills/builtins/sub-show-talking-point/tool.mjs', import.meta.url);
const { default: talkingPoint } = await import(toolUrl.href);
const slug = 'sub-show-talking-point';
const dir = join(root, 'skills', slug);
const md = join(dir, 'SKILL.md');
const tool = join(dir, 'tool.mjs');
beforeEach(async () => { await rm(dir, { recursive: true, force: true }); await coldLoadSettings({}); });
after(() => removeTempDir(root));

test('a fresh install seeds both editable files, loads the built-in and reports it disabled', async () => {
  await seedBuiltinSkills();
  const template = (await readTemplate(slug))!;
  assert.equal(await readFile(md, 'utf8'), template.skillMd);
  assert.equal(await readFile(tool, 'utf8'), await readFile(toolUrl, 'utf8'));
  assert.equal(SEEDED_KINDS.has(slug), true);
  const cap = (await loadSkills()).find(cap => cap.skill === slug)!;
  assert.ok(cap);
  assert.equal(cap.seeded, true);
  assert.equal(cap.cohosts, true);
  assert.equal(typeof cap.toolFn, 'function');
  assert.equal(skillCatalog().find(skill => skill.name === slug)?.enabled, false);
  assert.equal(skillEligible({ seeded: true, skill: slug, enabled: settings.get().skills.enabled,
    personaSkills: [slug], hasCohosts: true }).allowed, false);
});

test('fresh and upgraded settings default off while preserving other skill toggles', async () => {
  assert.equal(DEFAULTS.skills.enabled[slug], false);
  for (const stored of [{}, { skills: { enabled: { news: false, 'operator-skill': true } } },
    { skills: { enabled: { [slug]: 'invalid' } } }]) {
    const loaded = await coldLoadSettings(stored);
    assert.equal(loaded.skills.enabled[slug], false);
    if (stored.skills?.enabled && 'news' in stored.skills.enabled) {
      assert.equal(loaded.skills.enabled.news, false);
      assert.equal(loaded.skills.enabled['operator-skill'], true);
    }
  }
});

test('explicit enabled and disabled choices survive installation, rescan and a cold load', async () => {
  for (const enabled of [true, false]) {
    await coldLoadSettings({ skills: { enabled: { [slug]: enabled } } });
    await seedBuiltinSkills();
    await loadSkills();
    assert.equal(skillCatalog().find(skill => skill.name === slug)?.enabled, enabled);
    const { setCache } = await import('../src/settings/store.js');
    setCache(null); await settings.load();
    assert.equal(settings.get().skills.enabled[slug], enabled);
  }
});

test('installation leaves explicit persona assignments and the all-skills sentinel untouched', async () => {
  for (const skills of [[], ['news'], [slug], null]) {
    await coldLoadSettings({ personas: [{ ...DEFAULTS.personas[0], skills }], skills: { enabled: { [slug]: true } } });
    const before = structuredClone(settings.get().personas);
    await seedBuiltinSkills(); await loadSkills();
    assert.deepEqual(settings.get().personas, before);
  }
});

test('repeat installation preserves an operator-edited prompt and tool verbatim', async () => {
  await seedBuiltinSkills();
  const customMd = (await readFile(md, 'utf8')) + '\nOperator wording: keep the exchange brief.\n';
  const customTool = '// Operator-maintained relevance check.\n' + await readFile(tool, 'utf8');
  await writeFile(md, customMd); await writeFile(tool, customTool);
  await seedBuiltinSkills(); await loadSkills();
  assert.equal(await readFile(md, 'utf8'), customMd);
  assert.equal(await readFile(tool, 'utf8'), customTool);
});

test('a partial installation restores only the missing file', async () => {
  await seedBuiltinSkills();
  const customMd = (await readFile(md, 'utf8')) + '\nOperator wording.\n';
  await writeFile(md, customMd); await rm(tool);
  await seedBuiltinSkills();
  assert.equal(await readFile(md, 'utf8'), customMd);
  assert.equal(await readFile(tool, 'utf8'), await readFile(toolUrl, 'utf8'));
  const customTool = '// Operator code.\n' + await readFile(tool, 'utf8');
  await writeFile(tool, customTool); await rm(md);
  await seedBuiltinSkills();
  assert.equal(await readFile(tool, 'utf8'), customTool);
  assert.equal(await readFile(md, 'utf8'), (await readTemplate(slug))!.skillMd);
});

test('the shipped tool stands down without an explicit talking point or a matching track genre', async () => {
  const current = { id: 'track-1', title: 'Fixture Song', artist: 'Fixture Artist', genres: ['Jazz'] };
  const services = { nowPlaying: () => current };
  for (const topic of ['', 'A generic show brief.', 'Talking point (optional thread): How does folk leave room for a melody?']) {
    assert.equal((await talkingPoint({ activeShow: { topic } }, {}, services)).available, false);
  }
});

test('the shipped tool supplies only the identified track and a supported genre connection', async () => {
  const current = { id: 'track-1', title: 'Fixture Song', artist: 'Fixture Artist', genres: ['Jazz'] };
  const result = await talkingPoint({ activeShow: { id: 'show-1', name: 'Fixture show',
    topic: 'Talking point (optional thread): How does jazz leave room for a melody?' } }, {}, { nowPlaying: () => current });
  assert.equal(result.available, true);
  assert.equal(result.currentTrack.id, current.id);
  assert.deepEqual(result.relevance.matchingGenres, ['Jazz']);
  let reads = 0;
  const changed = await talkingPoint({ activeShow: { topic: 'Talking point (optional thread): How does jazz leave room for a melody?' } }, {},
    { nowPlaying: () => ++reads === 1 ? current : { ...current, id: 'next-track' } });
  assert.equal(changed.available, false);
});
