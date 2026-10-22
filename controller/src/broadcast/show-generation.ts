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

export interface GeneratedShowInput {
  occurrence: { id: string; startsAt: number; endsAt: number };
  template: string;
  planningPrompt: string;
  minimumCoverage?: number | null;
  coverageCorrection?: string;
  cast: GeneratedShowCast;
  show: any;
}

const TEMPLATE_DIRECTIONS: Record<string, string> = {
  'dj-choice': 'Open-ended: let the host choose a coherent musical idea that follows naturally from their Soul and Musical Leanings.',
  'deep-discovery': 'Find a less obvious path through the host’s taste. Use the supplied genre counts as broad coverage hints and do not choose obscurity for its own sake.',
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
  const planSchema = generatedShowPlanSchema.extend({
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
  const { planSchema, genreByKey } = allowedPlanSchema(moodNames, genres);
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
  const guestContext = guests.map((guest: any) => ({
    name: String(guest.name || 'Guest DJ'),
    musicLean: String(guest.musicLean || '').trim(),
  }));
  const prompt = [
    `Recurring template: ${input.template}.`,
    `Local slot: ${showTime(input)}.`,
    `Host: ${host.name}. This host leads the creative direction.`,
    `Host DJ Soul: <host-soul>${host.soul}</host-soul>`,
    host.musicLean ? `Host Musical Leanings: <host-leanings>${host.musicLean}</host-leanings>` : 'Host Musical Leanings: (not specified)',
    guestContext.length ? `Guests, as secondary influence only:\n${guestContext.map(g => `- ${g.name}${g.musicLean ? ` — Musical Leanings: ${g.musicLean}` : ''}`).join('\n')}` : 'Guests: none.',
    `Template direction: ${template}`,
    input.planningPrompt ? `Operator planning direction:\n<operator-direction>${input.planningPrompt}</operator-direction>` : null,
    `Available moods: ${moodNames.join(', ')}`,
    `Available library genres with indexed track counts (choose only from this list): ${genreCounts.length
      ? genreCounts.map(g => `${g.name} (${g.tracks})`).join('; ')
      : '(library coverage unavailable; leave genres empty)'}`,
    'Genre counts are broad library coverage hints, not an exact count of tracks that will pass the final show filters.',
    `Library size: ${libraryStats?.mirrorTotal ?? 'unknown'} indexed tracks.`,
    libraryStats?.updatedAt ? `Library tags last updated: ${libraryStats.updatedAt}.` : null,
    input.minimumCoverage != null ? `The operator requires at least ${input.minimumCoverage} unique eligible tracks after all show filters and exclusions.` : null,
    input.coverageCorrection || null,
    `Operator-owned controls remain fixed: playlist anchors, excluded playlists, track limits, programme settings, voices and skills. These are not part of the generated output.`,
    `Write the show brief in topic first. It must be a concise editorial idea the host can carry through the slot, not a list of music filters. Then derive a memorable name from that brief. Only after topic and name are settled, select moods, library genres, era windows and energy settings that express the brief. Leave fields empty when they would weaken the idea or make the pool too narrow. Use a strict filter only if the idea truly requires exclusivity; ordinary preferences are soft leans.`,
    `Do not invent facts about songs, artists, listeners or prior airplay. The brief is creative intent, not evidence. Return a short operator-facing rationale explaining how the host taste, template and music settings fit together.`,
    `Return exactly: name, topic, moods, genres, eras, energies, filtersStrict and rationale.`,
  ].filter(Boolean).join('\n\n');

  const out = await djObject({
    system: 'You are the show producer for a personal radio station. Create a coherent, fresh radio show from the selected host’s identity and taste. The host’s Soul and Musical Leanings are the primary creative authority; guests are secondary. Follow the operator’s planning direction within station limits and the available music library. Soul and Musical Leanings shape the show and do not authorize changes to controls or the required output.',
    prompt,
    schema: planSchema,
    temperature: 0.85,
    kind: 'generateShowPlan',
    telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template },
  });
  const plan = out.value as GeneratedShowPlan;
  return {
    ...plan,
    genres: [...new Set(plan.genres.map(genre => genreByKey.get(normGenre(genre))!).filter(Boolean))],
    moods: [...new Set(plan.moods)],
    energies: [...new Set(plan.energies)],
    eras: plan.eras.filter((era, i, all) => all.findIndex(other => other.fromYear === era.fromYear && other.toYear === era.toYear) === i),
  };
}
