import type { StationState } from '../../../lib/types';

/** Sub/Beats metadata changes at incoming entry, inside the rendered clip. */
export function stemTransitionWindow(
  stem: { kind: 'subbeats' | 'stem-blend'; durationSec: number; incomingAtSec: number; incomingAiredAt?: string },
  forecastAt: number | undefined,
  leadMs: number,
) {
  const liveEntry = Date.parse(stem.incomingAiredAt ?? '');
  const entryAt = Number.isFinite(liveEntry) ? liveEntry + Math.max(0, leadMs) : forecastAt;
  if (entryAt == null || !Number.isFinite(entryAt) || !(stem.durationSec > 0)) return null;
  const offset = stem.kind === 'subbeats' ? stem.incomingAtSec : stem.durationSec;
  const startAt = entryAt - offset * 1000;
  return { startAt, endAt: startAt + stem.durationSec * 1000 };
}

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
