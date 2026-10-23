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
  topic: string;
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

const TEMPLATE_DIRECTIONS: Record<string, string> = {
  'dj-choice': 'Catch-all discovery: keep a few familiar genres from the host’s regular shows in the music palette, then reach into related styles they play less often. Keep the show idea distinct from existing shows; do not make a broad genre journey the premise.',
  'deep-discovery': 'Use the host’s Soul and optional Musical Leanings to shape the show idea. Then favor less-represented genres from the library when choosing music settings, while keeping the brief coherent and playable.',
};

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
      topic: String(show.topic || ''),
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

function allowedPlanSchema(moods: readonly string[], genres: readonly string[]) {
  const moodSet = new Set(moods);
  const genreByKey = new Map(genres.map(genre => [normGenre(genre), genre]));
  const genreSchema = genres.length
    ? z.enum(genres as [string, ...string[]])
    : z.string().refine(value => genreByKey.has(normGenre(value)), 'no library genres are available');
  const planSchema = generatedShowPlanSchema.omit({ name: true, topic: true }).extend({
    moods: z.array(z.string().refine(value => moodSet.has(value), `must be one of: ${moods.join(', ')}`)).max(15)
      .describe(`music moods, chosen only from: ${moods.join(', ')}`),
    genres: z.array(genreSchema).max(15)
      .describe('genre tags copied exactly from the supplied library list'),
  }).check((c) => {
    if (c.value.filtersStrict && !(
      c.value.moods.length || c.value.genres.length || c.value.eras.length || c.value.energies.length
    )) {
      c.issues.push({ code: 'custom', input: c.value.filtersStrict, path: ['filtersStrict'], message: 'requires at least one music setting' });
    }
  });
  return { planSchema, genreByKey };
}

const showConceptSchema = generatedShowPlanSchema.pick({ name: true, topic: true });

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
  const choiceGenres = genreChoices.map(row => row.name);
  const template = TEMPLATE_DIRECTIONS[input.template] || TEMPLATE_DIRECTIONS['dj-choice']!;
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
  const existingShowContext = existingShows.map(show =>
    `- ${show.name}: ${JSON.stringify({ topic: show.topic, moods: show.moods, genres: show.genres, eras: show.eras, energies: show.energies, filtersStrict: show.filtersStrict })}`,
  ).join('\n');
  const existingShowSettings = existingShows.map(show =>
    `- ${show.name}: ${JSON.stringify({ moods: show.moods, genres: show.genres, eras: show.eras, energies: show.energies, filtersStrict: show.filtersStrict })}`,
  ).join('\n');
  const guestContext = guests.map((guest: any) => ({
    name: String(guest.name || 'Guest DJ'),
    musicLean: String(guest.musicLean || '').trim(),
  }));
  const conceptPrompt = [
    `Recurring template: ${input.template}.`,
    `Primary objective: help the operator past a blank page with an appealing, specific show idea that sounds like this host.`,
    `Local slot: ${showTime(input)}.`,
    `Host: ${host.name}. This host leads the creative direction.`,
    `Host DJ Soul: <host-soul>${host.soul}</host-soul>`,
    host.musicLean ? `Host Musical Leanings: <host-leanings>${host.musicLean}</host-leanings>` : 'Host Musical Leanings: (not specified)',
    existingShows.length
      ? `Other current weekly shows led by this host (use these to understand their familiar repertoire and current editorial territory):\n<existing-shows>${existingShowContext}</existing-shows>`
      : 'No other current weekly shows for this host are available as context.',
    guestContext.length ? `Guests, as secondary influence only:\n${guestContext.map(g => `- ${g.name}${g.musicLean ? ` — Musical Leanings: ${g.musicLean}` : ''}`).join('\n')}` : 'Guests: none.',
    `Template direction: ${template}`,
    input.planningPrompt ? `Operator planning direction:\n<operator-direction>${input.planningPrompt}</operator-direction>` : null,
    `Let the host’s Soul and optional Musical Leanings shape the point of view. Give the new show a different central promise or recurring format from the host’s existing shows; do not just rename or lightly rework one. Their genres can still be part of the new palette.`,
    input.template === 'dj-choice'
      ? 'For DJ’s Choice, genres are a music palette, not the show premise. If current weekly shows already cover the host’s obvious genre interests, do not pitch another generic journey through that genre. Keep a few familiar styles available for the music settings and build the premise around a distinct, explicit detail from the host’s Soul or Musical Leanings.'
      : null,
    `Use only details explicitly stated in the host’s Soul, Musical Leanings or existing show information. Do not invent personal history, hometowns, experiences, venues, festivals or relationships.`,
    `Avoid generic frames such as “a journey through [genre],” “hidden gems,” or “stories behind the albums” unless the supplied host details support a specific new format that is clearly different from current shows.`,
    input.template === 'deep-discovery'
      ? 'For Deep Discovery, give this episode one specific musical question, contrast or listening angle rooted in the host’s stated tastes, flexible enough to explore less-represented library genres later. Work from the station library, never an invented personal playlist or record collection. Do not frame this as forgotten favourites, neglected airplay, or a generic hunt for hidden gems: no listening-history evidence is supplied. Do not make the brief a list of genres.'
      : null,
    `Write a concise, concrete brief that gives the show a clear reason to exist and could inspire a real episode. A different genre list alone does not make the premise fresh. Avoid generic genre journeys and do not invent facts about songs, artists, listeners or prior airplay. ${input.nameMode === 'custom' ? 'The operator has supplied the episode name; write only the brief.' : 'Write the brief first, then derive a memorable episode name from it; never use the recurring template name as the episode title.'} Return exactly: ${input.nameMode === 'custom' ? 'topic' : 'name and topic'}.`,
  ].filter(Boolean).join('\n\n');
  const { planSchema, genreByKey } = allowedPlanSchema(moodNames, choiceGenres);
  const usesCustomName = input.nameMode === 'custom';
  const conceptSchema = usesCustomName
    ? generatedShowPlanSchema.pick({ topic: true })
    : showConceptSchema;
  const concept = await djObject({
    system: usesCustomName
      ? 'You create distinct, concrete show briefs for a personal radio station. Ground the premise in the host’s stated Soul and optional Musical Leanings, taking current shows into account. Familiar genres may return in the music palette, but they must not make this another version of an existing show. Do not invent the host’s personal history. Avoid generic genre shows and stock formats. The operator supplied the episode name; guests are secondary. Follow operator direction within station limits.'
      : 'You create distinct, concrete show ideas for a personal radio station. Ground the premise in the host’s stated Soul and optional Musical Leanings, taking current shows into account. Familiar genres may return in the music palette, but they must not make this another version of an existing show. Do not invent the host’s personal history. Avoid generic genre shows and stock formats. Name the brief after writing it; guests are secondary. Follow operator direction within station limits.',
    prompt: conceptPrompt,
    schema: conceptSchema,
    temperature: 0.9,
    kind: 'generateShowPlan.concept',
    telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template, pass: generationPass },
  }) as z.infer<typeof showConceptSchema> | z.infer<typeof conceptSchema>;
  const conceptName = usesCustomName ? String(input.customName || '').trim()
    : 'name' in concept ? concept.name : '';
  const existingSettingsPrompt = existingShows.length
    ? input.template === 'deep-discovery'
      ? `Music settings already used by this host's current shows:\n<existing-show-settings>${existingShowSettings}</existing-show-settings>. Use these to understand the host's taste, then prioritize the less-represented candidates that fit the brief.`
      : input.template === 'dj-choice'
        ? `Music settings already used by this host's current shows:\n<existing-show-settings>${existingShowSettings}</existing-show-settings>. These show which genres make the host recognizable; use a few that fit the brief, then broaden into related genres from the library list.`
        : `Music settings already used by this host's current shows:\n<existing-show-settings>${existingShowSettings}</existing-show-settings>. Use these as context when choosing suitable settings for the brief.`
    : null;
  const templateMusicDirection = input.template === 'deep-discovery'
    ? 'For Deep Discovery, choose usually 3–6 related genres from one coherent musical neighbourhood of the host’s stated tastes and brief. Broad or flexible tastes alone do not justify an unrelated genre. Make smaller styles with tens of records the core; tags with just one or two tracks can be secondary accents, never the whole palette. Include moderately represented related styles when needed to sustain the slot. Avoid familiar broad categories when a smaller related style can do the job. Briefly give the chosen counts and musical connection. Do not invent the host’s musical background or personal collection.'
    : input.template === 'dj-choice'
      ? 'For DJ’s Choice, choose a coherent, selective palette, usually about 4–8 genres. Include a few familiar genres from existing shows, then a few related stretch genres that fit the host and brief. The 15-genre limit is an absolute ceiling, not a target: never pad the list. Omit genres that cannot be clearly connected to the host’s Soul, Musical Leanings or the brief.'
      : 'Choose suitable settings that follow from the brief and available library coverage.';
  const settingsPrompt = [
    `The show idea is final. Choose settings that follow from it without changing its premise.`,
    `Show name: ${conceptName}`,
    `Show brief: <show-brief>${concept.topic}</show-brief>`,
    `Host: ${host.name}.`,
    `Host DJ Soul: <host-soul>${host.soul}</host-soul>`,
    host.musicLean ? `Host Musical Leanings: <host-leanings>${host.musicLean}</host-leanings>` : 'Host Musical Leanings: (not specified)',
    `Local slot: ${showTime(input)}.`,
    input.template === 'deep-discovery'
      ? `Pacing guide: this ${Math.round((input.occurrence.endsAt - input.occurrence.startsAt) / 60_000)}-minute slot would typically need roughly ${Math.ceil((input.occurrence.endsAt - input.occurrence.startsAt) / 240_000)} different records at four minutes per record. This is an editorial estimate, not an operator minimum or a coverage guarantee. Select a palette with plausible repertoire for that duration; a handful of tiny tags is insufficient. Avoid adding era, mood or energy restrictions without a clear reason in the brief.`
      : null,
    input.planningPrompt ? `Operator music direction:\n<operator-direction>${input.planningPrompt}</operator-direction>` : null,
    `Available moods: ${moodNames.join(', ')}`,
    existingSettingsPrompt,
    `${input.template === 'deep-discovery' ? 'Deep Discovery genre candidates with unique indexed matching-track counts, including finer genre tags' : 'Available library genres with indexed track counts'} (choose only from this list): ${genreChoices.length
      ? genreChoices.map(g => `${g.name} (${g.tracks})`).join('; ')
      : '(library coverage unavailable; leave genres empty)'}`,
    input.template === 'deep-discovery'
      ? 'These candidates come from a scan of the entire indexed catalogue: the smallest genres with plausible raw repertoire for this slot, ordered by ascending count. If none can individually support the estimate, the largest available genres are offered so they can be combined. Counts describe catalogue coverage, not airplay or popularity. They overlap across tags and cannot be summed as a unique-track total. Keep the choices musically related to the host and brief; avoid extra era, mood or energy constraints that undermine discovery.'
      : 'Use genre counts as coverage context, not as creative recommendations or exact counts for the final filters.',
    `Library size: ${libraryStats?.mirrorTotal ?? 'unknown'} indexed tracks.`,
    libraryStats?.updatedAt ? `Library tags last updated: ${libraryStats.updatedAt}.` : null,
    input.minimumCoverage != null ? `The operator requires at least ${input.minimumCoverage} unique eligible tracks after all show filters and exclusions.` : null,
    input.coverageCorrection || null,
    `Operator-owned controls remain fixed: playlist anchors, excluded playlists, track limits, programme settings, voices and skills. These are not part of the generated output.`,
    `Choose moods, genres, era windows and energy settings that follow from the brief. ${templateMusicDirection} Use strict filters only when the concept needs them and available coverage can support them. Leave fields empty when they would weaken the idea or make the pool too narrow.`,
    `Do not invent facts about songs, artists, listeners, prior airplay or the host’s personal history. Do not claim strict filters improve quality or guarantee coverage. For DJ’s Choice, briefly identify the familiar anchor genres and explain the connection of the stretch genres to supplied host details or the brief. Return exactly: moods, genres, eras, energies, filtersStrict and rationale.`,
    'Format reminder: use eras: [] for any era; never emit a window with both years null. Keep rationale under 500 characters, in one or two short sentences.',
  ].filter(Boolean).join('\n\n');
  let musicSettings: z.infer<typeof planSchema>;
  try {
    musicSettings = await djObject({
      system: 'You are a music editor. The show name and editorial brief are final. Choose only settings that express that brief. Use only the supplied moods and library genres, and preserve the operator’s fixed controls.',
      prompt: settingsPrompt,
      schema: planSchema,
      temperature: input.template === 'deep-discovery' ? 0.3 : 0.55,
      kind: 'generateShowPlan.musicSettings',
      telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template, pass: generationPass },
    }) as z.infer<typeof planSchema>;
  } catch (error) {
    // The small local model sometimes returns singleton year arrays, all-open
    // eras or a long explanation even after SDK recovery. Repair only these
    // representations, then reapply every genre, mood and range constraint.
    try {
      if (!error || typeof error !== 'object' || !('text' in error) || typeof error.text !== 'string') throw error;
      musicSettings = planSchema.parse(normalizeGeneratedMusicSettings(JSON.parse(error.text)));
    } catch { throw error; }
  }
  const plan: GeneratedShowPlan = { ...concept, name: conceptName, ...musicSettings };
  return {
    ...plan,
    genres: [...new Set(plan.genres.map(genre => genreByKey.get(normGenre(genre))!).filter(Boolean))],
    moods: [...new Set(plan.moods)],
    energies: [...new Set(plan.energies)],
    eras: mergeEraWindows(plan.eras),
  };
}
