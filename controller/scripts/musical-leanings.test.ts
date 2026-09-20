// Persona Musical Leanings are private soft editorial context shared by every
// picker implementation. Agentic discovery deliberately excludes them; its
// constrained final selection receives the same context as native Shortlist.

import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.STATE_DIR = mkdtempSync(join(tmpdir(), 'subwave-musical-leanings-'));

const settings = await import('../src/settings.js');
await settings.load();
const { PICK_SCHEMA, agenticDiscoverySchema, pickSystem, pickerMusicLeanings, resolveEditorialLeanings } = await import('../src/broadcast/dj-agent/schemas.js');
const { agenticFinalPickPrompt, agenticFinalPickSchema } = await import('../src/music/dj-pick.js');

const persona = { ...settings.get().personas[0], musicLean: 'Favour patient dub, deep electronic cuts, and melodic post-punk.' };
await settings.update({ personas: [persona], activePersonaId: persona.id });

assert.equal(
  settings.personaMusicLeanings(settings.getEffectivePersona()),
  'Favour patient dub, deep electronic cuts, and melodic post-punk.',
);

const prompt = pickSystem();
assert.match(prompt, /Musical Leanings — Favour patient dub, deep electronic cuts, and melodic post-punk\./);
assert.match(prompt, /soft editorial preference/i);
assert.match(prompt, /may guide an otherwise sound selection/i);
assert.match(prompt, /never overrides show rules, rotation, safety, or the musical flow/i);
const discovery = agenticDiscoverySchema();
assert.equal(discovery.safeParse({ id: 'candidate', reason: 'fresh texture', transition: null }).success, true);
assert.equal(discovery.safeParse({ id: 'candidate', reason: 'fresh texture', usedMusicalLeanings: false, leaningsTieBreak: null, transition: null }).success, true, 'diagnostic extras are tolerated but not required by Agentic discovery');
assert.equal(PICK_SCHEMA.safeParse({ id: 'candidate', reason: 'fresh texture', usedMusicalLeanings: true, leaningsTieBreak: 'warm vocal and melody', transition: null }).success, true);
assert.equal(PICK_SCHEMA.safeParse({ id: 'candidate', reason: 'fresh texture', usedMusicalLeanings: true, transition: null }).success, false);
assert.match(PICK_SCHEMA.shape.reason.description ?? '', /Default to actual flow/i);
assert.match(PICK_SCHEMA.shape.usedMusicalLeanings.description ?? '', /Default false/i);
const finalSchema = agenticFinalPickSchema(['candidate']);
assert.equal(finalSchema.safeParse({ id: 'candidate', selectionReason: 'Artist — Track: it fits this reflective moment.', transition: null }).success, true);
assert.equal(finalSchema.safeParse({ id: 'candidate', selectionReason: 'Artist — Track: it fits this reflective moment.', usedMusicalLeanings: true, transition: null }).success, true, 'final Agentic selection does not require provenance');
const finalPrompt = agenticFinalPickPrompt([{ id: 'candidate', artist: 'Artist', title: 'Track' }], {}, resolveEditorialLeanings());
assert.match(finalPrompt, /soft editorial preference/i);
assert.match(finalPrompt, /Do not state or imply that Musical Leanings/i);

const guest = settings.guestEditorialNudgeFromGuests([
  { id: 'p_f023a4', name: 'Carrie Marshall', musicLean: 'Favour great guitar work and unexpected rock records.' },
], () => 0);
assert.deepEqual(guest, {
  guest: { id: 'p_f023a4', name: 'Carrie Marshall' },
  musicalLeanings: 'Favour great guitar work and unexpected rock records.',
});
assert.equal(
  settings.guestEditorialNudge(new Date(), () => 0),
  null,
  'guest influence is disabled by default',
);
await settings.update({ llm: { guestMusicalLeanings: true } });
assert.equal(settings.get().llm.guestMusicalLeanings, true, 'the station-wide opt-in persists');
assert.equal(
  settings.guestEditorialNudgeFromGuests([
    { id: 'p_f023a4', name: 'Carrie Marshall', musicLean: 'Favour great guitar work and unexpected rock records.' },
  ], () => 0.25),
  null,
  'guest influence stays occasional and secondary',
);
const guestPrompt = pickerMusicLeanings('Favour patient dub.', guest);
assert.match(guestPrompt, /Musical Leanings — Favour patient dub\./);
assert.match(guestPrompt, /Guest Musical Leanings — Carrie Marshall: Favour great guitar work and unexpected rock records\./);
assert.match(guestPrompt, /weaker than the host/i);

console.log('musical leanings: Agentic final-selection context verified');
