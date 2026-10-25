import { createHash } from 'node:crypto';
import { z } from 'zod';
import * as settings from '../settings.js';
import * as library from '../music/library.js';
import { resolveEraYear } from '../music/era-year.js';
import { genreRuns, normGenre } from '../music/genre-fold.js';
import { zonedParts } from '../time.js';
import { generatedShowPlanSchema, type GeneratedShowPlan } from '../schemas/show-preparation.js';
import { djObject } from '../llm/sdk.js';
import { DJ_SOULS } from '../settings/vocab.js';
import { ShowPlanningError, musicalDetailError, libraryFitError, missingMusicalEvidence } from './show-planning-policy.js';

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
  const guestIds: string[] = config.template === 'outside-comfort-zone' || config.guestMode === 'none'
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
  const outside = input.template === 'outside-comfort-zone';
  const timeCapsule = input.template === 'time-capsule';
  const strictGenres = discovery || djChoice || commonGround || outside || timeCapsule;
  const genreLimit = strictGenres ? 15 : 6;
  const requiredTracks = Math.max(input.minimumCoverage ?? 0, Math.ceil(2 * (input.occurrence.endsAt - input.occurrence.startsAt) / 240_000));
  const generationPass = input.coverageCorrection ? 'coverage-correction' : 'initial';
  const personas = settings.get().personas ?? [];
  const moodNames = settings.moodVocab();
  const hostPersona = personas.find((p: any) => p.id === input.cast.hostPersonaId);
  if (!hostPersona) throw new Error('The selected host is no longer available');
  const guests = input.cast.guestPersonaIds
    .map(id => personas.find((p: any) => p.id === id))
    .filter(Boolean);
  if (commonGround && (input.cast.guestPersonaIds.length !== 1 || guests.length !== 1 || guests[0]?.id === hostPersona.id)) {
    throw new Error('Common Ground requires a host and exactly one distinct guest');
  }
  if (outside && input.cast.guestPersonaIds.length) throw new Error('Outside the Comfort Zone requires a solo host');
  const host = {
    name: String(hostPersona.name || 'Host'),
    soul: String(hostPersona.soul || ''),
    musicLean: String(hostPersona.musicLean || '').trim(),
  };
  const existingShows = input.existingShows ?? scheduledShowsForHost(hostPersona.id, input.show?.id);
  const familiarGenres = new Set(existingShows.flatMap(show => show.genres).map(normGenre));
  const umbrellaGenres = new Set(['Rock', 'Pop', 'Electronic', 'Experimental'].map(normGenre));
  const evidencePersonas = [hostPersona, ...(commonGround ? guests : [])].map(persona => ({
    id: String(persona.id), name: String(persona.name || 'Selected DJ'), soul: String(persona.soul || '').trim(), musicLean: String(persona.musicLean || '').trim(),
  }));
  const knownUnready = evidencePersonas.filter(persona => !persona.musicLean && (!persona.soul || DJ_SOULS.includes(persona.soul))).map(persona => persona.name);
  if (knownUnready.length) throw musicalDetailError(knownUnready);
  let libraryStats: ReturnType<typeof library.stats> | null = null;
  try {
    await library.load();
    libraryStats = library.stats();
  } catch { /* Report unavailable coverage below; do not guess library suitability. */ }
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
  const choices = genreChoices.filter(genre => (!outside || !familiarGenres.has(normGenre(genre.name)))
    && (!(outside || timeCapsule) || !umbrellaGenres.has(normGenre(genre.name))));
  if (!libraryStats) throw new ShowPlanningError('library-unavailable', 'Music library information is unavailable. Check the library connection and indexing, then try again.');
  if (!choices.length) throw libraryFitError('The indexed library has no available genre palette supporting this template.');
  const counts = byGenre ?? {};
  const moods = moodNames;
  const estimate = Math.max(1, Math.ceil((input.occurrence.endsAt - input.occurrence.startsAt) / 240_000));
  const currentYear = new Date(input.occurrence.startsAt).getUTCFullYear();
  const periodCounts = new Map<number, Map<string, number>>();
  if (timeCapsule) for (const track of library.candidateFilterTracks()) {
    const year = resolveEraYear(track.year, track.originalYear, track.yearUntrusted ?? track.isCompilation);
    if (year == null || year < 1900 || year > currentYear) continue;
    const start = Math.floor(year / 5) * 5;
    const counts = periodCounts.get(start) ?? new Map<string, number>();
    for (const genre of new Set(track.genres?.length ? track.genres : track.genre ? [track.genre] : [])) {
      if (choices.some(choice => choice.name === genre)) counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
    periodCounts.set(start, counts);
  }
  const periodEvidence = [...periodCounts].sort(([a], [b]) => a - b).map(([start, counts]) => ({
    years: `${start}–${Math.min(start + 4, currentYear)}`,
    genres: Object.fromEntries([...counts].sort((a, b) => b[1] - a[1]).slice(0, 6)),
  }));
  const baseConceptSchema = generatedShowPlanSchema.pick({ name: true, topic: true }).extend({
    // Reserve room for the labelled thread inside the persisted 2,000-character brief.
    topic: generatedShowPlanSchema.shape.topic.max(1600),
    talkingPoint: z.string().trim().min(1).max(300)
      .describe('one specific optional musical question or contrast the DJ can revisit naturally; not a script, fixed segment or extra music restriction'),
    intendedGenres: choices.length
      ? z.array(z.enum(choices.map(g => g.name) as [string, ...string[]])).min(1).max(genreLimit)
      : z.array(z.never()).max(0),
  });
  // Put the pair-specific evidence before the brief in the concept output
  // contract so the model must identify a connection rather than just name two styles.
  const timePeriodSchema = z.object({
    fromYear: z.number().int().min(1900).max(currentYear),
    toYear: z.number().int().min(1900).max(currentYear),
  }).describe('one closed music period, normally 1–5 years and never more than 10 years inclusive');
  const conceptSchema = timeCapsule ? z.object({
    period: timePeriodSchema,
    musicalAngle: z.string().min(1).max(300).describe('why this period and coherent genre palette suit this particular DJ’s musical tastes'),
    name: baseConceptSchema.shape.name.describe('short musical title; no claims about the birth, invention, firsts, rise or definitive history of a genre'),
    topic: baseConceptSchema.shape.topic.min(160).max(650).describe('2–3 sentences: exact period, specific genre palette and this host’s musical angle. No named artists, tracks, historical claims or invented personal memories.'),
    talkingPoint: baseConceptSchema.shape.talkingPoint,
    intendedGenres: baseConceptSchema.shape.intendedGenres.max(3),
  }) : outside ? z.object({
    departure: z.object({
      familiarTerritory: z.string().min(1).max(300).describe('musical interests supported by Soul/Leanings and established repertoire from regular-show filters'),
      destination: z.enum(choices.map(genre => genre.name) as [string, ...string[]])
        .describe('the exact name of the primary destination genre, copied from the available choices'),
      bridge: z.string().min(1).max(300).describe('a concrete musical characteristic linking the host’s interests to the destination'),
      whyOutside: z.string().min(1).max(300).describe('how this departs from regular-show filters; distinguish documented repertoire from inferred taste'),
    }),
    name: baseConceptSchema.shape.name,
    topic: baseConceptSchema.shape.topic.min(160).max(650)
      .describe('State this host’s specific familiar musical interest, the audible bridge and the exact destination genre from departure in 2–3 sentences. Do not merely invite a journey or describe the destination.'),
    talkingPoint: baseConceptSchema.shape.talkingPoint,
  }) : commonGround ? z.object({
    musicalConnection: z.object({
      hostTaste: z.string().min(1).max(300).describe('a specific musical interest supported by the host Soul or Leanings, not presentation style'),
      guestTaste: z.string().min(1).max(300).describe('a specific musical interest supported by the guest Soul or Leanings, not presentation style'),
      sharedThread: z.string().min(1).max(300).describe('one concrete musical characteristic connecting these interests, without inventing a shared preference'),
    }),
    name: baseConceptSchema.shape.name,
    topic: baseConceptSchema.shape.topic.min(160).max(650)
      .describe('2–3 sentences explaining the musical connection and what each DJ brings; reflect musicalConnection; put the optional conversational thread in talkingPoint'),
    talkingPoint: baseConceptSchema.shape.talkingPoint,
    intendedGenres: baseConceptSchema.shape.intendedGenres,
  }) : baseConceptSchema;
  const talkingPointInstruction = 'Return talkingPoint separately from topic: one specific musical question or contrast suggested by this episode’s music and cast. It is an optional conversational thread for occasional natural comments, not a scripted exchange, mandatory feature, repeated announcement or question to answer on every link. It must fit the declared genre palette without promising extra genres, eras, tracks or invented artist facts. Keep it to one short sentence and do not put a Talking point label in either field; the controller adds that label to the brief.';
  const identity = (p: any) => ({ name: p.name, soul: p.soul, ...(p.musicLean ? { musicalLeanings: p.musicLean } : {}) });
  const assessmentSchema = z.object({
    evidence: z.array(z.object({ personaId: z.enum(evidencePersonas.map(p => p.id) as [string, ...string[]]), source: z.enum(['soul', 'musicLean']), quote: z.string().min(1).max(500).describe('Copy a short musical preference verbatim from this persona’s selected source. Do not paraphrase, combine fields or quote another participant.') })).max(12),
    problem: z.enum(['none', 'persona-readiness', 'library-fit']),
    reason: z.string().max(500),
  });
  const responseSchema = z.object({ assessment: assessmentSchema, proposal: conceptSchema.nullable() });
  const readinessInstruction = `Before planning, apply a mandatory musical-readiness gate to the required participants supplied in the user data. Quote exact musical evidence from each participant's own soul or musicLean. An explicit preference for even one genre, artist, instrument, songwriting quality or musical style is sufficient. Soul OR musicLean is enough; either field may be empty, and no existing shows are needed. Copy a short relevant passage verbatim, not a summary. A participant with clear genres in musicLean is ready even if their Soul only describes presentation. Evidence must explicitly describe a taste in MUSIC. Never infer music from warmth, dry humour, plainspoken delivery, wistfulness, brevity, leaving conversational space, a welcoming voice, concise links, an eye for everyday details or presenter/station comparisons. These describe speech or personality, not music tastes. For example, Soul="a relaxed presenter with dry humour" and empty musicLean MUST return persona-readiness, evidence=[], proposal=null. Soul="loves folk rock" with empty musicLean supplies musical evidence; presentation-only Soul plus musicLean="loves folk rock" also supplies it. Regular-show filters are supporting repertoire evidence, not quotations from Soul or Leanings. If ANY required participant lacks musical evidence, return assessment.problem=persona-readiness, evidence only for supported participants, and proposal=null. Do not invent preferences or repertoire to fill this gap. Otherwise assess whether the supplied library supports THIS template's musical idea: a coherent palette, a genuinely less-represented territory for Deep Discovery, a credible neighbouring departure for Outside the Comfort Zone, a real musical connection for Common Ground, or a covered period for Time Capsule. A large track count or a long unrelated genre list alone is not sufficient. If no credible musical fit exists, include the exact evidence for every required participant, return library-fit with a short reason and proposal=null, even if many tracks exist. On success return problem=none, exact evidence for every required participant and the requested proposal. Never force a proposal when not ready.

`;
  const response = await djObject({
    system: readinessInstruction + (timeCapsule
      ? 'Plan one era-led radio episode interpreted through this host’s musical tastes. Choose a precise closed period with library coverage, then a coherent genre palette and short brief. Do not invent historical facts or personal memories. Return only requested JSON.'
      : outside
      ? 'Plan one solo musical radio episode exploring a neighbouring territory outside the DJ’s familiar repertoire. Establish a supported starting point, a credible musical bridge and one focused destination, then write the brief and title. Return only the requested JSON.'
      : commonGround
      ? 'Plan one specific musical radio episode finding common ground between two DJs with equal musical influence. Write its short brief, derive its title, and declare the genre palette it promises. Return only the requested JSON.'
      : 'Plan one specific musical radio episode led by the host. Write its short brief, derive its title, and explicitly declare the small genre palette the brief promises. Return only the requested JSON.'),
    prompt: `Required participants: ${JSON.stringify(evidencePersonas)}\n\n` + (timeCapsule ? [
      `Host: ${JSON.stringify(identity(host))}`,
      `Guest perspectives (optional, host remains musical lead): ${JSON.stringify(guests.map(identity))}`,
      `Supporting regular-show music filters: ${JSON.stringify(existingShows)}`,
      `Local slot: ${showTime(input)}. Available genres: ${choices.map(g => g.name).join('; ')}`,
      `Library period evidence (five-year bins, top six genres each; counts overlap): ${JSON.stringify(periodEvidence)}`,
      input.planningPrompt ? `Operator direction: ${input.planningPrompt}` : null,
      input.coverageCorrection || null,
      `Choose period first: a specific year or short closed window, preferably 1–5 years, at most 10 years inclusive. Both numeric bounds are required. Choose 1–3 specific coherent genres fitting that period and this host’s Soul plus optional Musical Leanings. Prefer a period supporting at least ${requiredTracks} unique tracks after era and genre filters; evidence bins are context, not proof of exact coverage. Rarity and a departure from familiar tastes are not required.`,
      'No country, regional scene or nationality restriction is available. Do not promise a British, American or other geographically exclusive selection. Do not turn period atmosphere into claims about where a genre emerged. Keep the talking point a general musical question within this palette; do not name artists or bands.',
      'Fill period and musicalAngle before writing. Use only specific genre choices; umbrella Rock, Pop, Electronic and Experimental are excluded, and must not be promised in the brief as extra music. Do not add padding genres when the main style already has coverage.',
      'The brief must state both exact numeric year bounds from period (or the single year); never replace a narrower window with a whole-decade label. It must also state the selected genre palette and this host’s particular musical angle. Use 2–3 concise sentences, at most 80 words. Do not broaden the period to present day, promise other decades, or make a definitive history programme. Do not name any artists, bands, albums or tracks. Do not claim the birth, emergence, invention, rise or golden age of a genre, including in the title. Do not invent release milestones, firsts, influence, remembered gigs or personal listening history. Discuss musical qualities and tastes rather than unsupported historical events.',
      talkingPointInstruction,
      'For this template, talkingPoint must be about musical qualities, songwriting, arrangement or contrasting tastes within the chosen palette and period. Do not ask about the rise, influence, origin, impact or historical role of a genre, and do not introduce an unselected genre or compare with present-day music. No research is provided.',
      input.nameMode === 'custom' ? `Use this exact title: ${input.customName}` : 'Derive a distinctive short title from the musical idea. Avoid generic time-travel slogans and presenter names.',
      'Return name, topic, talkingPoint, intendedGenres, period and musicalAngle. Only promise the declared music and period. Mood and energy filters will remain unrestricted.',
    ].filter(Boolean).join('\n\n') : outside ? [
      `Host: ${JSON.stringify(identity(host))}`,
      `Scheduled regular-show filters, evidence of established repertoire rather than limits on taste: ${JSON.stringify(existingShows)}`,
      `Local slot: ${showTime(input)}. Available destination genres and indexed counts: ${choices.map(g => `${g.name}:${g.tracks}`).join('; ')}`,
      input.planningPrompt ? `Operator direction: ${input.planningPrompt}` : null,
      input.coverageCorrection || null,
      'Fill departure first. Soul is primary; optional Musical Leanings supplement it. Use regular-show filters to distinguish documented repertoire from a plausible new destination. If no shows exist, explicitly acknowledge that the familiar territory is inferred from persona preferences. Never invent a dislike, a lack of knowledge or a past listening habit.',
      'State the exact destination genre in the brief and make its difference from the starting point clear. A genre absent from show filters may still be an explicit persona preference: do not pretend it is unfamiliar without explaining a more specific departure. Make ONE coherent sideways move, following something the DJ already appreciates into a related territory they do not normally programme. The musical bridge must explain why this DJ would be curious. The destination, not the familiar starting point, supplies the music throughout the show. Do not make a familiar set with occasional adjacent tracks, several unrelated excursions, or a deliberately distant challenge. Underrepresentation is not required. Presentation style and speaking pace do not define music taste.',
      `Choose ONE specific destination genre, copied exactly from the supplied choices, with enough music for ${requiredTracks} unique eligible tracks (twice airtime at a four-minute average). The controller uses departure.destination as the sole strict genre filter. If a destination lacks coverage, choose another coherent destination rather than padding it with an umbrella genre. Broad tags such as Electronic, Rock, Pop or Experimental do not describe a focused destination. Exact regular-show genres have already been excluded. Rarity is not a goal.`,
      'The bridge must name a concrete audible feature supported by this particular persona: instrumentation, rhythm, arrangement, texture or songwriting. Generic curiosity, atmosphere or experimentation alone is insufficient. Consider several plausible directions internally and choose the one with the strongest individual connection; do not default every host to post-punk or industrial. Do not invent genre history, classify a rock genre as electronic music, or claim the regular shows feature a sound not established by their filters or the persona.',
      'Write a concise brief of 2–3 sentences, at most 80 words: identify the starting interest, the musical bridge and the exact destination genre. Introduce familiar genres explicitly as the host’s existing tastes, then describe the move into the destination. Do not promise a blend, intersection or alternation with those familiar genres; the destination supplies all music. Invite an open-minded exploration without claiming that the DJ dislikes this music, is already an expert or has actually played particular records. Do not promise specific artists, tracks, genre alternation or a scripted journey. Only promise music in departure.destination.',
      talkingPointInstruction,
      input.nameMode === 'custom' ? `Use this exact title: ${input.customName}` : 'Derive an original short title from the musical idea, without presenter names, genre lists or the template name.',
      'Before returning, check that the brief actually states the specific starting interest, audible bridge and destination from departure, rather than just promising a journey. The talking point must be musically accurate. Keep the title and brief era-neutral unless the operator explicitly requests a music period. Return departure, name, topic and talkingPoint.',
    ].filter(Boolean).join('\n\n') : commonGround ? [
      `Host (presentation lead only): ${JSON.stringify(identity(host))}`,
      `Guest (equal musical influence): ${JSON.stringify(identity(guests[0]))}`,
      `Supporting repertoire filters: ${JSON.stringify([{ dj: host.name, shows: existingShows }, { dj: guests[0]?.name, shows: scheduledShowsForHost(guests[0]!.id, input.show?.id) }])}`,
      `Local slot: ${showTime(input)}. Available genre names and indexed counts: ${choices.map(g => `${g.name}:${g.tracks}`).join('; ')}`,
      input.planningPrompt ? `Operator direction: ${input.planningPrompt}` : null,
      input.coverageCorrection || null,
      'Fill musicalConnection first with a specific supported taste for each DJ and the musical thread connecting them. Do not infer a preference for a different genre just because its name shares a word with a stated preference. Find ONE specific musical connection that this particular pair could explore together. First identify each DJ’s actual musical interests in their Soul and optional Musical Leanings, then find a shared musical characteristic or a defensible bridge between them. Persona preferences take precedence over supporting show filters. Presentation style, speaking pace and personality are not musical preferences. Where a taste is inferred rather than stated, frame the territory as an invitation to explore it, not an established shared love.',
      'Give both DJs equal musical influence. Choose music that can serve the connection throughout the show. Each selected genre must belong to that same connection and offer something to both DJs. Do not assemble one DJ’s favourites beside the other’s in separate genre groups. Replacing either DJ should change the idea. Do not chase rarity or claim the connection is surprising merely because the genres differ.',
      `Select the smallest coherent palette that expresses the connection, usually 2–5 styles. Use more, up to 15, only when adjacent styles are needed to reach ${requiredTracks} unique matching tracks (twice airtime at a four-minute average). Prefer informative styles over broad umbrella tags that would admit unrelated music. A large pool is fine when musically appropriate; do not narrow it arbitrarily. Counts overlap and are not proof of combined coverage. Copy intendedGenres exactly from the supplied names.`,
      'Write topic as a concise commissioning brief of 2–3 sentences, at most 80 words. State the concrete musical thread and why it offers something to EACH DJ. Put the optional musical question in talkingPoint rather than repeating it in topic. Describe an idea for a show, without predicting dialogue, announcing the episode, narrating how they discover mutual understanding or promising specific artists, tracks or invented personal history. The brief must promise only the chosen genres.',
      talkingPointInstruction,
      input.nameMode === 'custom' ? `Use this exact title: ${input.customName}` : 'Derive a distinctive short show title from the musical thread. Do not use the template name, “Finding Common Ground”, presenter names or a list of genres as the title. Avoid generic discovery slogans.',
      'Keep the name and brief era-neutral. Favourite decades in persona notes or regular shows do not impose a date restriction. Only include a period when the operator explicitly requests that restriction. Return musicalConnection, name, topic, talkingPoint and intendedGenres.',
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
      talkingPointInstruction,
      `Write a concise brief and name. Declare 1–${genreLimit} intendedGenres copied exactly from the available palette, never a catalogue dump. The brief must describe those same styles. Do not promise other genres, particular tracks or artists, a fixed playlist, release chronology or unsupported artistic influence. Do not invent personal history or airplay.`,
      'Keep the brief and title era-neutral by default. Do not promise decades or date ranges, including phrases such as “the 80s and beyond”, just because they appear in the Soul, Musical Leanings or regular shows. Only describe a bounded period when the operator explicitly requests it as a music restriction; the settings must then include matching era windows. Otherwise describe the musical connection without dates.',
      `Counts overlap; roughly ${estimate} four-minute records is a pacing estimate, not a hard minimum. Do not force era, mood or energy restrictions from favourite decades or presentation. Return name, topic, talkingPoint and intendedGenres.`,
    ].filter(Boolean).join('\n\n')),
    schema: responseSchema, temperature: 0.7,
    kind: 'generateShowPlan.concept',
    telemetry: { show: input.show?.id, occurrence: input.occurrence.id, template: input.template, pass: generationPass },
  }) as z.infer<typeof responseSchema>;
  const assessment = response.assessment;
  const missing = missingMusicalEvidence(evidencePersonas, assessment.evidence, Object.keys(counts));
  if (missing.length) throw musicalDetailError(missing);
  if (assessment.problem === 'library-fit') throw libraryFitError(assessment.reason || 'No coherent musical direction is supported by the available music.');
  if (!response.proposal) throw new Error('The planner could not create a proposal from the supplied musical preferences. Please try again.');
  const concept = response.proposal;
  const period = timeCapsule ? timePeriodSchema.parse('period' in concept ? concept.period : null) : null;
  if (period && (period.toYear < period.fromYear || period.toYear - period.fromYear >= 10)) throw new Error('Time Capsule requires a closed period of at most ten years');
  const intended = 'departure' in concept ? [concept.departure.destination] : [...new Set(concept.intendedGenres)];
  const settingsSchema = generatedShowPlanSchema.omit({ name: true, topic: true }).extend({
    moods: generatedShowPlanSchema.shape.moods.max(timeCapsule || outside && !input.planningPrompt.trim() ? 0 : strictGenres ? 2 : 15),
    eras: period ? z.array(z.object({ fromYear: z.literal(period.fromYear), toYear: z.literal(period.toYear) })).length(1) : generatedShowPlanSchema.shape.eras.max(outside && !input.planningPrompt.trim() && input.nameMode !== 'custom' ? 0 : 15),
    energies: generatedShowPlanSchema.shape.energies.max(timeCapsule || outside && !input.planningPrompt.trim() ? 0 : 15),
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
      system: `Translate the accepted musical proposal into settings. Do not create another idea or choose another genre palette. Preserve every required genre exactly once. ${timeCapsule ? 'Preserve the required closed era exactly; leave moods and energies empty.' : 'Default mood, era and energy lists to empty.'} Set filtersStrict to ${strictGenres ? 'true' : 'false'}.`,
      prompt: [
        `Accepted proposal: ${JSON.stringify({ name: concept.name, topic: concept.topic, talkingPoint: concept.talkingPoint, requiredGenres: intended })}`,
        period ? `Required era: ${JSON.stringify(period)}. Return exactly this one closed era window. It is mandatory, not an optional restriction. Musical angle: ${'musicalAngle' in concept ? concept.musicalAngle : ''}` : null,
        outside && 'departure' in concept ? `Musical bridge evidence for the rationale: ${JSON.stringify(concept.departure)}` : null,
        `Indexed counts (coverage context only): ${JSON.stringify(Object.fromEntries(intended.map(name => [name, counts[name]])))}`,
        'talkingPoint is optional editorial context, not a promise of extra music or an instruction to narrow filters. Do not derive extra genre, era, mood or energy restrictions from its question.',
        'Return genres as an array of strings, for example ["Indie Rock", "Post-Punk"]. Copy the requiredGenres strings exactly. Never put name/tracks objects in genres.',
        `Duration: ${(input.occurrence.endsAt - input.occurrence.startsAt) / 60_000} minutes. Allowed moods: ${moods.join(', ')}.`,
        input.planningPrompt ? `Operator requirements: ${input.planningPrompt}` : null,
        input.minimumCoverage != null ? `Operator minimum: ${input.minimumCoverage} unique eligible tracks after all filters and exclusions.` : null,
        input.coverageCorrection || null,
        (commonGround || outside || timeCapsule) ? 'The accepted proposal is authoritative for era promises, just as it is for genres. Return eras: [] only when its name and brief are era-neutral and the operator requested no period. If the accepted brief promises decades or dates, encode those periods even when the concept writer introduced them without an operator request. Use numeric fromYear/toYear bounds, never date strings. Preserve every promised period; a brief spanning older and contemporary music must keep an open upper bound so current music remains eligible. Do not infer extra restrictions from genre associations or persona preferences.' : 'Era JSON shape: return eras: [] for unrestricted music. If a date restriction is required, use objects such as eras: [{"fromYear": 1980, "toYear": 1995}], with number or null bounds. Never return date strings such as eras: ["1980-1995"]. This example is formatting only, not an instruction to select those years.',
        'The title and brief must agree with the era settings. If the accepted proposal explicitly promises a decade or date range, encode that range in eras; do not leave eras empty. A favourite decade in persona context alone is not a restriction. An era-neutral proposal should keep eras empty unless the operator explicitly requires a period.',
        'Copy requiredGenres into genres exactly once each, with no additions, omissions or substitutions. Keep moods, eras and energies empty unless the operator or musical idea explicitly requires a restriction and coverage supports it. Conversation style and favourite decades are not music restrictions.',
        timeCapsule ? 'Strict era and genre filters are mandatory. Copy the supplied period exactly into the sole era entry, with numeric closed bounds. Leave moods and energies empty. Explain why this period and palette suit the host.' : outside ? `Use strict genres to keep the show in its chosen destination. Preserve requiredGenres exactly; leave moods, eras and energies empty unless the accepted brief explicitly requires a restriction. Explain the musical bridge and departure, not merely that genres were copied.` : commonGround ? `Use strict genres. Leave moods and energies empty unless explicitly required. Era filters must represent any periods promised in the accepted proposal; otherwise leave eras empty. The palette should cover at least ${requiredTracks} unique eligible tracks. Explain how the selected styles connect the two DJs.` : discovery ? `Strict filters are mandatory. The combined genre palette must cover at least ${requiredTracks} unique tracks after all restrictions and configured exclusions (four-minute average, twice the slot airtime). Prefer empty moods, eras and energies so they do not shrink discovery coverage. Select at most two moods only when musically necessary; never list most of the mood vocabulary.` : djChoice ? `Strict genres are mandatory: the palette itself supplies the familiar core and connected departures. Cover at least ${requiredTracks} unique eligible tracks, using a four-minute average and twice the slot airtime. Return moods: [], eras: [] and energies: [] by default so daypart and weather can softly influence selection. Add at most two moods, an era or an energy only for an explicit operator requirement or a clear musical necessity, never just a theme, presentation style or favourite decade.` : 'Soft filters leave room for exploration.',
        `Counts overlap and do not prove coverage after additional filters. Return moods, genres, eras, energies, filtersStrict and a rationale under 500 characters explaining this accepted palette${djChoice ? ': identify the familiar core and why the adjacent styles connect; do not merely report that genres were copied' : ''}. Do not invent artist influence, history or airplay. Unrestricted music uses eras: []; this must not override an explicit period promised by the accepted brief.`,
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
    topic: `${period ? `${host.name} explores ${intended.join(', ')} from ${period.fromYear === period.toYear ? period.fromYear : `${period.fromYear}–${period.toYear}`}.\n\n` : ''}${concept.topic}\n\nTalking point (optional thread): ${concept.talkingPoint}`,
    moods: [...new Set(parsed.moods)], energies: [...new Set(parsed.energies)],
    eras: mergeEraWindows(parsed.eras),
    name: input.nameMode === 'custom' ? input.customName : concept.name,
  });
}
