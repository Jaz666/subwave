import { z } from 'zod';

export const SUBBEATS_PREP_V2_ALGORITHM_VERSION = 4;
import { subbeatsCueCoverageSchema, subbeatsCuePointsSchema, subbeatsLyricEvidenceSchema, subbeatsStatusSchema, subbeatsSuitabilitySchema } from './subbeats.js';

export const subbeatsPrepV2JobStatusSchema = z.enum(['queued', 'running', 'complete', 'failed', 'source-changed']);
export const subbeatsPrepV2StageSchema = z.enum(['downloading', 'analyzing', 'saving']);
export const subbeatsPrepV2RoleStatusSchema = z.enum(['pending', 'cue-ready', 'no-cue', 'failed', 'source-changed']);

export const subbeatsPrepV2RoleSchema = z.object({
  status: subbeatsPrepV2RoleStatusSchema,
  reason: z.string().max(1000).nullable(),
  cuePoints: z.array(subbeatsCuePointsSchema.shape.incoming.element).max(8),
  gridArtifact: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  coverageStartSeconds: z.number().finite().nonnegative().nullable(),
  coverageEndSeconds: z.number().finite().nonnegative().nullable(),
});

export const subbeatsPrepV2SourceSchema = z.object({
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().positive(),
  durationSeconds: z.number().finite().positive(),
});

export const subbeatsPrepV2EventSchema = z.object({
  at: z.string().datetime(),
  kind: z.enum(['info', 'success', 'warning', 'error']),
  text: z.string().max(1000),
});

export const subbeatsPrepV2DiagnosticsSchema = z.object({
  gridSource: z.enum(['cached', 'computed']),
  gridDevice: z.string().max(16),
  stageTimingsMs: z.object({
    decodeMs: z.number().int().nonnegative(),
    gridMs: z.number().int().nonnegative(),
    cueFitMs: z.number().int().nonnegative(),
    incomingFallbackMs: z.number().int().nonnegative(),
    totalAnalyzerMs: z.number().int().nonnegative(),
  }),
  incomingFallbackUsed: z.boolean(),
});

export const subbeatsPrepV2AnalyzerResultSchema = z.object({
  source: subbeatsPrepV2SourceSchema,
  diagnostics: subbeatsPrepV2DiagnosticsSchema.optional(),
  grid: z.object({
    version: z.literal(1),
    backend: z.literal('beat-this-onnx'),
    model: z.literal('small0'),
    device: z.enum(['cpu', 'gpu']).optional(),
    modelSha256: z.string().regex(/^[a-f0-9]{64}$/),
    preprocessingVersion: z.literal(1),
    sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
    sourceBytes: z.number().int().positive(),
    windowStartSeconds: z.number().finite().nonnegative(),
    windowEndSeconds: z.number().finite().positive(),
    beatsSeconds: z.array(z.number().finite().nonnegative()).min(64).max(100_000),
    downbeatsSeconds: z.array(z.number().finite().nonnegative()).min(8).max(25_000),
  }).nullable(),
  roles: z.object({
    incoming: z.object({
      status: z.enum(['cue-ready', 'no-cue', 'failed']),
      reason: z.string().max(1000).nullable(),
      cuePoints: z.array(subbeatsCuePointsSchema.shape.incoming.element).max(8),
      coverageStartSeconds: z.number().finite().nonnegative().nullable(),
      coverageEndSeconds: z.number().finite().nonnegative().nullable(),
    }),
    outgoing: z.object({
      status: z.enum(['cue-ready', 'no-cue', 'failed']),
      reason: z.string().max(1000).nullable(),
      cuePoints: z.array(subbeatsCuePointsSchema.shape.outgoing.element).max(8),
      coverageStartSeconds: z.number().finite().nonnegative().nullable(),
      coverageEndSeconds: z.number().finite().nonnegative().nullable(),
    }),
  }),
});

export const subbeatsPrepV2GridSchema = z.object({
  version: z.literal(1),
  backend: z.literal('beat-this-onnx'),
  model: z.literal('small0'),
  device: z.enum(['cpu', 'gpu']).optional(),
  modelSha256: z.string().regex(/^[a-f0-9]{64}$/),
  preprocessingVersion: z.literal(1),
  sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  sourceBytes: z.number().int().positive(),
  windowStartSeconds: z.number().finite().nonnegative(),
  windowEndSeconds: z.number().finite().positive(),
  beatsSeconds: z.array(z.number().finite().nonnegative()).min(1).max(100_000),
  downbeatsSeconds: z.array(z.number().finite().nonnegative()).min(1).max(25_000),
}).refine(value => value.windowEndSeconds > value.windowStartSeconds
  && value.beatsSeconds.every((at, index, values) => at >= value.windowStartSeconds
    && at <= value.windowEndSeconds && (index === 0 || at > values[index - 1]!))
  && value.downbeatsSeconds.every((at, index, values) => at >= value.windowStartSeconds
    && at <= value.windowEndSeconds && (index === 0 || at > values[index - 1]!)),
'V2 shared grid must be ordered and stay within its measured window.');

export const subbeatsPrepV2JobSchema = z.object({
  id: z.string().min(1).max(200),
  title: z.string(),
  artist: z.string(),
  album: z.string(),
  status: subbeatsPrepV2JobStatusSchema,
  attempts: z.number().int().nonnegative(),
  source: subbeatsPrepV2SourceSchema.nullable(),
  expectedSourceBytes: z.number().int().positive().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  stage: subbeatsPrepV2StageSchema.nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  diagnostics: subbeatsPrepV2DiagnosticsSchema.optional(),
  v1: z.object({
    status: subbeatsStatusSchema,
    attempts: z.number().int().nonnegative(),
    error: z.string().max(1000).nullable(),
    updatedAt: z.string(),
    task: z.enum(['assess', 'coverage']).nullable(),
    headSupported: z.boolean(),
    tailSupported: z.boolean(),
    preparationMethod: z.string().nullable(),
    bundleKey: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
    cuePoints: subbeatsCuePointsSchema.nullable(),
    cueCoverage: subbeatsCueCoverageSchema.nullable(),
    suitability: subbeatsSuitabilitySchema.nullable(),
    lyricEvidence: subbeatsLyricEvidenceSchema.nullable(),
  }).nullable(),
  roles: z.object({
    incoming: subbeatsPrepV2RoleSchema,
    outgoing: subbeatsPrepV2RoleSchema,
  }),
  error: z.string().max(1000).nullable(),
  updatedAt: z.string(),
});

export const subbeatsPrepV2RunSchema = z.object({
  version: z.literal(1),
  runId: z.string().regex(/^[a-f0-9-]{36}$/),
  createdAt: z.string(),
  status: z.enum(['queued', 'running', 'complete', 'paused', 'failed', 'cancelled']),
  baselineSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  scope: z.enum(['supported', 'selected', 'track', 'library', 'library-selected']).optional(),
  airplay: z.boolean().optional(),
  algorithmVersion: z.number().int().positive(),
  jobs: z.array(subbeatsPrepV2JobSchema).max(20_000),
  events: z.array(subbeatsPrepV2EventSchema).max(100).optional(),
});

export const subbeatsPrepV2RunRequestSchema = z.object({
  baselineSha256: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  scope: z.enum(['supported', 'selected', 'track', 'library', 'library-selected']).optional(),
  airplay: z.boolean().optional(),
  algorithmVersion: z.number().int().positive(),
  jobs: z.array(z.object({
    id: z.string().min(1).max(200),
    title: z.string(),
    artist: z.string(),
    album: z.string(),
    expectedSourceBytes: z.number().int().positive().optional(),
    v1: subbeatsPrepV2JobSchema.shape.v1.optional(),
    status: subbeatsStatusSchema.optional(),
    attempts: z.number().int().nonnegative().optional(),
    error: z.string().max(1000).nullable().optional(),
    updatedAt: z.string().optional(),
    task: z.enum(['assess', 'coverage']).nullable().optional(),
    headSupported: z.boolean().optional(),
    tailSupported: z.boolean().optional(),
    preparationMethod: z.string().nullable().optional(),
    bundleKey: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
    cuePoints: subbeatsCuePointsSchema.nullable().optional(),
    cueCoverage: subbeatsCueCoverageSchema.nullable().optional(),
    suitability: subbeatsSuitabilitySchema.nullable().optional(),
    lyricEvidence: subbeatsLyricEvidenceSchema.nullable().optional(),
  })).min(1).max(20_000),
}).refine(value => new Set(value.jobs.map(job => job.id)).size === value.jobs.length, 'Run recording IDs must be unique.');

export const subbeatsPrepV2CreateRequestSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('supported') }),
  z.object({
    scope: z.literal('selected'),
    ids: z.array(z.string().trim().min(1).max(200)).min(1).max(20_000),
  }).refine(value => new Set(value.ids).size === value.ids.length, 'Recording IDs must be unique.'),
  z.object({ scope: z.literal('track'), id: z.string().trim().min(1).max(200) }),
  z.object({
    scope: z.literal('library'),
    mode: z.enum(['missing', 'refresh']).optional(),
    limit: z.number().int().min(1).max(20_000).optional(),
  }),
  z.object({
    scope: z.literal('library-selected'),
    ids: z.array(z.string().trim().min(1).max(200)).min(1).max(1_000),
  }).refine(value => new Set(value.ids).size === value.ids.length, 'Recording IDs must be unique.'),
]);

export type SubbeatsPrepV2Job = z.infer<typeof subbeatsPrepV2JobSchema>;
export type SubbeatsPrepV2Run = z.infer<typeof subbeatsPrepV2RunSchema>;
