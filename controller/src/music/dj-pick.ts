// One editorial model call over a controller-built Track Shortlist.
//
// Discovery is deliberately absent here: candidates and factual provenance are
// supplied by music/shortlist.ts. The model chooses only from their ids and
// writes the listener-facing link/transition in the existing pick shape.

import { z } from 'zod';
import { djObject, modelTolerant } from '../llm/sdk.js';
import { pickSchemaBase, pickSystem } from '../broadcast/dj-agent/schemas.js';
import type { ShortlistCandidate } from './shortlist.js';

export type ShortlistPick = {
  id: string;
  selectionReason: string;
  say: string | null;
  transition: 'normal' | 'blend' | 'sweep' | 'washout' | 'dissolve' | 'chop' | 'loop' | null;
};

function comparable(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// A model-written sentence is useful only when it identifies the very track
// that reached the queue. Corrective guards can replace the initial choice, so
// do this once at the final queue boundary rather than trusting a reason from a
// previous selection. A safe generic line is preferable to explaining Sam
// Smith with a Porcupine Tree note.
export function shortlistSelectionReason(track: any, reason: unknown): string {
  const title = comparable(track?.title);
  const artist = comparable(track?.artist);
  const note = comparable(reason);
  if (note && (!title || note.includes(title)) && (!artist || note.includes(artist))) {
    return String(reason).trim();
  }
  const identity = [track?.title, track?.artist].filter(Boolean).join(' by ');
  return identity ? `Selected "${identity}" from the eligible shortlist.` : 'Selected from the eligible shortlist.';
}

export function shortlistPickSchema(ids: string[]) {
  if (!ids.length) throw new Error('cannot select from an empty Track Shortlist');
  const idEnum = z.enum(ids as [string, ...string[]]).describe('the exact id of one track in the supplied Track Shortlist');
  return modelTolerant(pickSchemaBase().omit({ reason: true }).extend({
    id: idEnum,
    // Editorial only: provenance remains controller-written and must never be
    // reconstructed from the model's interpretation of the shortlist.
    selectionReason: z.string().describe('internal editorial reason only — max 12 words. Explain why this candidate fits the musical moment; never claim source names, source counts, or diagnostic facts.'),
  }));
}

export function shortlistPickPrompt(candidates: ShortlistCandidate[]): string {
  return JSON.stringify({ shortlist: candidates }, null, 2)
    + '\n\nChoose one id from this Track Shortlist. The controller has already applied the station guards.';
}

export async function djPick({
  candidates,
  showAt = null,
  playlistResolved = true,
}: {
  candidates: ShortlistCandidate[];
  showAt?: Date | null;
  playlistResolved?: boolean;
}): Promise<ShortlistPick> {
  const ids = candidates.map((candidate) => candidate.id).filter((id): id is string => typeof id === 'string');
  return djObject({
    system: pickSystem(showAt, playlistResolved, true),
    prompt: shortlistPickPrompt(candidates),
    schema: shortlistPickSchema(ids),
    temperature: 0.5,
    kind: 'djShortlistPick',
  }) as Promise<ShortlistPick>;
}
