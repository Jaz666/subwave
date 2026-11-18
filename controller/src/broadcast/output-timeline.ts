type TrackStamp = { subsonic_id?: unknown; timestamp?: unknown };
type OutputStamp = { subsonic_id?: unknown; startedAtMs?: unknown };

/** Use the final shared-mix timestamp only for the matching, newly emitted track. */
export function outputStartedAt(track: TrackStamp, output: OutputStamp): number | undefined {
  const startedAtMs = Number(output.startedAtMs);
  const metadataAtMs = Number(track.timestamp) * 1000;
  if (typeof track.subsonic_id !== 'string' || output.subsonic_id !== track.subsonic_id
    || !Number.isFinite(startedAtMs) || !Number.isFinite(metadataAtMs)
    || Math.abs(startedAtMs - metadataAtMs) > 5000) return undefined;
  return startedAtMs;
}
