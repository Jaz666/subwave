import { z } from 'zod';

export const SUBBEATS_EVENT_PREFIX = '[subbeats] ';
export const subbeatsStatusSchema = z.enum(['queued', 'running', 'prepared', 'unmeasurable', 'unavailable', 'failed']);
export const subbeatsJobSchema = z.object({
  id: z.string().min(1).max(200), title: z.string(), artist: z.string(), album: z.string(),
  status: subbeatsStatusSchema, attempts: z.number().int().nonnegative(),
  bundleKey: z.string().regex(/^[a-f0-9]{64}$/).nullable(), error: z.string().nullable(), updatedAt: z.string(),
});
export const subbeatsQueueSchema = z.object({
  version: z.literal(1), paused: z.boolean(), jobs: z.array(subbeatsJobSchema).max(500),
});
export const subbeatsEnqueueSchema = z.object({ ids: z.array(z.string().trim().min(1).max(200)).min(1).max(100) });
export const subbeatsPauseSchema = z.object({ paused: z.boolean() });
export const subbeatsEventSchema = z.object({
  id: z.string().min(1).max(200),
  status: subbeatsStatusSchema.exclude(['queued']),
  bundleKey: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  error: z.string().max(1000).nullable().default(null),
});
export const subbeatsCandidateSchema = z.object({
  id: z.string(), title: z.string(), artist: z.string(), album: z.string(),
  bpm: z.number().nullable(), hasBeatGrid: z.boolean(),
});
export const subbeatsCandidatePageSchema = z.object({ rows: z.array(subbeatsCandidateSchema), hasMore: z.boolean() });
export const subbeatsViewSchema = subbeatsQueueSchema.extend({
  capable: z.boolean().nullable(), maintenanceRunning: z.boolean(), progress: z.string().nullable(),
});

export const subbeatsTimelineSchema = z.object({
  duration: z.number().finite().positive().max(120),
  events: z.array(z.object({ at: z.number().finite().nonnegative().max(120), label: z.string().min(1).max(180) })).min(1).max(12),
}).refine(value => value.events[0]?.at === 0 && value.events.every((event, i) =>
  event.at <= value.duration && (i === 0 || event.at >= value.events[i - 1]!.at)), 'Invalid preview stage timing');
