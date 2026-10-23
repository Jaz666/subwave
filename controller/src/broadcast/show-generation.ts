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
      .describe('genre tags copied exactly from the indexed library vocabulary in this schema; shortlist recommendations are not an exhaustive whitelist'),
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
  // The bounded shortlist recommends discovery directions; the full catalogue
  // defines valid output tags, including familiar anchors promised by a brief.
  const libraryGenres = Object.entries(byGenre ?? {}).filter(([name, count]) => name && count > 0).map(([name]) => name);
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
  const existingShowSettings = existingShows.map(show =>
    `- ${show.name}: ${JSON.stringify({ moods: show.moods, genres: show.genres, eras: show.eras, energies: show.energies, filtersStrict: show.filtersStrict })}`,
  ).join('\n');
  const guestContext = guests.map((guest: any) => ({
    name: String(guest.name || 'Guest DJ'),
    soul: String(guest.soul || ''),
    musicLean: String(guest.musicLean || '').trim(),
  }));
  const genreContext = genreChoices.length
    ? genreChoices.map(g => `${g.name} (${g.tracks})`).join('; ')
    : '(library coverage unavailable; do not promise specific genres)';
  const conceptPrompt = [
    `Recurring template: ${input.template}. Direction: ${template}`,
    `Local slot: ${showTime(input)}.`,
    `Host: ${host.name}. The host leads; guests are secondary.`,
    `Host Soul: <host-soul>${host.soul}</host-soul>`,
    host.musicLean ? `Optional Musical Leanings: <host-leanings>${host.musicLean}</host-leanings>` : 'Musical Leanings: absent; use musical preferences in the Soul.',
    guestContext.length ? `Guest identities: ${JSON.stringify(guestContext)}` : 'Guests: none.',
    existingShows.length
      ? `Familiar repertoire, from current shows’ filters only:\n${existingShowSettings}`
      : 'No current-show repertoire context is available.',
    `Recommended genre candidates and indexed matching-track counts: ${genreContext}`,
    input.planningPrompt ? `Operator direction: <operator-direction>${input.planningPrompt}</operator-direction>` : null,
    'Create one specific musical listening idea rooted in preferences stated in the Soul and optional Musical Leanings. A calm voice, humour, nostalgic banter or guest chemistry describes presentation, not musical restrictions. Existing show names are labels; their filters indicate familiar repertoire, not the limits of the DJ’s taste.',
    input.template === 'deep-discovery'
      ? 'Build the idea around a coherent neighbourhood of the smaller supplied genres that fits this DJ. Do not merely repeat the Soul’s list of interests. Rarity alone does not connect unrelated genres. Avoid promises of iconic hits, neglected airplay or forgotten favourites: no play-history evidence is supplied.'
      : 'Keep some familiar musical anchors and explore related wider-reaching styles. Give the episode a concrete angle rather than a generic journey through a genre.',
    'Write a short episode brief, then derive its name. You may explicitly promise a few genres, but prefer the recommended candidates and name only styles you intend the music-settings pass to include. Do not list every genre the DJ likes. A named genre is a musical commitment; speech and interaction instructions are presentation. Do not promise an opening artist, particular track, fixed playlist or documented artistic influence: this planner neither selects tracks nor supplies music research. A favourite artist may inform taste without becoming a playback promise.',
    'Do not invent personal history, hometowns, venues, relationships, musical facts or previous airplay. Avoid stock hidden-gem and genre-journey copy, dates in the prose, and unsupported claims of influence. Do not impose an era or energy level from personality or favourite decades; keep the musical idea open unless operator direction requires a restriction.',
    `Return exactly ${input.nameMode === 'custom' ? 'topic; the operator supplied the title' : 'name and topic; name the musical idea after writing the brief, never use the recurring template name'}.`,
  ].filter(Boolean).join('\n\n');
  const { planSchema, genreByKey } = allowedPlanSchema(moodNames, libraryGenres);
  const usesCustomName = input.nameMode === 'custom';
  const conceptSchema = usesCustomName
    ? generatedShowPlanSchema.pick({ topic: true })
    : showConceptSchema;
  const concept = await djObject({
    system: 'You create host-led radio show ideas grounded in the DJ’s Soul and optional Musical Leanings. Write the brief before its name. Explicit genre promises must be playable through the supplied genre filters. Separate musical commitments from presentation, and never promise tracks or artists this planner cannot schedule. Follow operator direction within station limits.',
    prompt: conceptPrompt,
    schema: conceptSchema,
    temperature: 0.9,
    kind: 'generateShowPlan.concept',
    telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template, pass: generationPass },
  }) as z.infer<typeof showConceptSchema> | z.infer<typeof conceptSchema>;
  const conceptName = usesCustomName ? String(input.customName || '').trim()
    : 'name' in concept ? concept.name : '';
  const templateMusicDirection = input.template === 'deep-discovery'
    ? 'After covering the brief’s promised styles, favour smaller related genres for discovery. Usually 3–6 genres is enough, but this is not a quota. Never trade a promised musical style for a rarer unrelated one.'
    : 'After covering the brief’s promised styles, retain a few familiar anchors and add related stretch genres. Usually 4–8 genres is enough; the 15-genre limit is a ceiling, not a target.';
  const settingsPrompt = [
    'TASK: translate the already-written episode brief into music filters. The creative planning step is finished. Do not invent a second show based on the host’s general interests.',
    `EPISODE: ${conceptName}\n<show-brief>${concept.topic}</show-brief>`,
    input.planningPrompt ? `OPERATOR REQUIREMENTS: <operator-direction>${input.planningPrompt}</operator-direction>` : null,
    `RECOMMENDED GENRE SHORTLIST (counts are indexed matching tracks): ${genreContext}`,
    'The shortlist is editorial guidance, not the full allowed vocabulary. The output schema lists valid genres from the entire indexed catalogue. Use exact catalogue tags. Deep Discovery should centre on smaller related styles from the shortlist, but may retain a broader catalogue tag to fulfil an explicit brief promise; explain that choice rather than silently substituting unrelated rare genres.',
    `AVAILABLE MOODS: ${moodNames.join(', ')}`,
    'GENRES — apply these rules in order:',
    '1. Read only the episode brief to identify its promised musical styles. If a promised genre appears in the output schema’s allowed genre values, copy it into genres. Do this before considering rarity, counts, typical palette size or other music the host likes.',
    '2. For a broader promised style without an exact tag, choose only a catalogue subgenre that actually belongs to that style. Similar words, a shared mood, “experimental”, “melodic”, or “the host is eclectic” do not establish that relationship.',
    '3. Cover the remaining promises the same way. Then add a related genre only if it helps the same listening idea. If the brief names no genres, use the Soul and optional Musical Leanings to interpret its musical idea.',
    '4. Do not silently substitute an unrelated genre for a missing style. If the indexed catalogue cannot represent a promise, state that gap honestly in rationale and choose the supported portion of the idea. Never claim that an unrelated genre fulfils it.',
    'Example: if the brief promises Glitch and Shoegaze and both tags are available, include both. Post-Bop is not a substitute for Post-Punk because both names start with “Post”. Psychedelic Folk does not represent Shoegaze just because both might sound atmospheric.',
    `TEMPLATE: ${templateMusicDirection}`,
    `HOST CONTEXT, only to interpret the idea or choose related additions: ${host.name}. <host-soul>${host.soul}</host-soul>`,
    host.musicLean ? `Optional Musical Leanings: <host-leanings>${host.musicLean}</host-leanings>` : 'Musical Leanings is absent; musical preferences may be stated in the Soul.',
    existingShows.length ? `Familiar repertoire, not restrictions or an alternative brief:\n${existingShowSettings}` : null,
    'MOOD / ERA / ENERGY: start with moods: [], eras: [], energies: [], filtersStrict: false. Keep them unless the operator or the brief explicitly requires a musical property and coverage supports it. Calm conversation is not calm music. Night-time scheduling is not a “night” mood requirement. Favourite decades and nostalgic banter do not require an era window. A rhythm-focused show does not automatically require high energy. Soft filters deliberately leave room for exploration.',
    `SLOT: ${showTime(input)}. Rough pacing estimate: ${Math.ceil((input.occurrence.endsAt - input.occurrence.startsAt) / 240_000)} four-minute records, not a hard minimum. Library: ${libraryStats?.mirrorTotal ?? 'unknown'} indexed tracks. Genre counts overlap and cover all years, moods and energies; they do not prove coverage after adding restrictions.`,
    input.minimumCoverage != null ? `OPERATOR MINIMUM: ${input.minimumCoverage} unique eligible tracks after all show filters and exclusions.` : null,
    input.coverageCorrection || null,
    'FINAL CHECK: compare each musical promise in the brief with your genres. Correct omissions before answering. Explain actual promise-to-tag mappings in rationale; if a promise is unsupported, name it. Do not repeat the brief or claim “these genres fulfil the promise” without a specific mapping. Do not invent genre relationships, artist influence, personal history or airplay.',
    'Return exactly moods, genres, eras, energies, filtersStrict and rationale. Rationale: at most 500 characters. Any era: eras: [], never an all-null window. Preserve operator-owned playlists, exclusions, track limits, programme settings, voices and skills; they are not output fields.',
  ].filter(Boolean).join('\n\n');
  let musicSettings: z.infer<typeof planSchema>;
  try {
    musicSettings = await djObject({
      system: 'You translate an accepted radio episode brief into music settings; you do not plan a new show. Explicit operator requirements come first, then the brief’s musical promises. Copy exact promised catalogue genre tags when available; otherwise use only genuine catalogue subgenres. The recommended shortlist is not an exhaustive whitelist. Host taste and discovery preferences guide related additions after promises are covered. Never justify unrelated substitutions. Default mood, era and energy arrays to empty, and report unsupported promises honestly. Return only the requested JSON.',
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
