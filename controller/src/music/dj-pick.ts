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

export function shortlistPickPrompt(candidates: ShortlistCandidate[], context: Record<string, unknown> = {}): string {
  return JSON.stringify({ context, shortlist: candidates }, null, 2)
    + '\n\nChoose one id from this Track Shortlist. The controller has already applied the station guards.';
}

export async function djPick({
  candidates,
  showAt = null,
  playlistResolved = true,
  context = {},
}: {
  candidates: ShortlistCandidate[];
  showAt?: Date | null;
  playlistResolved?: boolean;
  context?: Record<string, unknown>;
}): Promise<ShortlistPick> {
  const ids = candidates.map((candidate) => candidate.id).filter((id): id is string => typeof id === 'string');
  return djObject({
    system: pickSystem(showAt, playlistResolved, true),
    prompt: shortlistPickPrompt(candidates, context),
    schema: shortlistPickSchema(ids),
    temperature: 0.5,
    kind: 'djShortlistPick',
  }) as Promise<ShortlistPick>;
}
