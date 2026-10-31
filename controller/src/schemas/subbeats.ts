import { z } from 'zod';

export const SUBBEATS_BATCH_LIMIT = 100;
export const SUBBEATS_QUEUE_LIMIT = 500;
export const SUBBEATS_PAGE_SIZE = 50;

export const SUBBEATS_EVENT_PREFIX = '[subbeats] ';
export const subbeatsStatusSchema = z.enum(['queued', 'running', 'prepared', 'unmeasurable', 'unavailable', 'failed']);
export const subbeatsJobSchema = z.object({
  id: z.string().min(1).max(200), title: z.string(), artist: z.string(), album: z.string(),
  status: subbeatsStatusSchema, attempts: z.number().int().nonnegative(),
  bundleKey: z.string().regex(/^[a-f0-9]{64}$/).nullable(), error: z.string().nullable(), updatedAt: z.string(),
});
export const subbeatsQueueSchema = z.object({
  version: z.literal(1), paused: z.boolean(), jobs: z.array(subbeatsJobSchema).max(SUBBEATS_QUEUE_LIMIT),
});
export const subbeatsEnqueueSchema = z.object({ ids: z.array(z.string().trim().min(1).max(200)).min(1).max(SUBBEATS_BATCH_LIMIT) });
export const subbeatsPauseSchema = z.object({ paused: z.boolean() });
export const subbeatsEventSchema = z.object({
  id: z.string().min(1).max(200),
  status: subbeatsStatusSchema.exclude(['queued']),
  bundleKey: z.string().regex(/^[a-f0-9]{64}$/).nullable().default(null),
  error: z.string().max(1000).nullable().default(null),
});
export const subbeatsBrowseStatusSchema = z.enum(['not-started', 'queued', 'running', 'prepared', 'unmeasurable', 'unavailable', 'failed']);
export const subbeatsSortSchema = z.enum(['recommended', 'artist-asc', 'artist-desc', 'title-asc', 'title-desc', 'album-asc', 'bpm-asc', 'bpm-desc']);
export const subbeatsBrowseQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  sort: subbeatsSortSchema.default('recommended'),
  offset: z.coerce.number().int().min(0).max(1000000).default(0),
  scope: z.enum(['dance', 'library', 'prepared']).optional(),
  genre: z.string().trim().max(200).default(''),
  status: z.union([z.literal('all'), subbeatsBrowseStatusSchema]).default('all'),
});
export const subbeatsCandidateSchema = z.object({
  id: z.string(), title: z.string(), artist: z.string(), album: z.string(),
  bpm: z.number().nullable(), hasBeatGrid: z.boolean(),
  genres: z.array(z.string()).default([]), status: subbeatsBrowseStatusSchema.default('not-started'),
});
export const subbeatsCandidatePageSchema = z.object({
  rows: z.array(subbeatsCandidateSchema).max(SUBBEATS_PAGE_SIZE), hasMore: z.boolean(),
  total: z.number().int().nonnegative(), offset: z.number().int().nonnegative(),
  genres: z.array(z.object({ value: z.string(), count: z.number().int().positive() })),
  statuses: z.array(z.object({ value: subbeatsBrowseStatusSchema, count: z.number().int().positive() })),
  selectableCount: z.number().int().nonnegative(),
  selectableRows: z.array(subbeatsCandidateSchema).max(SUBBEATS_BATCH_LIMIT),
});
export const subbeatsReferenceSchema = z.object({
  id: z.string(), introResolve: z.number().finite().positive().max(1200),
  introBars: z.array(z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)])).min(1).max(4),
  outroStart: z.number().finite().positive().max(1200),
});
export const subbeatsViewSchema = subbeatsQueueSchema.extend({
  capable: z.boolean().nullable(), maintenanceRunning: z.boolean(), progress: z.string().nullable(),
  references: z.array(subbeatsReferenceSchema).default([]),
});

export const subbeatsTimelineSchema = z.object({
  kind: z.literal('reference').optional(),
  duration: z.number().finite().positive().max(120),
  events: z.array(z.object({ at: z.number().finite().nonnegative().max(120), label: z.string().min(1).max(180) })).min(1).max(12),
}).refine(value => value.events[0]?.at === 0 && value.events.every((event, i) =>
  event.at <= value.duration && (i === 0 || event.at >= value.events[i - 1]!.at)), 'Invalid preview stage timing');

export const subbeatsPreviewSchema = z.object({
  trackIds: z.array(z.string().min(1).max(200)).length(2),
  barShift: z.number().int().min(-2).max(2).default(0),
  referenceBars: z.union([z.literal(4), z.literal(8), z.literal(16), z.literal(32)]).optional(),
});

// Kept separate from the bounded extended-preparation queue.
export const subbeatsStemPolicySchema = z.object({
  enabled: z.boolean().default(false),
  regularIds: z.array(z.string().min(1).max(200)).max(100000).default([]),
});
export const subbeatsStemPolicyPatchSchema = z.object({
  enabled: z.boolean().optional(),
  track: z.object({ id: z.string().min(1).max(200), include: z.boolean() }).optional(),
}).strict().refine(value => value.enabled !== undefined || value.track !== undefined, 'Choose a cache policy change');
export const subbeatsCacheViewSchema = z.object({
  policy: subbeatsStemPolicySchema,
  budgetBytes: z.number().nonnegative(),
  usage: z.object({ bytes: z.number().nonnegative(), dirs: z.number().nonnegative(),
    measuredAt: z.string(), fresh: z.boolean(), passRunning: z.boolean() }).nullable(),
  disk: z.object({ total: z.number().positive(), available: z.number().nonnegative() }).nullable(),
});
