// One admission rule for routine writes, planned writes and backfill. This is
// evidence for caching, not approval of a transition between any two tracks.
import { subbeatsDanceGenresFromJson } from './subbeats-eligibility.js';

function parse(value: unknown): unknown {
  try { return typeof value === 'string' ? JSON.parse(value) : null; } catch { return null; }
}

function usableBars(value: unknown, durationMs?: number): boolean {
  return Array.isArray(value) && value.length >= 2 && value.every((bar, i) =>
    typeof bar === 'number' && Number.isFinite(bar) && bar >= 0
    && (durationMs === undefined || bar <= durationMs) && (i === 0 || bar > value[i - 1]));
}

// SQLite calls this exact function, so the scan and per-track gate cannot drift.
export function stemCacheEligible(genres: unknown, bpm: unknown, bars: unknown, outro: unknown, duration: unknown): number {
  if (!subbeatsDanceGenresFromJson(genres) || typeof bpm !== 'number' || !Number.isFinite(bpm) || bpm < 90 || bpm > 180) return 0;
  const durationMs = typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration * 1000 : undefined;
  if (usableBars(parse(bars), durationMs)) return 1;
  const tail = parse(outro);
  if (!tail || typeof tail !== 'object' || durationMs === undefined) return 0;
  const value = tail as Record<string, unknown>;
  return Number(['fade', 'cold'].includes(String(value.ending))
    && typeof value.startMs === 'number' && Number.isFinite(value.startMs)
    && value.startMs >= 0 && value.startMs < durationMs && usableBars(value.bars, durationMs));
}
