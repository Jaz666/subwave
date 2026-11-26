import { z } from 'zod';
import { beatGridProvenanceSchema } from './beat-grid.js';

const time = z.number().int().nonnegative();

export const stemBlendAdmissionRunSchema = z.object({
  mode: z.enum(['missing', 'refresh']),
  limit: z.number().int().positive().optional(),
}).strict();

export const stemBlendTailAdmissionSchema = z.object({
  version: z.literal(1),
  source: z.object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    bytes: z.number().int().positive(),
    complete: z.literal(true),
  }),
  requestedSeconds: z.number().int().min(40).max(120),
  windowStartMs: time,
  windowEndMs: time,
  musicStartMs: time.nullable(),
  musicEndMs: time.nullable(),
  cueMs: time.nullable(),
  gridStatus: z.enum(['measured', 'no-grid', 'failed']),
  beats: z.array(time),
  bars: z.array(time),
  gridProvenance: beatGridProvenanceSchema.nullable(),
}).refine(evidence => {
  const { windowStartMs, windowEndMs, musicStartMs, musicEndMs, cueMs, gridProvenance, source, bars, beats, gridStatus } = evidence;
  if (windowEndMs <= windowStartMs || windowEndMs - windowStartMs > evidence.requestedSeconds * 1000 + 1
      || (musicStartMs === null) !== (musicEndMs === null)) return false;
  if (musicStartMs !== null && musicEndMs !== null
      && (musicStartMs < windowStartMs || musicEndMs > windowEndMs || musicStartMs >= musicEndMs)) return false;
  if (cueMs !== null && (musicStartMs === null || musicEndMs === null || cueMs <= musicStartMs || cueMs >= musicEndMs)) return false;
  if (gridStatus === 'measured' && (!gridProvenance || musicEndMs === null || !bars.length || !beats.length)) return false;
  if (gridStatus === 'no-grid' && bars.length && beats.length) return false;
  if (!gridProvenance) return bars.length === 0 && beats.length === 0;
  if (gridStatus === 'failed' || gridProvenance.source?.complete !== true
      || gridProvenance.source.sha256 !== source.sha256 || gridProvenance.source.bytes !== source.bytes
      || Math.abs(gridProvenance.windowStartMs - windowStartMs) > 1
      || Math.abs(gridProvenance.windowEndMs - windowEndMs) > 1) return false;
  const ordered = (list: number[]) => list.every((ms, i) => ms >= gridProvenance.windowStartMs
    && ms <= gridProvenance.windowEndMs && (i === 0 || ms > list[i - 1]));
  const beatSet = new Set(beats);
  return ordered(beats) && ordered(bars) && bars.every(ms => beatSet.has(ms));
});

export type StemBlendTailAdmission = z.infer<typeof stemBlendTailAdmissionSchema>;

// Real bars need two measured markers. The same evidence describes shorter
// spans, and the cue and music end remain distinct options for future readers.
export function stemBlendTailBars(evidence: StemBlendTailAdmission, endMs: number | null): number {
  if (endMs === null || evidence.musicStartMs === null || evidence.gridStatus !== 'measured') return 0;
  const startMs = evidence.musicStartMs;
  return Math.max(0, evidence.bars.filter(ms => ms >= startMs && ms <= endMs).length - 1);
}
