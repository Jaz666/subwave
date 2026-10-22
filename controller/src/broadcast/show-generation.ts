import { createHash } from 'node:crypto';
import { z } from 'zod';
import * as settings from '../settings.js';
import * as library from '../music/library.js';
import { normGenre } from '../music/genre-fold.js';
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
  minimumCoverage?: number | null;
  coverageCorrection?: string;
  cast: GeneratedShowCast;
  show: any;
  existingShows?: ExistingScheduledShow[];
}

const TEMPLATE_DIRECTIONS: Record<string, string> = {
  'dj-choice': 'Catch-all discovery: let the host’s Soul and optional Musical Leanings define a broad, recognizable genre palette. Include a few familiar genres from the host’s existing shows, then reach into related genres they play less often. Vary the editorial angle without banning familiar topics or genres.',
  'deep-discovery': 'Use the host’s Soul and optional Musical Leanings to shape the show idea. Then favor less-represented genres from the library when choosing music settings, while keeping the brief coherent and playable.',
  'forgotten-favourites': 'Deferred direction. No track-level play-history evidence is supplied, so do not claim that a song was popular, loved, forgotten, or previously played.',
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
  const hostIds = config.hostMode === 'random'
    ? config.eligibleHostPersonaIds.filter((id: string) => eligible.has(id))
    : [show.personaId].filter((id: string) => eligible.has(id));
  if (!hostIds.length) return null;
  const hostPersonaId = hostIds[stableIndex(occurrence.id, hostIds.length)]!;
  const guestIds: string[] = config.guestMode === 'none'
    ? []
    : config.guestMode === 'fixed'
      ? (show.guestPersonaIds ?? []).filter((id: string) => id !== hostPersonaId && eligible.has(id))
      : stableOrder<string>(config.eligibleGuestPersonaIds.filter((id: string) => id !== hostPersonaId && eligible.has(id)), occurrence.id)
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
      .describe(`genre tags copied exactly from the supplied library list: ${genres.join(', ')}`),
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

export async function generateShowPlan(input: GeneratedShowInput): Promise<GeneratedShowPlan> {
  let libraryStats: ReturnType<typeof library.stats> | null = null;
  try {
    await library.load();
    libraryStats = library.stats();
  } catch { /* A show can still be planned without local coverage data. */ }
  const personas = settings.get().personas ?? [];
  const moodNames = settings.moodVocab();
  const byGenre = libraryStats?.byGenre as Record<string, number> | undefined;
  const genreCounts = Object.entries(byGenre ?? {})
    .filter(([name, count]) => name && count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([name, count]) => ({ name, tracks: count }));
  const lessRepresentedGenres = genreCounts.slice(Math.floor(genreCounts.length * 0.75));
  const useDeepDiscoveryShortlist = input.template === 'deep-discovery'
    && lessRepresentedGenres.length > 0 && !input.coverageCorrection;
  const genreChoices = useDeepDiscoveryShortlist
    ? lessRepresentedGenres
    : genreCounts;
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
      ? 'For DJ’s Choice, vary the editorial angle while keeping familiar topics or genres available where they fit.'
      : null,
    `When the host’s obvious genre or musical interests are already covered by regular shows, mine the less-used personality details, relationships, habits or point of view in their Soul for a different hook. Keep the concept and genre palette separate: the premise should vary, while familiar genres can still be included later.`,
    `Stock ideas such as “hidden gems,” “forgotten favourites,” or “stories behind the albums” are not fresh by themselves; avoid them when the existing shows already cover that territory.`,
    input.template === 'deep-discovery'
      ? 'For Deep Discovery, keep the concept rooted in the host’s taste and open to finding less-represented library genres in the music-settings step. Do not make the brief a list of genres.'
      : null,
    `Write a concise, concrete brief that gives the show a clear reason to exist and could inspire a real episode. A different genre list alone does not make the premise fresh. Avoid generic genre journeys and do not invent facts about songs, artists, listeners or prior airplay. Write the brief first, then derive a memorable episode name from it; never use the recurring template name as the episode title. Return exactly: name and topic.`,
  ].filter(Boolean).join('\n\n');
  const { planSchema, genreByKey } = allowedPlanSchema(moodNames, choiceGenres);
  const concept = await djObject({
    system: 'You are a creative show ideator for a personal radio station. Use the selected host’s DJ Soul and optional Musical Leanings to create a specific show idea, brief it first, then name it. Make the central promise and recurring format meaningfully different from the host’s current shows; their genres can still be used in the music palette. If regular shows already cover the host’s obvious genre interests, mine less-used personality details, relationships, habits or points of view in the Soul for another hook. Avoid stock ideas such as “hidden gems,” “forgotten favourites,” or album stories when those overlap the current shows. Never use the recurring template name as the episode title. Give the operator a useful starting point rather than a generic genre show. Guests are secondary. Follow the operator’s planning direction within station limits.',
    prompt: conceptPrompt,
    schema: showConceptSchema,
    temperature: 0.9,
    kind: 'generateShowPlan',
    telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template },
  }) as z.infer<typeof showConceptSchema>;
  const existingSettingsPrompt = existingShows.length
    ? input.template === 'deep-discovery'
      ? `Music settings already used by this host's current shows:\n<existing-show-settings>${existingShowSettings}</existing-show-settings>. Use these to understand the host's taste, then prioritize the less-represented candidates that fit the brief.`
      : input.template === 'dj-choice'
        ? `Music settings already used by this host's current shows:\n<existing-show-settings>${existingShowSettings}</existing-show-settings>. These show which genres make the host recognizable; use a few that fit the brief, then broaden into related genres from the library list.`
        : `Music settings already used by this host's current shows:\n<existing-show-settings>${existingShowSettings}</existing-show-settings>. Use these as context when choosing suitable settings for the brief.`
    : null;
  const templateMusicDirection = input.template === 'deep-discovery'
    ? 'For Deep Discovery, actively favor suitable lower-count genres from the provided candidates. Connect each choice to the host’s taste and brief; do not pick genres only because their counts are low.'
    : input.template === 'dj-choice'
      ? 'For DJ’s Choice, build a broad palette of host-related genres: include a few familiar genres from their existing shows, then add related genres that reach beyond their usual palette. Use as many suitable genres as help the show, up to the 15-genre limit. Each choice should have a clear connection to the host’s Soul, Musical Leanings or an adjacent musical style.'
      : 'Choose suitable settings that follow from the brief and available library coverage.';
  const settingsPrompt = [
    `The show idea is final. Choose settings that follow from it without changing its premise.`,
    `Show name: ${concept.name}`,
    `Show brief: <show-brief>${concept.topic}</show-brief>`,
    input.planningPrompt ? `Operator music direction:\n<operator-direction>${input.planningPrompt}</operator-direction>` : null,
    `Available moods: ${moodNames.join(', ')}`,
    existingSettingsPrompt,
    `${input.template === 'deep-discovery' ? 'Deep Discovery genre candidates' : 'Available library genres'} with indexed track counts (choose only from this list): ${genreChoices.length
      ? genreChoices.map(g => `${g.name} (${g.tracks})`).join('; ')
      : '(library coverage unavailable; leave genres empty)'}`,
    useDeepDiscoveryShortlist
      ? 'These candidates are the lower-count quarter of the bounded library genre list. Deep Discovery should choose one or more that make sense for the host and brief. Connect them with the host’s Soul or Musical Leanings; do not choose a genre only because its count is low.'
      : input.template === 'deep-discovery' && input.coverageCorrection
        ? 'The lower-count candidates did not meet required playable coverage. Choose from this broader library list and preserve the Deep Discovery intent where possible.'
        : input.template === 'deep-discovery'
          ? 'No library genre shortlist is available; leave genres empty.'
      : 'Use genre counts as coverage context, not as creative recommendations or exact counts for the final filters.',
    `Library size: ${libraryStats?.mirrorTotal ?? 'unknown'} indexed tracks.`,
    libraryStats?.updatedAt ? `Library tags last updated: ${libraryStats.updatedAt}.` : null,
    input.minimumCoverage != null ? `The operator requires at least ${input.minimumCoverage} unique eligible tracks after all show filters and exclusions.` : null,
    input.coverageCorrection || null,
    `Operator-owned controls remain fixed: playlist anchors, excluded playlists, track limits, programme settings, voices and skills. These are not part of the generated output.`,
    `Choose moods, genres, era windows and energy settings that follow from the brief. ${templateMusicDirection} Use strict filters only when the concept needs them and available coverage can support them. Leave fields empty when they would weaken the idea or make the pool too narrow.`,
    `Do not invent facts about songs, artists, listeners or prior airplay. Do not claim strict filters improve quality or guarantee coverage. Return a short operator-facing rationale explaining how the music settings follow from the brief. Return exactly: moods, genres, eras, energies, filtersStrict and rationale.`,
  ].filter(Boolean).join('\n\n');
  const musicSettings = await djObject({
    system: 'You are a music editor. The show name and editorial brief are final. Choose only settings that express that brief. Use only the supplied moods and library genres, and preserve the operator’s fixed controls.',
    prompt: settingsPrompt,
    schema: planSchema,
    temperature: 0.55,
    kind: 'generateShowPlan',
    telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template },
  }) as z.infer<typeof planSchema>;
  const plan: GeneratedShowPlan = { ...concept, ...musicSettings };
  return {
    ...plan,
    genres: [...new Set(plan.genres.map(genre => genreByKey.get(normGenre(genre))!).filter(Boolean))],
    moods: [...new Set(plan.moods)],
    energies: [...new Set(plan.energies)],
    eras: plan.eras.filter((era, i, all) => all.findIndex(other => other.fromYear === era.fromYear && other.toYear === era.toYear) === i),
  };
}
