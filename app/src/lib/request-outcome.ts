import type { RequestResult } from './types';

// Mirrored into app/src/lib/request-outcome.ts; both players describe the same
// controller outcomes, including older controllers without the outcome field.
export function requestResultLabel(result: Pick<RequestResult, 'pending' | 'outcome' | 'track'>): string {
  if (result.pending) return 'On the wire';
  if (result.outcome === 'cooldown') return 'Played recently';
  if (result.outcome === 'already-queued') return 'Already playing or queued';
  if (result.outcome === 'substituted') return 'Alternative queued';
  return result.track ? 'Queued' : 'Answered';
}
