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
    + '\n\nChoose one id from this Track Shortlist. The controller has already applied the station guards. If context includes Musical Leanings, use them only to break a close tie between otherwise suitable candidates; never override the shortlist, show rules, rotation, safety, or the musical flow. A Guest Musical Leaning is weaker than the host\'s. Name the guest naturally in selectionReason only when their preference genuinely breaks that close tie; otherwise do not mention it.';
}

export function shortlistRepickPrompt(
  candidates: ShortlistCandidate[],
  reason: string,
  context: Record<string, unknown> = {},
): string {
  return JSON.stringify({ context, shortlist: candidates }, null, 2)
    + `\n\n${reason} Choose one id from the supplied alternative Track Shortlist only. The controller has already applied the station guards; do not discover or suggest another track. If context includes Musical Leanings, use them only to break a close tie and never to override this alternative subset. A Guest Musical Leaning is weaker than the host's; name that guest naturally in selectionReason only if it genuinely breaks the tie.`;
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

// A corrective editorial choice for the artist-variety guard. The caller has
// already removed every disallowed artist from this subset, so this call must
// neither rediscover nor receive the wider shortlist.
export async function djShortlistRepick({
  candidates,
  reason,
  showAt = null,
  playlistResolved = true,
  context = {},
}: {
  candidates: ShortlistCandidate[];
  reason: string;
  showAt?: Date | null;
  playlistResolved?: boolean;
  context?: Record<string, unknown>;
}): Promise<ShortlistPick | null> {
  const ids = candidates.map((candidate) => candidate.id).filter((id): id is string => typeof id === 'string');
  try {
    return await djObject({
      system: pickSystem(showAt, playlistResolved, true),
      prompt: shortlistRepickPrompt(candidates, reason, context),
      schema: shortlistPickSchema(ids),
      temperature: 0.5,
      kind: 'djShortlistRepick',
    }) as ShortlistPick;
  } catch {
    return null;
  }
}
