// Preview-only two-call variant. The second call translates a bounded handoff;
// it never receives the persona, existing shows or the full catalogue again.
import { z } from 'zod';
import { djObject } from '../src/llm/sdk.js';
import { generatedShowPlanSchema } from '../src/schemas/show-preparation.js';
import { normalizeGeneratedMusicSettings, type GeneratedShowInput } from '../src/broadcast/show-generation.js';
import { loadShowPreviewContext } from './show-plan-single.js';

export async function generateCompactTwoCallPreview(input: GeneratedShowInput) {
  const { host, personas, moods, choices, counts, estimate } = await loadShowPreviewContext(input);
  if (!choices.length) throw new Error('Compact preview needs an indexed genre shortlist');
  const conceptSchema = generatedShowPlanSchema.pick({ name: true, topic: true }).extend({
    intendedGenres: z.array(z.enum(choices.map(g => g.name) as [string, ...string[]])).min(1).max(6),
  });
  const identity = (p: typeof host) => ({ name: p.name, soul: p.soul, ...(p.musicLean ? { musicalLeanings: p.musicLean } : {}) });
  const concept = await djObject({
    system: 'Plan one specific musical radio episode led by the host. Write its short brief, derive its title, and explicitly declare the small genre palette the brief promises. Return only the requested JSON.',
    prompt: [
      `Host: ${JSON.stringify(identity(host))}`,
      `Guests (secondary): ${JSON.stringify(input.cast.guestPersonaIds.map(id => personas.find(p => p.id === id)).filter(p => p != null).map(identity))}`,
      `Template: ${input.template}; duration: ${(input.occurrence.endsAt - input.occurrence.startsAt) / 60_000} minutes.`,
      `Familiar repertoire, not speech instructions: ${JSON.stringify(input.existingShows ?? [])}`,
      `Available genre palette, with indexed matching-track counts: ${choices.map(g => `${g.name}:${g.tracks}`).join('; ')}`,
      input.planningPrompt ? `Operator direction: ${input.planningPrompt}` : null,
      input.nameMode === 'custom' ? `Use this exact title: ${input.customName}` : 'Derive an original title from the brief.',
      'The Soul is primary and may contain all musical preferences. Musical Leanings is optional supplementary guidance. Choose a musical angle that fits stated preferences; calm speech, banter and personality do not impose music filters.',
      input.template === 'deep-discovery'
        ? 'Use a small, coherent neighbourhood of underrepresented styles from the supplied palette. Rarity alone does not connect genres; avoid a generic genre journey or repeating the Soul.'
        : 'Include familiar anchors when available and related wider-reaching choices from the supplied palette.',
      'Write a concise brief and name. Declare 1–6 intendedGenres copied exactly from the available palette, never a catalogue dump. The brief must describe those same styles. Do not promise other genres, particular tracks or artists, a fixed playlist, release chronology or unsupported artistic influence. Do not invent personal history or airplay.',
      `Counts overlap; roughly ${estimate} four-minute records is a pacing estimate, not a hard minimum. Do not force era, mood or energy restrictions from favourite decades or presentation. Return name, topic and intendedGenres.`,
    ].filter(Boolean).join('\n\n'),
    schema: conceptSchema, temperature: 0.7,
    kind: 'generateShowPlan.previewCompactConcept',
    telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template, pass: 'preview' },
  }) as z.infer<typeof conceptSchema>;
  const intended = [...new Set(concept.intendedGenres)];
  const settingsSchema = generatedShowPlanSchema.omit({ name: true, topic: true }).extend({
    genres: z.array(z.enum(intended as [string, ...string[]])).length(intended.length),
  });
  const music = await djObject({
    system: 'Translate the accepted musical proposal into settings. Do not create another idea or choose another genre palette. Preserve every required genre exactly once. Default mood, era and energy lists to empty and strictness to false.',
    prompt: [
      `Accepted proposal: ${JSON.stringify({ name: concept.name, topic: concept.topic, requiredGenres: intended.map(name => ({ name, tracks: counts[name] })) })}`,
      `Duration: ${(input.occurrence.endsAt - input.occurrence.startsAt) / 60_000} minutes. Allowed moods: ${moods.join(', ')}.`,
      input.planningPrompt ? `Operator requirements: ${input.planningPrompt}` : null,
      'Copy requiredGenres into genres exactly once each, with no additions, omissions or substitutions. Keep moods, eras and energies empty unless the operator or musical idea explicitly requires a restriction and coverage supports it. Conversation style and favourite decades are not music restrictions. Soft filters leave room for exploration.',
      'Counts overlap and do not prove coverage after additional filters. Return moods, genres, eras, energies, filtersStrict and a rationale under 500 characters explaining this accepted palette. Do not invent artist influence, history or airplay. Any era is eras: [].',
    ].filter(Boolean).join('\n\n'),
    schema: settingsSchema, temperature: 0.1,
    kind: 'generateShowPlan.previewCompactSettings',
    telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template, pass: 'preview' },
  }) as z.infer<typeof settingsSchema>;
  const parsed = settingsSchema.parse(normalizeGeneratedMusicSettings(music));
  // A successful schema parse alone permits duplicate array values. Verify the
  // exact set; never silently append a missing genre or drop an extra one.
  if (new Set(parsed.genres).size !== intended.length || intended.some(g => !parsed.genres.includes(g))) {
    throw new Error('Compact settings did not preserve the intended genre palette');
  }
  if (parsed.moods.some(mood => !moods.includes(mood))) throw new Error('Compact settings returned a mood outside the station vocabulary');
  return generatedShowPlanSchema.parse({
    ...concept, ...parsed,
    name: input.nameMode === 'custom' ? input.customName : concept.name,
  });
}
