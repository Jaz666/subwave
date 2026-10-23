// Preview-only alternative. Production generation never imports this module.
import { z } from 'zod';
import { generatedShowPlanSchema } from '../src/schemas/show-preparation.js';
import { djObject } from '../src/llm/sdk.js';
import * as settings from '../src/settings.js';
import * as library from '../src/music/library.js';
import { normGenre } from '../src/music/genre-fold.js';
import { discoveryGenreCounts, normalizeGeneratedMusicSettings, showGenreChoices, type GeneratedShowInput } from '../src/broadcast/show-generation.js';

export async function generateSingleCallPreview(input: GeneratedShowInput) {
  await library.load();
  const stats = library.stats();
  const counts = input.template === 'deep-discovery'
    ? discoveryGenreCounts(Object.keys(stats.byGenre), library.candidateFilterTracks())
    : stats.byGenre;
  const estimate = Math.max(1, Math.ceil((input.occurrence.endsAt - input.occurrence.startsAt) / 240_000));
  const choices = showGenreChoices(counts, input.template, input.minimumCoverage ?? estimate);
  const personas = settings.get().personas ?? [];
  const host = personas.find(p => p.id === input.cast.hostPersonaId);
  if (!host) throw new Error('Preview host is unavailable');
  const moods = settings.moodVocab();
  const identity = (p: typeof host) => ({ name: p.name, soul: p.soul, ...(p.musicLean ? { musicalLeanings: p.musicLean } : {}) });
  const prompt = [
    `Create one ${input.template} episode proposal: brief first, name derived from it, and matching music settings, all in one JSON response.`,
    `Host: ${JSON.stringify(identity(host))}`,
    `Guests (secondary influence): ${JSON.stringify(input.cast.guestPersonaIds.map(id => personas.find(p => p.id === id)).filter(p => p != null).map(identity))}`,
    `Slot: ${new Date(input.occurrence.startsAt).toISOString()}, ${(input.occurrence.endsAt - input.occurrence.startsAt) / 60_000} minutes. Station timezone: ${settings.get().timezone}.`,
    `Familiar repertoire (existing filters, not speech briefs): ${JSON.stringify(input.existingShows ?? [])}`,
    `Recommended library genres with matching-track counts: ${choices.map(g => `${g.name}:${g.tracks}`).join('; ')}`,
    `Allowed moods: ${moods.join(', ')}. Choose genre tags only from the supplied recommendations, copied exactly; they are the palette available for this preview.`,
    input.planningPrompt ? `Operator direction: ${input.planningPrompt}` : null,
    input.nameMode === 'custom' ? `Use the operator title exactly: ${input.customName}` : 'Give the episode its own name, not the template name.',
    'The Soul is primary and may contain all musical preferences. Musical Leanings is optional supplementary guidance. Delivery, humour and guest interaction are presentation, not track filters.',
    input.template === 'deep-discovery'
      ? 'Find a specific musical connection between smaller related genres that fit the host. A rare genre is not automatically a good fit. Avoid a generic genre journey or a restatement of the Soul.'
      : 'Include familiar anchor genres and related wider-reaching choices, with a specific listening angle rooted in this host.',
    'Write a short, concrete musical brief. Every genre explicitly promised in that brief must appear in genres. Keep the chosen styles coherent; do not substitute unrelated genres or claim a relationship just because the host is eclectic. Use at most 15 genres, never pad the list.',
    'Default moods, eras and energies to [] and filtersStrict to false. Add them only when the musical idea or operator explicitly requires them. Calm speech does not imply calm music, and favourite decades do not impose era windows. Soft filters deliberately leave room for exploration.',
    `The slot suggests roughly ${estimate} four-minute records, not a hard minimum. Counts overlap and do not establish coverage after extra restrictions. Do not invent facts, artist influence, prior airplay, an opening artist or a fixed playlist.`,
    'Return name, topic, moods, genres, eras, energies, filtersStrict and rationale. Rationale must explain the musical connection in at most 500 characters. Any era is eras: [].',
  ].filter(Boolean).join('\n\n');
  // A compact shortlist enum prevents invented tags without sending the full
  // catalogue. Local validation still checks the resulting plan and mood names.
  const schema = generatedShowPlanSchema.extend({
    genres: choices.length
      ? z.array(z.enum(choices.map(g => g.name) as [string, ...string[]])).max(15)
      : z.array(z.never()).max(0),
  });
  let raw: unknown;
  try {
    raw = await djObject({
      system: 'Create one coherent radio episode proposal grounded in the host. The brief and music filters must describe the same musical idea. Return only the requested JSON.',
      prompt, schema, temperature: 0.7,
      kind: 'generateShowPlan.previewSingle',
      telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template, pass: 'preview' },
    });
  } catch (error) {
    if (!error || typeof error !== 'object' || !('text' in error) || typeof error.text !== 'string') throw error;
    try { raw = JSON.parse(error.text); } catch { throw error; }
  }
  const plan = schema.parse(normalizeGeneratedMusicSettings(raw));
  const catalogue = new Map(Object.keys(counts).map(name => [normGenre(name), name]));
  const unknownGenres = plan.genres.filter(name => !catalogue.has(normGenre(name)));
  const unknownMoods = plan.moods.filter(name => !moods.includes(name));
  if (unknownGenres.length || unknownMoods.length) {
    throw new Error(`Invalid preview vocabulary: genres=${unknownGenres.join(', ')}; moods=${unknownMoods.join(', ')}`);
  }
  return { ...plan, genres: [...new Set(plan.genres.map(name => catalogue.get(normGenre(name))!))] };
}
