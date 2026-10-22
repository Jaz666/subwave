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
  'dj-choice': 'Open-ended discovery: invent a host-specific show idea that differs from their existing programmes. The host’s Soul supplies the point of view; Musical Leanings are inspiration, not a genre default.',
  'deep-discovery': 'Find a less obvious path through the host’s taste and current shows. The music-settings step will check the catalogue for coverage; do not choose obscurity for its own sake.',
  'forgotten-favourites': 'Give the show a warm return-to-the-collection feeling. No track-level play-history evidence is supplied, so do not claim that a song was popular, loved, forgotten, or previously played.',
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
  const planSchema = generatedShowPlanSchema.omit({ name: true, topic: true }).extend({
    moods: z.array(z.string().refine(value => moodSet.has(value), `must be one of: ${moods.join(', ')}`)).max(15)
      .describe(`music moods, chosen only from: ${moods.join(', ')}`),
    genres: z.array(z.string().refine(value => genreByKey.has(normGenre(value)), `must be a genre tag in the supplied library list`)).max(15)
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
  const genres = genreCounts.map(row => row.name);
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
    `- ${show.name}: ${JSON.stringify({ moods: show.moods, genres: show.genres, eras: show.eras, energies: show.energies, filtersStrict: show.filtersStrict })}`,
  ).join('\n');
  const existingShowBriefs = existingShows.map(show =>
    `- ${show.name}: ${JSON.stringify({ topic: show.topic, moods: show.moods, genres: show.genres, eras: show.eras, energies: show.energies })}`,
  ).join('\n');
  const guestContext = guests.map((guest: any) => ({
    name: String(guest.name || 'Guest DJ'),
    musicLean: String(guest.musicLean || '').trim(),
  }));
  const conceptPrompt = [
    `Recurring template: ${input.template}.`,
    `Primary objective: solve the operator's blank page with a specific show concept that listeners will not mistake for this host's existing programmes.`,
    `Local slot: ${showTime(input)}.`,
    `Host: ${host.name}. This host leads the creative direction.`,
    `Host DJ Soul: <host-soul>${host.soul}</host-soul>`,
    host.musicLean ? `Host Musical Leanings: <host-leanings>${host.musicLean}</host-leanings>` : 'Host Musical Leanings: (not specified)',
    existingShows.length
      ? `Other current weekly shows led by this host (already offered to listeners; use titles and settings only as contrast, not as creative templates):\n<existing-shows>${existingShowContext}</existing-shows>`
      : 'No other current weekly shows for this host are available as contrast references.',
    guestContext.length ? `Guests, as secondary influence only:\n${guestContext.map(g => `- ${g.name}${g.musicLean ? ` — Musical Leanings: ${g.musicLean}` : ''}`).join('\n')}` : 'Guests: none.',
    `Template direction: ${template}`,
    input.planningPrompt ? `Operator planning direction:\n<operator-direction>${input.planningPrompt}</operator-direction>` : null,
    `Use the host's Soul for point of view and personality; Musical Leanings are inspiration, not a genre format or limit. Mine a distinctive detail from the Soul and make a fresh editorial angle from it, rather than defaulting to the genres in the existing-show settings. A different title, adjacent subgenre, or "same show but deeper/rarer" is not enough.`,
    `The brief must state a concrete editorial question and a recurring way the host will answer it: a selection rule, listening challenge, comparison, or other clear format. A broad subject such as a genre, instrument, vocal style or historical period is not enough. A generic "journey through [genre]", "lesser-known side of [genre]" or "deep dive into [genre]" is not a show idea by itself. Use a distinctive host trait that is absent from the current show briefs, so the concept could not be assigned unchanged to another DJ. Consider several genuinely different concepts and choose the most distinctive.`,
    `First write the show brief as an editorial concept the host can carry through the slot, not as a music-filter list. Then derive a memorable name from that brief.`,
    `Do not invent facts about songs, artists, listeners or prior airplay. This is a creative brief, not evidence. Return exactly: name and topic.`,
  ].filter(Boolean).join('\n\n');
  const { planSchema, genreByKey } = allowedPlanSchema(moodNames, genres);
  const concept = await djObject({
    system: 'You are a creative show ideator for a personal radio station. Your job is to give the operator one distinctive, discovery-led premise—not a familiar genre show with a new name. The host’s Soul supplies the point of view; Musical Leanings are inspiration, not a genre default or limit. Existing scheduled shows are offers to avoid repeating. Guests are secondary. Follow the operator’s planning direction within station limits.',
    prompt: conceptPrompt,
    schema: showConceptSchema,
    temperature: 0.9,
    kind: 'generateShowPlan',
    telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template },
  }) as z.infer<typeof showConceptSchema>;
  const reviewedConcept = await djObject({
    system: 'You are an independent commissioning editor for a personal radio station. Your job is to invent a more distinctive alternative to the draft, rooted in the host’s personality and suited to the collection. Never simply approve or rename the draft.',
    prompt: [
      `Draft to replace (do not reuse its central subject, hook, or wording): ${concept.name} — "${concept.topic}"`,
      `Host DJ Soul: <host-soul>${host.soul}</host-soul>`,
      host.musicLean ? `Host Musical Leanings: <host-leanings>${host.musicLean}</host-leanings>` : 'Host Musical Leanings: (not specified)',
      existingShows.length
        ? `The host's current weekly shows:\n<existing-show-briefs>${existingShowBriefs}</existing-show-briefs>`
        : 'The host has no other current weekly shows to compare against.',
      `Use the current show briefs as hard exclusions, judging their meaning rather than their wording: a history of a genre still overlaps a regular show about that genre. Do not build a new show around any subject or musical detail already named there, or around a small variation of one. The regular music settings show which part of the collection is already served; when they cluster in one genre family, move the new premise towards a different family if the host's Soul allows. Musical Leanings are not a boundary. Find an unused trait, contradiction, exception or point of view in the host's Soul, then invent a new episode-long question and concrete selection rule around it. The result must give listeners a different reason to tune in and lead to a different part of the collection. A broad subject area alone is not a show idea. Keep it concise, concrete, and specific to this host. Do not invent facts about songs, artists, listeners or prior airplay. Do not include prompt delimiters in the output. Return exactly: name and topic.`,
    ].join('\n\n'),
    schema: showConceptSchema,
    temperature: 0.9,
    kind: 'generateShowPlan',
    telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template },
  }) as z.infer<typeof showConceptSchema>;
  const settingsPrompt = [
    `The final show idea has been reviewed. Choose settings that follow from it without changing its premise.`,
    `Show name: ${reviewedConcept.name}`,
    `Show brief: <show-brief>${reviewedConcept.topic}</show-brief>`,
    input.planningPrompt ? `Operator music direction:\n<operator-direction>${input.planningPrompt}</operator-direction>` : null,
    `Available moods: ${moodNames.join(', ')}`,
    existingShows.length
      ? `Music settings already used by this host's current shows:\n<existing-show-settings>${existingShowContext}</existing-show-settings>. Treat these as contrast, not as the new palette. Choose settings that lead to a different part of the collection where the brief allows. A broad umbrella genre is not new if it covers an existing subgenre (for example, generic Rock still overlaps with Hard Rock or Alternative Rock). When at least two suitable library genres exist outside this cluster, use at least two of them and keep the existing cluster as a bridge only when the brief calls for it.`
      : null,
    `Available library genres with indexed track counts (choose only from this list): ${genreCounts.length
      ? genreCounts.map(g => `${g.name} (${g.tracks})`).join('; ')
      : '(library coverage unavailable; leave genres empty)'}`,
    'Use genre counts only to check that an idea has library coverage; their order and size are not creative recommendations or exact counts for the final filters.',
    `Library size: ${libraryStats?.mirrorTotal ?? 'unknown'} indexed tracks.`,
    libraryStats?.updatedAt ? `Library tags last updated: ${libraryStats.updatedAt}.` : null,
    input.minimumCoverage != null ? `The operator requires at least ${input.minimumCoverage} unique eligible tracks after all show filters and exclusions.` : null,
    input.coverageCorrection || null,
    `Operator-owned controls remain fixed: playlist anchors, excluded playlists, track limits, programme settings, voices and skills. These are not part of the generated output.`,
    `After reviewing the premise, choose moods, genres, era windows and energy settings that follow from it. Treat library genre counts as coverage information, not creative suggestions. Prefer settings that open a different part of the collection when they fit the idea, but do not force unrelated genres or tags just to avoid overlap. Use strict filters only when the concept needs them and available coverage can support them. Leave fields empty when they would weaken the idea or make the pool too narrow.`,
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
  const plan: GeneratedShowPlan = { ...reviewedConcept, ...musicSettings };
  return {
    ...plan,
    genres: [...new Set(plan.genres.map(genre => genreByKey.get(normGenre(genre))!).filter(Boolean))],
    moods: [...new Set(plan.moods)],
    energies: [...new Set(plan.energies)],
    eras: plan.eras.filter((era, i, all) => all.findIndex(other => other.fromYear === era.fromYear && other.toYear === era.toYear) === i),
  };
}
