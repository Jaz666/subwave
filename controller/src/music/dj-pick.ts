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
  say: string | null;
  transition: 'normal' | 'blend' | 'sweep' | 'washout' | 'dissolve' | 'chop' | 'loop' | null;
};

export type ShortlistSelectionContext = {
  currentTrack?: { id?: string | null; title?: string | null; artist?: string | null; album?: string | null } | null;
  journeyActive?: boolean;
  link?: string;
};

export function resolvedMusicalLeaningsFlag(context: EditorialLeaningsContext | null, modelFlag: unknown, verifiedReason: unknown): boolean {
  return !!context?.promptValue && (modelFlag === true || /\bmusical\s+leanings\b/i.test(String(verifiedReason ?? '')));
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

// A verified note can still be too thin to be useful in the Booth. Keep a
// controller-written, track-specific floor without spending another model call.
export function usableSelectionReason(reason: unknown, song: { artist?: unknown; title?: unknown }): string {
  const note = typeof reason === 'string' ? reason.replace(/\s+/g, ' ').trim() : '';
  if (note.length >= 24) return note;
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
    selectionReason: z.string().describe('internal editorial reason only — max 12 words. Explain why this candidate fits the musical moment; never claim source names, source counts, or diagnostic facts.'),
    usedMusicalLeanings: z.boolean().optional().describe('private diagnostic flag. True when supplied Musical Leanings materially informed this final choice among eligible tracks; otherwise false. They are a soft editorial preference and never override show rules, rotation, safety, or musical flow.'),
  }));
}

export function shortlistPickPrompt(
  candidates: ShortlistCandidate[],
  context: ShortlistSelectionContext = {},
  editorialLeanings: EditorialLeaningsContext | null = null,
): string {
  return JSON.stringify({
    context: { ...context, musicalLeanings: editorialLeanings?.promptValue ?? null },
    shortlist: candidates,
  }, null, 2)
    + '\n\nChoose one id from this Track Shortlist. The controller has already applied the station guards. Write selectionReason as a private Booth Log note: name your selected artist and track title, then explain the musical fit. Do not name shortlist sources. Use Musical Leanings, when supplied, as a soft editorial preference among already eligible tracks. They may inform the final choice without being decisive, but never override show rules, rotation, safety, or musical flow. Set usedMusicalLeanings to true when they materially informed this selection; otherwise false. In selectionReason, describe the real musical fit naturally; if relevant, you may refer to the DJ’s preferences without using a fixed phrase.';
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
  const selection = await djObject({
    system: pickSystem(showAt, playlistResolved, true, editorialLeanings),
    prompt: shortlistPickPrompt(candidates, context, editorialLeanings),
    schema: shortlistPickSchema(ids),
    temperature: 0.5,
    kind: 'djShortlistPick',
  }) as Omit<ShortlistPick, 'usedMusicalLeanings'> & { usedMusicalLeanings?: boolean };
  const track = candidates.find(candidate => candidate.id === selection.id);
  const selectionReason = usableSelectionReason(shortlistSelectionReason(track, selection.selectionReason), track ?? {});
  return {
    ...selection,
    selectionReason,
    usedMusicalLeanings: resolvedMusicalLeaningsFlag(editorialLeanings, selection.usedMusicalLeanings, selectionReason),
  };
}
