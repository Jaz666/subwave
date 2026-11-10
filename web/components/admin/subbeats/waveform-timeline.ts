import type { StationState } from '../../../lib/types';

/** The forecast is live-edge time; the deck follows the listener's buffer. */
export function queuedTransition(state: StationState, currentId: string | undefined, leadMs: number) {
  const next = state.upcoming[0];
  if (!currentId || !next?.subsonic_id || next.subsonic_id === currentId) return null;
  // During listener buffering, /state can already describe a different pair.
  if (state.current?.subsonic_id && state.current.subsonic_id !== currentId) return null;
  const liveAt = Date.parse(next.airsAt ?? '');
  if (!Number.isFinite(liveAt)) return null;
  const label = state.nextTransition?.trim();
  return {
    airedAt: liveAt + Math.max(0, Number.isFinite(leadMs) ? leadMs : 0),
    label: label || 'Transition pending',
    armed: !!label,
  };
}
