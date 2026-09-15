// One editorial model call over a controller-built Track Shortlist.
//
// Discovery is deliberately absent here: candidates and factual provenance are
// supplied by music/shortlist.ts. The model chooses only from their ids and
// writes the listener-facing link/transition in the existing pick shape.

import { z } from 'zod';
import { djObject, modelTolerant } from '../llm/sdk.js';
import { editorialLeaningsForPick, pickSchemaBase, pickSystem } from '../broadcast/dj-agent/schemas.js';
import type { ShortlistCandidate, ShortlistSourceRun } from './shortlist.js';

export type ShortlistPick = {
  id: string;
  selectionReason: string;
  usedMusicalLeanings: boolean;
  say: string | null;
  transition: 'normal' | 'blend' | 'sweep' | 'washout' | 'dissolve' | 'chop' | 'loop' | null;
};

export function resolvedMusicalLeaningsFlag(
  configuredLeanings: string,
  modelFlag: unknown,
  verifiedReason: unknown,
): boolean {
  return modelFlag === true
    || (configuredLeanings.trim() !== '' && /\bmusical\s+leanings\b/i.test(String(verifiedReason ?? '')));
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

const UNUSABLE_SELECTION_REASON = '[selection note unavailable]';
const QUEUE_LANGUAGE = /\b(?:next\s+up|up\s+next|coming\s+up|we(?:'|’)re\s+playing|we\s+have)\b/i;

// Native source passes are controller-run rather than model tool calls. Attach
// their compact outcome record to the editorial call so the Debug feed retains
// the familiar pick-start / pick-result reasoning trail.
export function shortlistDebugTools(sourceRuns: ShortlistSourceRun[]) {
  return sourceRuns.map(({ source, args, status, returned, accepted, elapsedMs, error }) => ({
    name: source,
    args,
    result: { status, returned, accepted, elapsedMs, ...(error ? { error } : {}) },
  }));
}

// A verified note can still be too thin to help an operator understand a
// choice. Keep a controller-written, track-specific floor without spending a
// second model call.
export function usableSelectionReason(reason: unknown, song: { artist?: unknown; title?: unknown }): string {
  const note = typeof reason === 'string' ? reason.replace(/\s+/g, ' ').trim() : '';
  if (note.length >= 24 && !QUEUE_LANGUAGE.test(note) && note !== UNUSABLE_SELECTION_REASON) return note;
  const artist = typeof song.artist === 'string' && song.artist.trim() ? song.artist.trim() : 'This artist';
  const title = typeof song.title === 'string' && song.title.trim() ? song.title.trim() : 'this track';
  return `${artist} — ${title}: selected for its fit with the current musical flow.`;
}

export function shortlistPickSchema(ids: string[]) {
  if (!ids.length) throw new Error('cannot select from an empty Track Shortlist');
  const idEnum = z.enum(ids as [string, ...string[]]).describe('the exact id of one track in the supplied Track Shortlist');
  return modelTolerant(pickSchemaBase().omit({ reason: true }).extend({
    id: idEnum,
    // Editorial only: provenance remains controller-written and must never be
    // reconstructed from the model's interpretation of the shortlist.
    selectionReason: z.string().trim().min(24).max(280).describe('private Booth Log selection note — never spoken on air. Name the selected artist and track title, then explain their musical fit in this moment. Do not introduce or announce the track, imply queue position, use first-person DJ framing, or say "next up", "coming up", "we are playing", or "we have". Never claim source names, source counts, or diagnostic facts.'),
    usedMusicalLeanings: z.boolean().optional().describe('private diagnostic flag. True only when the supplied Musical Leanings genuinely settled a close choice between otherwise suitable shortlist tracks; otherwise false. This must not change the wording of selectionReason or any on-air link.'),
  }), { objectFallbacks: { selectionReason: UNUSABLE_SELECTION_REASON } });
}

export function shortlistPickPrompt(candidates: ShortlistCandidate[], editorialLeanings = ''): string {
  const leanings = editorialLeanings.trim();
  return (leanings ? `${leanings}\n\n` : '')
    + JSON.stringify({ shortlist: candidates }, null, 2)
    + '\n\nChoose one id from this Track Shortlist. The controller has already applied the station guards. Write selectionReason as a private Booth Log note, never on-air DJ speech: name your selected artist and track title, then explain the musical fit. Do not introduce or announce the track, imply it is next in the queue, use first-person DJ framing, or say "next up", "coming up", "we are playing", or "we have". Do not name shortlist sources: the controller adds that factual hint. Set usedMusicalLeanings to true only when Musical Leanings genuinely settled a close choice; otherwise false.';
}

export async function djPick({
  candidates,
  showAt = null,
  playlistResolved = true,
  sourceRuns = [],
}: {
  candidates: ShortlistCandidate[];
  showAt?: Date | null;
  playlistResolved?: boolean;
  sourceRuns?: ShortlistSourceRun[];
}): Promise<ShortlistPick> {
  const ids = candidates.map((candidate) => candidate.id).filter((id): id is string => typeof id === 'string');
  const toolCalls = shortlistDebugTools(sourceRuns);
  // The call ring receives this nested object by reference. Populate it once
  // the chosen id is known so Debug pairs the raw model response with the
  // controller-resolved track and safe Booth reason.
  const shortlistResolution: any = {};
  const selection = await djObject({
    system: pickSystem(showAt, playlistResolved, true),
    prompt: shortlistPickPrompt(candidates, editorialLeaningsForPick(showAt)),
    schema: shortlistPickSchema(ids),
    temperature: 0.5,
    kind: 'djShortlistPick',
    telemetry: { toolCalls, steps: toolCalls.length + 1, shortlistResolution },
  }) as Omit<ShortlistPick, 'usedMusicalLeanings'> & { usedMusicalLeanings?: boolean };
  const track = candidates.find((candidate) => candidate.id === selection.id);
  const selectionReason = usableSelectionReason(shortlistSelectionReason(track, selection.selectionReason), track ?? {});
  const usedMusicalLeanings = resolvedMusicalLeaningsFlag(
    editorialLeaningsForPick(showAt), selection.usedMusicalLeanings, selectionReason,
  );
  shortlistResolution.track = {
    id: selection.id,
    title: track?.title ?? null,
    artist: track?.artist ?? null,
  };
  shortlistResolution.selectionReason = selectionReason;
  shortlistResolution.usedMusicalLeanings = usedMusicalLeanings;
  return { ...selection, selectionReason, usedMusicalLeanings };
}
