// Persona Musical Leanings are private soft editorial context shared by every
// picker implementation. This pins the agentic path now; the optional native
// shortlist path consumes the same settings.personaMusicLeanings() helper.

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.STATE_DIR = mkdtempSync(join(tmpdir(), 'subwave-musical-leanings-'));

const settings = await import('../src/settings.js');
await settings.load();
const { pickSystem } = await import('../src/broadcast/dj-agent/schemas.js');

const persona = { ...settings.get().personas[0], musicLean: 'Favour patient dub, deep electronic cuts, and melodic post-punk.' };
await settings.update({ personas: [persona], activePersonaId: persona.id });

assert.equal(
  settings.personaMusicLeanings(settings.getEffectivePersona()),
  'Favour patient dub, deep electronic cuts, and melodic post-punk.',
);

const prompt = pickSystem();
assert.match(prompt, /Musical Leanings — Favour patient dub, deep electronic cuts, and melodic post-punk\./);
assert.match(prompt, /only to break a close tie/i);
assert.match(prompt, /never overrides show rules, rotation, safety, or the musical flow/i);

console.log('musical leanings: shared agentic picker context verified');
