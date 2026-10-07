// One editorial model call over a controller-built Track Shortlist.
//
// Discovery is deliberately absent here: candidates and factual provenance are
// supplied by music/shortlist.ts. The model chooses only from their ids and
// supplies a musical reason and transition. Link generation happens separately.

import { z } from 'zod';
import { djObject, modelTolerant } from '../llm/sdk.js';
import { pickSchemaBase, pickSystem, transitionChoiceNudge } from '../broadcast/dj-agent/schemas.js';
import type { AgenticLeaningsOption, AgenticLeaningsReviewRejection, AgenticTrackRef } from '../broadcast/dj-agent/leanings-review.js';
import type { ShortlistCandidate, ShortlistSourceRun } from './shortlist.js';

export type ShortlistPick = z.infer<ReturnType<typeof shortlistPickSchema>> & { selectionReason: string };

export type ShortlistPickResolution = {
  preliminary?: AgenticTrackRef;
  leaningsReview?: {
    outcome: 'not-run' | 'kept' | 'replaced' | 'invalid' | 'failed';
    replacementId: string | null;
    track?: AgenticTrackRef | null;
    leaningsBasis?: string | null;
    leaningsSource?: 'host' | 'guest' | null;
    baselineId?: string | null;
    reviewedSelectedId?: string | null;
    candidateIds?: string[];
    leaningsOptions?: string[];
    leaningsSources?: AgenticLeaningsOption[];
    proposedReplacementId?: string | null;
    rejectionReason?: AgenticLeaningsReviewRejection | null;
  };
  guardOutcome?: 'none' | 'artist-repick' | 'album-repick' | 'artist-and-album-repick' | 'pool-rescue';
  final?: AgenticTrackRef;
  reason?: string | null;
  queued?: boolean;
  usedMusicalLeanings?: boolean;
  rejectionReason?: AgenticLeaningsReviewRejection | 'queue-collision' | 'pool-rescue' | null;
};

export type ShortlistSelectionContext = {
  currentTrack?: {
    id?: string | null;
    title?: string | null;
    artist?: string | null;
    album?: string | null;
    bpm?: number | null;
    key?: string | null;
    pace?: number | null;
  } | null;
  journeyActive?: boolean;
  link?: string;
  episodeEditorial?: string;
  // Present (including an empty array) only when transition effects are active.
  // The model otherwise has no view of its recent requests and tends to settle
  // into a washout/normal monoculture even though the queue can play six effects.
  recentTransitions?: string[];
};

function comparable(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    // Library metadata commonly uses “feat.” while models naturally write
    // “featuring”. They identify the same credited artist list.
    .replace(/\bfeaturing\b/g, 'feat')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const BACKSTAGE_LANGUAGE = /\b(?:shortlist|candidate|baseline|challenger|preliminary (?:pick|choice)|controller|metadata|flowCloseness|leaningsMatches|musical leanings?|preferences?|tastes?|DJ)\b/i;
const FIRST_PERSON_LANGUAGE = /\b(?:I|me|my|mine|we|us|our|ours)\b/i;

// The model owns only the musical clause. Identity and punctuation are added
// from the selected library row, so a stale response can never mis-credit a
// track after a guard correction.
export function shortlistClauseSelectionReason(track: any, reason: unknown): string {
  const title = typeof track?.title === 'string' ? track.title.trim() : '';
  const artist = typeof track?.artist === 'string' ? track.artist.trim() : '';
  const raw = typeof reason === 'string'
    ? reason.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '')
    : '';
  const identityText = comparable(raw);
  const repeatsIdentity = [title, artist]
    .map(comparable)
    .filter((value) => value.length >= 3)
    .some((value) => ` ${identityText} `.includes(` ${value} `));
  const unsafe = raw.length < 16 || raw.length > 180 || QUEUE_LANGUAGE.test(raw)
    || BACKSTAGE_LANGUAGE.test(raw) || FIRST_PERSON_LANGUAGE.test(raw) || repeatsIdentity;
  const clause = unsafe
    ? 'its musical character fits the surrounding sequence naturally'
    : raw.replace(/^(?:the selected track|this (?:track|song|piece))\s+/i, 'it ');
  const identity = title && artist ? `“${title}” by ${artist}` : title ? `“${title}”` : artist ? `A track by ${artist}` : 'The selected track';
  return `${identity} — ${clause[0].toLocaleLowerCase('en-GB')}${clause.slice(1)}.`;
}

const UNUSABLE_SELECTION_REASON = '[selection note unavailable]';
const QUEUE_LANGUAGE = /\b(?:next\s+up|up\s+next|coming\s+up|we(?:'|’)re\s+playing|we\s+have)\b/i;
const LEANINGS_REFERENCE = /\b(?:musical\s+leanings?|broad\s+alternative\s+taste|(?:dj|host)(?:['’]s)?\s+(?:musical\s+)?(?:taste|tastes|preference|preferences|favo(?:u)?rites?)|(?:my|his|her|their)\s+(?:musical\s+)?(?:taste|tastes|preference|preferences)|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}['’]s\s+(?:musical\s+)?(?:taste|tastes|preference|preferences|favo(?:u)?rites?))\b/i;

// Native source passes are controller-run rather than model tool calls. Attach
// their compact outcome record to the editorial call so the Debug feed retains
// the familiar pick-start / pick-result reasoning trail.
function shortlistDebugTools(sourceRuns: ShortlistSourceRun[]) {
  return sourceRuns.map(({ source, args, status, returned, accepted, elapsedMs, error }) => ({
    name: source,
    args,
    result: { status, returned, accepted, elapsedMs, ...(error ? { error } : {}) },
  }));
}

// A verified note can still be too thin to help an operator understand a
// choice. Keep a controller-written, track-specific floor without spending a
// second model call.
function usableSelectionReason(reason: unknown, song: { artist?: unknown; title?: unknown }): string {
  const note = typeof reason === 'string' ? reason.replace(/\s+/g, ' ').trim() : '';
  if (note.length >= 24 && !QUEUE_LANGUAGE.test(note) && note !== UNUSABLE_SELECTION_REASON) return note;
  const artist = typeof song.artist === 'string' && song.artist.trim() ? song.artist.trim() : 'This artist';
  const title = typeof song.title === 'string' && song.title.trim() ? song.title.trim() : 'this track';
  return `${artist} — ${title}: selected for its fit with the current musical flow.`;
}

// Leanings are private selection context, not boilerplate for every Booth
// note. When the model did not explicitly mark them as material, remove a
// profile-parroting explanation rather than presenting it as normal fit.
export function shortlistReasonForLeanings(
  reason: unknown,
  usedMusicalLeanings: boolean,
  song: { artist?: unknown; title?: unknown },
): string {
  // The tie-break is a private diagnostic. Keep the model's track-specific
  // Booth reason intact when it was genuinely relevant; replacing it with a
  // terse trait discarded the useful editorial explanation.
  if (usedMusicalLeanings || !LEANINGS_REFERENCE.test(String(reason ?? ''))) {
    return usableSelectionReason(reason, song);
  }
  return usableSelectionReason('', song);
}

export function shortlistPickSchema(ids: string[]) {
  if (!ids.length) throw new Error('cannot select from an empty Track Shortlist');
  const idEnum = z.enum(ids as [string, ...string[]]).describe('the exact id of one track in the supplied Track Shortlist');
  return modelTolerant(pickSchemaBase().omit({ reason: true, usedMusicalLeanings: true, leaningsTieBreak: true }).extend({
    id: idEnum,
    musicalReason: z.string().trim().min(16).max(180).describe('one natural, specific musical clause about the selected track, beginning with "its" or "it". Do not name the artist, title, DJ, shortlist, candidates, queue, metadata or Musical Leanings; the controller adds verified identity.'),
  }), { objectFallbacks: { musicalReason: '[musical reason unavailable]' } });
}

// Keep the model's view limited to facts that can affect musical flow,
// show/context fit, transition craft or rotation variety. Full candidates stay
// in controller memory for guards, enqueue and provenance; source names remain
// in Debug telemetry and the Booth hint rather than being repeated per track.
export function shortlistCandidateForPick(candidate: ShortlistCandidate): Record<string, unknown> {
  const {
    id, title, artist, album, year, genre, moods, energy, instrumental,
    bpm, key, pace, sections, unaired, play_count, last_played_days_ago,
    artist_play_count, artist_last_played_days_ago,
  } = candidate;
  return Object.fromEntries(Object.entries({
    id, title, artist, album, year, genre, moods, energy, instrumental,
    bpm, key, pace, sections, unaired, play_count, last_played_days_ago,
    artist_play_count, artist_last_played_days_ago,
  }).filter(([, value]) => value !== undefined && value !== null));
}

export function shortlistPickPrompt(candidates: ShortlistCandidate[], context: ShortlistSelectionContext = {}): string {
  const transitionInstruction = Array.isArray(context.recentTransitions)
    ? ` Set transition for this moment using the TRANSITION EFFECTS guidance.${transitionChoiceNudge(context.recentTransitions)}`
    : '';
  const episodeInstruction = context.episodeEditorial?.trim()
    ? ' The active episode editorial brief is included in context; follow it within the supplied candidates.'
    : '';
  return JSON.stringify({ context, shortlist: candidates.map(shortlistCandidateForPick) })
    + `\n\nChoose one id from this Track Shortlist using ordinary musical flow${episodeInstruction ? ' and the active episode brief' : ' only'}.${episodeInstruction}${transitionInstruction} Write musicalReason as one natural, specific musical clause of roughly 12–28 words, beginning with "its" or "it". Do not repeat the artist or title. Do not mention the DJ, Musical Leanings, shortlist, candidates, sources, controller, metadata, queue position, BPM, key, energy level or mood tags. The controller adds verified identity and handles any separate Musical Leanings review.`;
}

export async function djPick({
  candidates,
  showAt = null,
  playlistResolved = true,
  sourceRuns = [],
  context = {},
  shortlistResolution = {},
}: {
  candidates: ShortlistCandidate[];
  showAt?: Date | null;
  playlistResolved?: boolean;
  sourceRuns?: ShortlistSourceRun[];
  context?: ShortlistSelectionContext;
  shortlistResolution?: ShortlistPickResolution;
}): Promise<ShortlistPick> {
  const ids = candidates.map((candidate) => candidate.id).filter((id): id is string => typeof id === 'string');
  const toolCalls = shortlistDebugTools(sourceRuns);
  // The call ring receives this nested object by reference. Populate it once
  // the chosen id is known so Debug pairs the raw model response with the
  // controller-resolved track and safe Booth reason.
  const selection: z.infer<ReturnType<typeof shortlistPickSchema>> = await djObject({
    system: pickSystem(showAt, playlistResolved, true, { host: null, guest: null, promptValue: null }),
    prompt: shortlistPickPrompt(candidates, context),
    schema: shortlistPickSchema(ids),
    temperature: 0.5,
    kind: 'djShortlistPick',
    telemetry: { toolCalls, steps: toolCalls.length + 1, shortlistResolution },
  });
  const track = candidates.find((candidate) => candidate.id === selection.id);
  const selectionReason = shortlistClauseSelectionReason(track, selection.musicalReason);
  return { ...selection, selectionReason };
}
