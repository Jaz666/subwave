// One editorial model call over a controller-built Track Shortlist.
//
// Discovery is deliberately absent here: candidates and factual provenance are
// supplied by music/shortlist.ts. The model chooses only from their ids and
// writes the listener-facing link/transition in the existing pick shape.

import { z } from 'zod';
import { djObject, modelTolerant } from '../llm/sdk.js';
import { pickSchemaBase, pickSystem, type EditorialLeaningsContext } from '../broadcast/dj-agent/schemas.js';
import type { ShortlistCandidate } from './shortlist.js';

export type ShortlistPick = {
  id: string;
  selectionReason: string;
  usedMusicalLeanings: boolean;
  leaningsTieBreak: string | null;
  say: string | null;
  transition: 'normal' | 'blend' | 'sweep' | 'washout' | 'dissolve' | 'chop' | 'loop' | null;
};

export type ShortlistSelectionContext = {
  currentTrack?: { id?: string | null; title?: string | null; artist?: string | null; album?: string | null } | null;
  precedingTrack?: { id?: string | null; title?: string | null; artist?: string | null; album?: string | null } | null;
  transition?: {
    recentChoices: string[];
    guidance: string;
  } | null;
  journey?: {
    direction: string;
    targetBpm?: number | null;
    targetKey?: string | null;
  } | null;
  curatedPlaylist?: {
    mode: 'soft' | 'strict';
  } | null;
  link?: string;
};

export function resolvedMusicalLeaningsFlag(
  context: EditorialLeaningsContext | null,
  modelFlag: unknown,
  tieBreak: unknown,
): boolean {
  // A model must explicitly claim this AND give non-generic evidence. Inferring
  // it from prose turns an incidental taste reference into a false diagnostic.
  const evidence = typeof tieBreak === 'string' ? tieBreak.replace(/\s+/g, ' ').trim() : '';
  return !!context?.promptValue && modelFlag === true && evidence.length >= 3
    && !/^(?:energy|pace|key|club(?:\s+feel)?|flow|tempo|bpm|vibe)$/i.test(evidence);
}

export function resolvedLeaningsTieBreak(
  context: EditorialLeaningsContext | null,
  modelFlag: unknown,
  tieBreak: unknown,
): string | null {
  if (!resolvedMusicalLeaningsFlag(context, modelFlag, tieBreak)) return null;
  return String(tieBreak).replace(/\s+/g, ' ').trim();
}

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function trimDanglingEnding(value: string): string {
  return value
    .replace(/\s*[,;:]\s*(?:and|or|but)?\s*$/i, '')
    .replace(/\s+(?:and|or|but)\s*$/i, '')
    .trim();
}

// A model-written sentence is useful only when it identifies the very track
// that reached the queue. Corrective guards can replace the initial choice, so
// do this once at the final queue boundary rather than trusting a reason from a
// previous selection. A safe generic line is preferable to explaining Sam
// Smith with a Porcupine Tree note.
export function shortlistSelectionReason(track: any, reason: unknown): string {
  const trackTitle = typeof track?.title === 'string' ? track.title.trim() : '';
  const trackArtist = typeof track?.artist === 'string' ? track.artist.trim() : '';
  const title = comparable(trackTitle);
  const artist = comparable(trackArtist);
  const note = comparable(reason);
  if (note && (!title || note.includes(title)) && (!artist || note.includes(artist))) {
    return String(reason).trim();
  }

  // Small local models sometimes stop after naming the artist. Keep only a
  // clearly generic, artist-led fragment, trim a dangling conjunction, then
  // anchor it to the verified final title. This preserves useful variation
  // without allowing a corrected pick to inherit another track's explanation.
  const raw = typeof reason === 'string' ? trimDanglingEnding(reason.replace(/\s+/g, ' ')) : '';
  if (raw && trackTitle && trackArtist && artist && !note.includes(title)) {
    const remainder = raw.replace(new RegExp(`^${escapeRegExp(trackArtist)}\\s*[-—,:]?\\s*`, 'i'), '').trim();
    if (/^(?:fits|works|brings|keeps|matches|follows|continues|adds|carries|suits|makes|offers)\b/i.test(remainder)) {
      return `“${trackTitle}” by ${trackArtist} — ${/[.!?]$/.test(remainder) ? remainder : `${remainder}.`}`;
    }
  }

  const identity = [trackTitle, trackArtist].filter(Boolean).join(' by ');
  return identity ? `Selected "${identity}" from the eligible shortlist.` : 'Selected from the eligible shortlist.';
}

const LEANINGS_REFERENCE = /\b(?:musical\s+leanings?|broad\s+alternative\s+taste|(?:dj|host)(?:'s)?\s+(?:musical\s+)?(?:taste|tastes|preference|preferences|favo(?:u)?rites?)|(?:my|his|her|their)\s+(?:musical\s+)?(?:taste|tastes|preference|preferences)|[A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}['’]s\s+(?:musical\s+)?(?:taste|tastes|preference|preferences|favo(?:u)?rites?))\b/i;

// A verified note can still be too thin to be useful in the Booth. Keep a
// controller-written, track-specific floor without spending another model call.
export function usableSelectionReason(reason: unknown, song: { artist?: unknown; title?: unknown }): string {
  const note = typeof reason === 'string' ? reason.replace(/\s+/g, ' ').trim() : '';
  if (note.length >= 24) return note;
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
  return modelTolerant(pickSchemaBase().omit({ reason: true }).extend({
    id: idEnum,
    // Editorial only: provenance remains controller-written and must never be
    // reconstructed from the model's interpretation of the shortlist.
    selectionReason: z.string().describe('internal editorial reason only — max 12 words. Explain why this candidate fits the musical moment; never claim source names, source counts, or diagnostic facts.'),
    usedMusicalLeanings: z.boolean().describe('private diagnostic decision — always include this. Default false with leaningsTieBreak null. Set true ONLY when two or more eligible shortlist tracks already fit the flow and supplied Musical Leanings genuinely settle that close choice; compatibility alone is not enough. Leanings never override show rules, rotation, safety, or musical flow.'),
    leaningsTieBreak: z.string().nullable().describe('always include this. Set null when usedMusicalLeanings is false. When true, give the short specific trait of the chosen shortlist candidate that directly matches supplied Musical Leanings. Generic flow facts such as energy, pace, key, or club feel are not Leanings evidence.'),
  }));
}

export function shortlistPickPrompt(candidates: ShortlistCandidate[], context: ShortlistSelectionContext = {}, editorialLeanings: EditorialLeaningsContext | null = null): string {
  return JSON.stringify({ context: { ...context, musicalLeanings: editorialLeanings?.promptValue ?? null }, shortlist: candidates }, null, 2)
    + '\n\nChoose one id from this Track Shortlist. The controller has already applied the station guards. Use the current and preceding tracks to judge continuity. When transition context is supplied, set transition by what THIS moment needs and vary deliberately from its recent choices. When journey context is supplied, move one step toward its direction while maintaining the stated energy; never mention the journey on air. When curatedPlaylist.mode is "soft", strongly prefer candidates whose shortlistSources contain "showPlaylistTracks"; only step outside when the flow clearly calls for it. Write selectionReason as a private Booth Log note, never on-air DJ speech: name your selected artist and track title, then explain the musical fit. Do not introduce or announce the track, imply it is next in the queue, use first-person DJ framing, or say "next up", "coming up", "we are playing", or "we have". Do not name shortlist sources: the controller adds that factual hint. Use Musical Leanings only as a soft tie-breaker between two or more already eligible shortlist tracks. Always return both diagnostic fields: default usedMusicalLeanings to false and leaningsTieBreak to null. Set true and give a short, specific tie-break trait only when Leanings genuinely settle that close choice—not merely because a track is compatible. The trait must describe the chosen track and directly match supplied Leanings; generic energy, pace, key, or club feel claims are not evidence. Leanings never override show rules, rotation, safety, or musical flow. When false, selectionReason must not quote, paraphrase, or refer to Musical Leanings, preferences, or tastes.';
}

export async function djPick({
  candidates,
  showAt = null,
  playlistResolved = true,
  context = {},
  editorialLeanings = null,
}: {
  candidates: ShortlistCandidate[];
  showAt?: Date | null;
  playlistResolved?: boolean;
  context?: ShortlistSelectionContext;
  editorialLeanings?: EditorialLeaningsContext | null;
}): Promise<ShortlistPick> {
  const ids = candidates.map((candidate) => candidate.id).filter((id): id is string => typeof id === 'string');
  const shortlistResolution: any = {};
  const selection = await djObject({
    system: pickSystem(showAt, playlistResolved, true, editorialLeanings),
    prompt: shortlistPickPrompt(candidates, context, editorialLeanings),
    schema: shortlistPickSchema(ids),
    temperature: 0.5,
    kind: 'djShortlistPick',
    telemetry: { shortlistResolution },
  }) as ShortlistPick;
  const track = candidates.find((candidate) => candidate.id === selection.id);
  const rawSelectionReason = usableSelectionReason(shortlistSelectionReason(track, selection.selectionReason), track ?? {});
  const leaningsTieBreak = resolvedLeaningsTieBreak(
    editorialLeanings, selection.usedMusicalLeanings, selection.leaningsTieBreak,
  );
  const usedMusicalLeanings = leaningsTieBreak !== null;
  const selectionReason = shortlistReasonForLeanings(rawSelectionReason, usedMusicalLeanings, track ?? {});
  shortlistResolution.track = {
    id: selection.id,
    title: track?.title ?? null,
    artist: track?.artist ?? null,
  };
  shortlistResolution.selectionReason = selectionReason;
  shortlistResolution.usedMusicalLeanings = usedMusicalLeanings;
  shortlistResolution.leaningsTieBreak = leaningsTieBreak;
  return {
    ...selection,
    selectionReason,
    usedMusicalLeanings,
    leaningsTieBreak,
  };
}
