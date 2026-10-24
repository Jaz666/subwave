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

export function resolveGeneratedShowCast({ show, occurrence, personas, preserveFixedGuests = false }: {
  show: any;
  occurrence: { id: string };
  personas: readonly any[];
  preserveFixedGuests?: boolean;
}): GeneratedShowCast | null {
  const config = show.generation;
  if (!config || config.mode !== 'generated') return null;
  const subShows = settings.get().subShows;
  const commonGround = config.template === 'common-ground';
  const eligible = new Map<string, any>(personas.filter(p => p && typeof p.id === 'string'
    && (!commonGround || subShows?.eligibleHostPersonaIds == null || subShows.eligibleHostPersonaIds.includes(p.id)))
    .map(p => [p.id, p] as const));
  const hostIds = config.hostMode === 'random'
    ? (subShows?.eligibleHostPersonaIds ?? [...eligible.keys()]).filter((id: string) => eligible.has(id)
      && (!(preserveFixedGuests || commonGround) || config.guestMode !== 'fixed' || !(show.guestPersonaIds ?? []).includes(id)))
    : [show.personaId].filter((id: string) => eligible.has(id));
  if (!hostIds.length) return null;
  const hostPersonaId = hostIds[stableIndex(occurrence.id, hostIds.length)]!;
  const guestIds: string[] = config.guestMode === 'none'
    ? []
    : config.guestMode === 'fixed'
      ? (show.guestPersonaIds ?? []).filter((id: string) => id !== hostPersonaId && eligible.has(id))
      : stableOrder<string>(((commonGround ? subShows?.eligibleHostPersonaIds : subShows?.eligibleGuestPersonaIds) ?? [...eligible.keys()])
        .filter((id: string) => id !== hostPersonaId && eligible.has(id)), occurrence.id)
        .slice(0, commonGround ? 1 : config.guestCount.min + stableIndex(`${occurrence.id}:guest-count`, config.guestCount.max - config.guestCount.min + 1));
  if (commonGround && new Set(guestIds).size !== 1) return null;
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
  // Some local models copy the input's count annotations into the genre list.
  // Recover only that known wrapper; the schema still checks every name and
  // the exact accepted palette is verified below.
  if (Array.isArray(value.genres)) value.genres = value.genres.map(genre => {
    if (!genre || typeof genre !== 'object' || Array.isArray(genre)) return genre;
    const entry = genre as Record<string, unknown>;
    return typeof entry.name === 'string' && Object.keys(entry).every(key => key === 'name' || key === 'tracks')
      ? entry.name : genre;
  });
  if (typeof value.rationale === 'string') value.rationale = value.rationale.trim().slice(0, 500);
  if (Array.isArray(value.eras)) value.eras = value.eras.flatMap(era => {
    if (typeof era === 'string') {
      const range = /^(\d{4})\s*[-–—]\s*(\d{4})$/.exec(era.trim());
      // Exact closed ranges only; the schema still rejects reversed or
      // out-of-bounds years. Never guess decades or discard a restriction.
      if (range) return [{ fromYear: Number(range[1]), toYear: Number(range[2]) }];
    }
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
  const discovery = input.template === 'deep-discovery';
  const djChoice = input.template === 'dj-choice';
  const commonGround = input.template === 'common-ground';
  const strictGenres = discovery || djChoice || commonGround;
  const genreLimit = strictGenres ? 15 : 6;
  const requiredTracks = Math.max(input.minimumCoverage ?? 0, Math.ceil(2 * (input.occurrence.endsAt - input.occurrence.startsAt) / 240_000));
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
  const genreChoices = discovery
    ? [...new Map([
      ...showGenreChoices(byGenre ?? {}, input.template, repertoireEstimate).slice(0, 60),
      ...showGenreChoices(byGenre ?? {}, 'dj-choice').slice(0, 20),
    ].map(genre => [genre.name, genre])).values()]
    : showGenreChoices(byGenre ?? {}, input.template, repertoireEstimate);
  const hostPersona = personas.find((p: any) => p.id === input.cast.hostPersonaId);
  if (!hostPersona) throw new Error('The selected host is no longer available');
  const guests = input.cast.guestPersonaIds
    .map(id => personas.find((p: any) => p.id === id))
    .filter(Boolean);
  if (commonGround && (input.cast.guestPersonaIds.length !== 1 || guests.length !== 1 || guests[0]?.id === hostPersona.id)) {
    throw new Error('Common Ground requires a host and exactly one distinct guest');
  }
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
  const baseConceptSchema = generatedShowPlanSchema.pick({ name: true, topic: true }).extend({
    intendedGenres: choices.length
      ? z.array(z.enum(choices.map(g => g.name) as [string, ...string[]])).min(1).max(genreLimit)
      : z.array(z.never()).max(0),
  });
  // Put the pair-specific evidence before the brief in the concept output
  // contract so the model must identify a connection rather than just name two styles.
  const conceptSchema = commonGround ? z.object({
    musicalConnection: z.object({
      hostTaste: z.string().min(1).max(300).describe('a specific musical interest supported by the host Soul or Leanings, not presentation style'),
      guestTaste: z.string().min(1).max(300).describe('a specific musical interest supported by the guest Soul or Leanings, not presentation style'),
      sharedThread: z.string().min(1).max(300).describe('one concrete musical characteristic connecting these interests, without inventing a shared preference'),
    }),
    name: baseConceptSchema.shape.name,
    topic: baseConceptSchema.shape.topic.min(160).max(650)
      .describe('2–3 sentences: the musical connection, what each DJ brings to it, and an open musical question; reflect musicalConnection'),
    intendedGenres: baseConceptSchema.shape.intendedGenres,
  }) : baseConceptSchema;
  const identity = (p: any) => ({ name: p.name, soul: p.soul, ...(p.musicLean ? { musicalLeanings: p.musicLean } : {}) });
  const concept = await djObject({
    system: commonGround
      ? 'Plan one specific musical radio episode finding common ground between two DJs with equal musical influence. Write its short brief, derive its title, and declare the genre palette it promises. Return only the requested JSON.'
      : 'Plan one specific musical radio episode led by the host. Write its short brief, derive its title, and explicitly declare the small genre palette the brief promises. Return only the requested JSON.',
    prompt: commonGround ? [
      `Host (presentation lead only): ${JSON.stringify(identity(host))}`,
      `Guest (equal musical influence): ${JSON.stringify(identity(guests[0]))}`,
      `Supporting repertoire filters: ${JSON.stringify([{ dj: host.name, shows: existingShows }, { dj: guests[0]?.name, shows: scheduledShowsForHost(guests[0]!.id, input.show?.id) }])}`,
      `Local slot: ${showTime(input)}. Available genre names and indexed counts: ${choices.map(g => `${g.name}:${g.tracks}`).join('; ')}`,
      input.planningPrompt ? `Operator direction: ${input.planningPrompt}` : null,
      input.coverageCorrection || null,
      'Fill musicalConnection first with a specific supported taste for each DJ and the musical thread connecting them. Do not infer a preference for a different genre just because its name shares a word with a stated preference. Find ONE specific musical connection that this particular pair could explore together. First identify each DJ’s actual musical interests in their Soul and optional Musical Leanings, then find a shared musical characteristic or a defensible bridge between them. Persona preferences take precedence over supporting show filters. Presentation style, speaking pace and personality are not musical preferences. Where a taste is inferred rather than stated, frame the territory as an invitation to explore it, not an established shared love.',
      'Give both DJs equal musical influence. Choose music that can serve the connection throughout the show. Each selected genre must belong to that same connection and offer something to both DJs. Do not assemble one DJ’s favourites beside the other’s in separate genre groups. Replacing either DJ should change the idea. Do not chase rarity or claim the connection is surprising merely because the genres differ.',
      `Select the smallest coherent palette that expresses the connection, usually 2–5 styles. Use more, up to 15, only when adjacent styles are needed to reach ${requiredTracks} unique matching tracks (twice airtime at a four-minute average). Prefer informative styles over broad umbrella tags that would admit unrelated music. A large pool is fine when musically appropriate; do not narrow it arbitrarily. Counts overlap and are not proof of combined coverage. Copy intendedGenres exactly from the supplied names.`,
      'Write topic as a concise commissioning brief of 2–3 sentences, at most 80 words. State the concrete musical thread, why it offers something to EACH DJ, and one open musical question they can return to. Describe an idea for a show, without predicting dialogue, announcing the episode, narrating how they discover mutual understanding or promising specific artists, tracks or invented personal history. The brief must promise only the chosen genres.',
      input.nameMode === 'custom' ? `Use this exact title: ${input.customName}` : 'Derive a distinctive short show title from the musical thread. Do not use the template name, “Finding Common Ground”, presenter names or a list of genres as the title. Avoid generic discovery slogans.',
      'Keep the name and brief era-neutral. Favourite decades in persona notes or regular shows do not impose a date restriction. Only include a period when the operator explicitly requests that restriction. Return musicalConnection, name, topic and intendedGenres.',
    ].filter(Boolean).join('\n\n') : [
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
        ? `Build a coherent neighbourhood around underrepresented styles, expanding into adjacent genres to provide at least ${requiredTracks} unique matching tracks at a four-minute average: twice the slot airtime, to allow for playback exclusions. Use up to 15 genres as needed. Counts overlap; include enough breadth, not only tiny tags. Popular neighbours may support the rare core. Rarity alone does not connect genres; avoid a generic genre journey or repeating the Soul.`
        : djChoice
          ? `Make this recognisably the host’s usual musical territory, with occasional sideways steps. Build the main genre core from their regular show filters, interpreted through the Soul and optional Musical Leanings. Add only a few musically adjacent genres absent from those shows; guests may suggest connections without displacing the host’s familiar centre. If there are no regular shows, infer the familiar core from the Soul and optional Musical Leanings. Do not chase rarity or invent a restrictive theme that crowds out familiar favourites. Choose specific styles where supported rather than unexplained catch-all genres. Use up to 15 genres as needed, covering at least ${requiredTracks} unique matching tracks at a four-minute average, twice the slot airtime. A smaller number of adjacent genres does not guarantee an occasional playback proportion; do not promise a fixed running order or ratio.`
          : 'Include familiar anchors when available and related wider-reaching choices from the supplied palette.',
      'Include one concrete, recurring talking point in the brief: a musical question or contrast the DJ can return to naturally between tracks. Treat it as an optional conversational thread, not a scripted programme feature or a claim requiring invented artist history. The thread must fit the intended musical palette.',
      `Write a concise brief and name. Declare 1–${genreLimit} intendedGenres copied exactly from the available palette, never a catalogue dump. The brief must describe those same styles. Do not promise other genres, particular tracks or artists, a fixed playlist, release chronology or unsupported artistic influence. Do not invent personal history or airplay.`,
      'Keep the brief and title era-neutral by default. Do not promise decades or date ranges, including phrases such as “the 80s and beyond”, just because they appear in the Soul, Musical Leanings or regular shows. Only describe a bounded period when the operator explicitly requests it as a music restriction; the settings must then include matching era windows. Otherwise describe the musical connection without dates.',
      `Counts overlap; roughly ${estimate} four-minute records is a pacing estimate, not a hard minimum. Do not force era, mood or energy restrictions from favourite decades or presentation. Return name, topic and intendedGenres.`,
    ].filter(Boolean).join('\n\n'),
    schema: conceptSchema, temperature: 0.7,
    kind: 'generateShowPlan.concept',
    telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template, pass: generationPass },
  }) as z.infer<typeof conceptSchema>;
  const intended = [...new Set(concept.intendedGenres)];
  const settingsSchema = generatedShowPlanSchema.omit({ name: true, topic: true }).extend({
    moods: generatedShowPlanSchema.shape.moods.max(strictGenres ? 2 : 15),
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
      system: `Translate the accepted musical proposal into settings. Do not create another idea or choose another genre palette. Preserve every required genre exactly once. Default mood, era and energy lists to empty. Set filtersStrict to ${strictGenres ? 'true' : 'false'}.`,
      prompt: [
        `Accepted proposal: ${JSON.stringify({ name: concept.name, topic: concept.topic, requiredGenres: intended })}`,
        `Indexed counts (coverage context only): ${JSON.stringify(Object.fromEntries(intended.map(name => [name, counts[name]])))}`,
        'Return genres as an array of strings, for example ["Indie Rock", "Post-Punk"]. Copy the requiredGenres strings exactly. Never put name/tracks objects in genres.',
        `Duration: ${(input.occurrence.endsAt - input.occurrence.startsAt) / 60_000} minutes. Allowed moods: ${moods.join(', ')}.`,
        input.planningPrompt ? `Operator requirements: ${input.planningPrompt}` : null,
        input.minimumCoverage != null ? `Operator minimum: ${input.minimumCoverage} unique eligible tracks after all filters and exclusions.` : null,
        input.coverageCorrection || null,
        commonGround ? 'Return eras: [] unless the operator explicitly requested a date restriction. Do not infer years from genre associations, favourite decades or regular-show eras. A requested period uses numeric fromYear/toYear bounds; never invent dates.' : 'Era JSON shape: return eras: [] for unrestricted music. If a date restriction is required, use objects such as eras: [{"fromYear": 1980, "toYear": 1995}], with number or null bounds. Never return date strings such as eras: ["1980-1995"]. This example is formatting only, not an instruction to select those years.',
        'The title and brief must agree with the era settings. If the accepted proposal explicitly promises a decade or date range, encode that range in eras; do not leave eras empty. A favourite decade in persona context alone is not a restriction. An era-neutral proposal should keep eras empty unless the operator explicitly requires a period.',
        'Copy requiredGenres into genres exactly once each, with no additions, omissions or substitutions. Keep moods, eras and energies empty unless the operator or musical idea explicitly requires a restriction and coverage supports it. Conversation style and favourite decades are not music restrictions.',
        commonGround ? `Use strict genres and leave moods, eras and energies empty unless explicitly required. The palette should cover at least ${requiredTracks} unique eligible tracks. Explain how the selected styles connect the two DJs.` : discovery ? `Strict filters are mandatory. The combined genre palette must cover at least ${requiredTracks} unique tracks after all restrictions and configured exclusions (four-minute average, twice the slot airtime). Prefer empty moods, eras and energies so they do not shrink discovery coverage. Select at most two moods only when musically necessary; never list most of the mood vocabulary.` : djChoice ? `Strict genres are mandatory: the palette itself supplies the familiar core and connected departures. Cover at least ${requiredTracks} unique eligible tracks, using a four-minute average and twice the slot airtime. Return moods: [], eras: [] and energies: [] by default so daypart and weather can softly influence selection. Add at most two moods, an era or an energy only for an explicit operator requirement or a clear musical necessity, never just a theme, presentation style or favourite decade.` : 'Soft filters leave room for exploration.',
        `Counts overlap and do not prove coverage after additional filters. Return moods, genres, eras, energies, filtersStrict and a rationale under 500 characters explaining this accepted palette${djChoice ? ': identify the familiar core and why the adjacent styles connect; do not merely report that genres were copied' : ''}. Do not invent artist influence, history or airplay. Any era is eras: [].`,
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
    ...concept, ...parsed, ...(strictGenres ? { filtersStrict: true } : {}),
    moods: [...new Set(parsed.moods)], energies: [...new Set(parsed.energies)],
    eras: mergeEraWindows(parsed.eras),
    name: input.nameMode === 'custom' ? input.customName : concept.name,
  });
}
