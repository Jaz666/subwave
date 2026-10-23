import { createHash } from 'node:crypto';
import { z } from 'zod';
import * as settings from '../settings.js';
import * as library from '../music/library.js';
import { genreRuns, normGenre } from '../music/genre-fold.js';
import { zonedParts } from '../time.js';
import { generatedShowPlanSchema, type GeneratedShowPlan } from '../schemas/show-preparation.js';
import { djObject } from '../llm/sdk.js';

export interface GeneratedShowCast {
  hostPersonaId: string;
  guestPersonaIds: string[];
}

export interface ExistingScheduledShow {
  name: string;
  moods: string[];
  genres: string[];
  eras: Array<{ fromYear: number | null; toYear: number | null }>;
  energies: Array<'low' | 'medium' | 'high'>;
  filtersStrict: boolean;
}

export interface GeneratedShowInput {
  occurrence: { id: string; startsAt: number; endsAt: number };
  template: string;
  planningPrompt: string;
  nameMode?: 'random' | 'custom';
  customName?: string;
  minimumCoverage?: number | null;
  coverageCorrection?: string;
  cast: GeneratedShowCast;
  show: any;
  existingShows?: ExistingScheduledShow[];
}

function stableIndex(key: string, length: number): number {
  if (length <= 1) return 0;
  const digest = createHash('sha256').update(key).digest();
  return digest.readUInt32BE(0) % length;
}

function stableOrder<T>(items: readonly T[], key: string): T[] {
  return [...items].sort((a, b) => {
    const ah = createHash('sha256').update(`${key}:${String(a)}`).digest('hex');
    const bh = createHash('sha256').update(`${key}:${String(b)}`).digest('hex');
    return ah.localeCompare(bh);
  });
}

export function scheduledShowsForHost(hostId: string, currentShowId: string): ExistingScheduledShow[] {
  const station = settings.get();
  const scheduledCounts = new Map<string, number>();
  for (const day of Object.values(station.schedule ?? {})) {
    for (const id of Array.isArray(day) ? day : []) {
      if (typeof id === 'string') scheduledCounts.set(id, (scheduledCounts.get(id) ?? 0) + 1);
    }
  }
  return (station.shows ?? [])
    .filter((show: any) => show.id !== currentShowId && show.personaId === hostId
      && show.generation?.mode !== 'generated' && scheduledCounts.has(show.id))
    .sort((a: any, b: any) => scheduledCounts.get(b.id)! - scheduledCounts.get(a.id)!)
    .slice(0, 5)
    .map((show: any) => ({
      name: String(show.name || 'Untitled show'),
      moods: Array.isArray(show.moods) ? show.moods : [],
      genres: Array.isArray(show.genres) ? show.genres : [],
      eras: Array.isArray(show.eras) ? show.eras : [],
      energies: Array.isArray(show.energies) ? show.energies : [],
      filtersStrict: show.filtersStrict === true,
    }));
}

export function resolveGeneratedShowCast({ show, occurrence, personas }: {
  show: any;
  occurrence: { id: string };
  personas: readonly any[];
}): GeneratedShowCast | null {
  const config = show.generation;
  if (!config || config.mode !== 'generated') return null;
  const eligible = new Map<string, any>(personas.filter(p => p && typeof p.id === 'string').map(p => [p.id, p] as const));
  const subShows = settings.get().subShows;
  const hostIds = config.hostMode === 'random'
    ? (subShows?.eligibleHostPersonaIds ?? [...eligible.keys()]).filter((id: string) => eligible.has(id))
    : [show.personaId].filter((id: string) => eligible.has(id));
  if (!hostIds.length) return null;
  const hostPersonaId = hostIds[stableIndex(occurrence.id, hostIds.length)]!;
  const guestIds: string[] = config.guestMode === 'none'
    ? []
    : config.guestMode === 'fixed'
      ? (show.guestPersonaIds ?? []).filter((id: string) => id !== hostPersonaId && eligible.has(id))
      : stableOrder<string>((subShows?.eligibleGuestPersonaIds ?? [...eligible.keys()])
        .filter((id: string) => id !== hostPersonaId && eligible.has(id)), occurrence.id)
        .slice(0, config.guestCount.min + stableIndex(`${occurrence.id}:guest-count`, config.guestCount.max - config.guestCount.min + 1));
  return { hostPersonaId, guestPersonaIds: [...new Set(guestIds)].slice(0, 3) };
}

function showTime(input: GeneratedShowInput): string {
  const p = zonedParts(new Date(input.occurrence.startsAt));
  const end = zonedParts(new Date(input.occurrence.endsAt));
  const hour12 = settings.get().locale === 'en-US';
  const fmt = new Intl.DateTimeFormat(settings.get().locale || 'en-GB', {
    timeZone: settings.get().timezone || undefined,
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const clock = (hour: number, minute: number) => {
    return new Intl.DateTimeFormat(settings.get().locale || 'en-GB', {
      timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12,
    }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
  };
  const date = fmt.format(new Date(input.occurrence.startsAt));
  const hours = Math.round((input.occurrence.endsAt - input.occurrence.startsAt) / 3_600_000 * 10) / 10;
  return `${date}, ${clock(p.hour, p.minute)}–${clock(end.hour, end.minute)} (${hours} hours)`;
}

function mergeEraWindows(eras: GeneratedShowPlan['eras']): GeneratedShowPlan['eras'] {
  const sorted = [...eras].sort((a, b) => (a.fromYear ?? -Infinity) - (b.fromYear ?? -Infinity));
  const merged: GeneratedShowPlan['eras'] = [];
  for (const era of sorted) {
    const previous = merged.at(-1);
    if (!previous || (previous.toYear != null && era.fromYear != null && era.fromYear > previous.toYear + 1)) {
      merged.push({ ...era });
      continue;
    }
    previous.fromYear = previous.fromYear == null || era.fromYear == null
      ? null : Math.min(previous.fromYear, era.fromYear);
    previous.toYear = previous.toYear == null || era.toYear == null
      ? null : Math.max(previous.toYear, era.toYear);
  }
  return merged;
}

export function discoveryGenreCounts(names: string[], tracks: readonly { genres?: readonly string[] | null; genre?: string | null }[]): Record<string, number> {
  const counts = new Map(names.map(name => [normGenre(name), 0]));
  const runsByTag = new Map<string, string[]>();
  for (const track of tracks) {
    const matches = new Set<string>();
    for (const tag of track.genres ?? (track.genre ? [track.genre] : [])) {
      let runs = runsByTag.get(tag);
      if (!runs) {
        runs = genreRuns(tag).filter(key => counts.has(key));
        runsByTag.set(tag, runs);
      }
      for (const key of runs) matches.add(key);
    }
    for (const key of matches) counts.set(key, counts.get(key)! + 1);
  }
  return Object.fromEntries(names.map(name => [name, counts.get(normGenre(name)) ?? 0]));
}

export function showGenreChoices(byGenre: Record<string, number>, template: string, repertoireEstimate = 1) {
  const genres = Object.entries(byGenre)
    .filter(([name, count]) => name && count > 0)
    .map(([name, tracks]) => ({ name, tracks }));
  if (template === 'deep-discovery') {
    // Scan the whole catalogue before bounding the prompt. A duration-based
    // repertoire cue avoids offering only singleton tags to the small model;
    // it is not an operator minimum or a unique eligible-track guarantee.
    const viable = genres.filter(genre => genre.tracks >= repertoireEstimate);
    if (viable.length) return viable.sort((a, b) => a.tracks - b.tracks || a.name.localeCompare(b.name)).slice(0, 80);
  }
  return genres.sort((a, b) => b.tracks - a.tracks || a.name.localeCompare(b.name)).slice(0, 80);
}

export function normalizeGeneratedMusicSettings(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const value = { ...raw } as Record<string, unknown>;
  if (typeof value.rationale === 'string') value.rationale = value.rationale.trim().slice(0, 500);
  if (Array.isArray(value.eras)) value.eras = value.eras.flatMap(era => {
    if (!era || typeof era !== 'object' || Array.isArray(era)) return [era];
    const window = { ...era } as Record<string, unknown>;
    for (const key of ['fromYear', 'toYear']) {
      const year = window[key];
      if (Array.isArray(year) && year.length === 1 && typeof year[0] === 'number') window[key] = year[0];
    }
    // An all-open window means no era restriction; [] expresses that already.
    return window.fromYear === null && window.toYear === null ? [] : [window];
  });
  return value;
}

export async function generateShowPlan(input: GeneratedShowInput): Promise<GeneratedShowPlan> {
  const generationPass = input.coverageCorrection ? 'coverage-correction' : 'initial';
  let libraryStats: ReturnType<typeof library.stats> | null = null;
  try {
    await library.load();
    libraryStats = library.stats();
  } catch { /* A show can still be planned without local coverage data. */ }
  const personas = settings.get().personas ?? [];
  const moodNames = settings.moodVocab();
  const indexedGenreCounts = libraryStats?.byGenre as Record<string, number> | undefined;
  const byGenre = input.template === 'deep-discovery' && libraryStats
    ? discoveryGenreCounts(Object.keys(indexedGenreCounts ?? {}), library.candidateFilterTracks())
    : indexedGenreCounts;
  const repertoireEstimate = input.minimumCoverage ?? Math.max(1, Math.ceil((input.occurrence.endsAt - input.occurrence.startsAt) / 240_000));
  const genreChoices = showGenreChoices(byGenre ?? {}, input.template, repertoireEstimate);
  const hostPersona = personas.find((p: any) => p.id === input.cast.hostPersonaId);
  if (!hostPersona) throw new Error('The selected host is no longer available');
  const guests = input.cast.guestPersonaIds
    .map(id => personas.find((p: any) => p.id === id))
    .filter(Boolean);
  const host = {
    name: String(hostPersona.name || 'Host'),
    soul: String(hostPersona.soul || ''),
    musicLean: String(hostPersona.musicLean || '').trim(),
  };
  const existingShows = input.existingShows ?? scheduledShowsForHost(hostPersona.id, input.show?.id);
  const choices = genreChoices;
  const counts = byGenre ?? {};
  const moods = moodNames;
  const estimate = Math.max(1, Math.ceil((input.occurrence.endsAt - input.occurrence.startsAt) / 240_000));
  const conceptSchema = generatedShowPlanSchema.pick({ name: true, topic: true }).extend({
    intendedGenres: choices.length
      ? z.array(z.enum(choices.map(g => g.name) as [string, ...string[]])).min(1).max(6)
      : z.array(z.never()).max(0),
  });
  const identity = (p: any) => ({ name: p.name, soul: p.soul, ...(p.musicLean ? { musicalLeanings: p.musicLean } : {}) });
  const concept = await djObject({
    system: 'Plan one specific musical radio episode led by the host. Write its short brief, derive its title, and explicitly declare the small genre palette the brief promises. Return only the requested JSON.',
    prompt: [
      `Host: ${JSON.stringify(identity(host))}`,
      `Guests (secondary): ${JSON.stringify(guests.map(identity))}`,
      `Template: ${input.template}; local slot: ${showTime(input)}.`,
      `Familiar repertoire, not speech instructions: ${JSON.stringify(existingShows)}`,
      `Available genre palette, with indexed matching-track counts: ${choices.map(g => `${g.name}:${g.tracks}`).join('; ')}`,
      input.planningPrompt ? `Operator direction: ${input.planningPrompt}` : null,
      input.coverageCorrection || null,
      input.nameMode === 'custom' ? `Use this exact title: ${input.customName}` : 'Derive an original title from the brief.',
      'The Soul is primary and may contain all musical preferences. Musical Leanings is optional supplementary guidance. Choose a musical angle that fits stated preferences; calm speech, banter and personality do not impose music filters.',
      input.template === 'deep-discovery'
        ? 'Use a small, coherent neighbourhood of underrepresented styles from the supplied palette. Rarity alone does not connect genres; avoid a generic genre journey or repeating the Soul.'
        : 'Include familiar anchors when available and related wider-reaching choices from the supplied palette.',
      'Write a concise brief and name. Declare 1–6 intendedGenres copied exactly from the available palette, never a catalogue dump. The brief must describe those same styles. Do not promise other genres, particular tracks or artists, a fixed playlist, release chronology or unsupported artistic influence. Do not invent personal history or airplay.',
      `Counts overlap; roughly ${estimate} four-minute records is a pacing estimate, not a hard minimum. Do not force era, mood or energy restrictions from favourite decades or presentation. Return name, topic and intendedGenres.`,
    ].filter(Boolean).join('\n\n'),
    schema: conceptSchema, temperature: 0.7,
    kind: 'generateShowPlan.concept',
    telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template, pass: generationPass },
  }) as z.infer<typeof conceptSchema>;
  const intended = [...new Set(concept.intendedGenres)];
  const settingsSchema = generatedShowPlanSchema.omit({ name: true, topic: true }).extend({
    genres: intended.length
      ? z.array(z.enum(intended as [string, ...string[]])).length(intended.length)
      : z.array(z.never()).max(0),
  }).check(c => {
    if (c.value.filtersStrict && !(c.value.genres.length || c.value.moods.length || c.value.eras.length || c.value.energies.length)) {
      c.issues.push({ code: 'custom', input: c.value.filtersStrict, path: ['filtersStrict'], message: 'requires at least one music setting' });
    }
  });
  let music: z.infer<typeof settingsSchema>;
  try {
    music = await djObject({
      system: 'Translate the accepted musical proposal into settings. Do not create another idea or choose another genre palette. Preserve every required genre exactly once. Default mood, era and energy lists to empty and strictness to false.',
      prompt: [
        `Accepted proposal: ${JSON.stringify({ name: concept.name, topic: concept.topic, requiredGenres: intended.map(name => ({ name, tracks: counts[name] })) })}`,
        `Duration: ${(input.occurrence.endsAt - input.occurrence.startsAt) / 60_000} minutes. Allowed moods: ${moods.join(', ')}.`,
        input.planningPrompt ? `Operator requirements: ${input.planningPrompt}` : null,
        input.minimumCoverage != null ? `Operator minimum: ${input.minimumCoverage} unique eligible tracks after all filters and exclusions.` : null,
        input.coverageCorrection || null,
        'Copy requiredGenres into genres exactly once each, with no additions, omissions or substitutions. Keep moods, eras and energies empty unless the operator or musical idea explicitly requires a restriction and coverage supports it. Conversation style and favourite decades are not music restrictions. Soft filters leave room for exploration.',
        'Counts overlap and do not prove coverage after additional filters. Return moods, genres, eras, energies, filtersStrict and a rationale under 500 characters explaining this accepted palette. Do not invent artist influence, history or airplay. Any era is eras: [].',
      ].filter(Boolean).join('\n\n'),
      schema: settingsSchema, temperature: 0.1,
      kind: 'generateShowPlan.musicSettings',
      telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template, pass: generationPass },
    }) as z.infer<typeof settingsSchema>;
  } catch (error) {
    // Preserve the existing narrow format recovery without another model call.
    try {
      if (!error || typeof error !== 'object' || !('text' in error) || typeof error.text !== 'string') throw error;
      music = settingsSchema.parse(normalizeGeneratedMusicSettings(JSON.parse(error.text)));
    } catch { throw error; }
  }
  const parsed = settingsSchema.parse(normalizeGeneratedMusicSettings(music));
  // A successful schema parse alone permits duplicate array values. Verify the
  // exact set; never silently append a missing genre or drop an extra one.
  const acceptedGenres = new Set<string>(parsed.genres);
  if (acceptedGenres.size !== intended.length || intended.some(g => !acceptedGenres.has(g))) {
    throw new Error('Music settings did not preserve the intended genre palette');
  }
  if (parsed.moods.some(mood => !moods.includes(mood))) throw new Error('Music settings returned a mood outside the station vocabulary');
  return generatedShowPlanSchema.parse({
    ...concept, ...parsed,
    moods: [...new Set(parsed.moods)], energies: [...new Set(parsed.energies)],
    eras: mergeEraWindows(parsed.eras),
    name: input.nameMode === 'custom' ? input.customName : concept.name,
  });
}
