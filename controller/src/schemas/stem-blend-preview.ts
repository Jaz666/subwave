import { z } from 'zod';

export const stemBlendPreviewModeSchema = z.enum(['mix', 'clip', 'outgoing', 'incoming']);
export const stemBlendPreviewRequestSchema = z.object({
  trackIds: z.tuple([z.string().min(1).max(200), z.string().min(1).max(200)])
    .refine(ids => ids[0] !== ids[1], 'Choose two different tracks.'),
  mode: stemBlendPreviewModeSchema.default('mix'),
});
export const stemBlendPreviewReportSchema = z.object({
  version: z.literal(1), mode: stemBlendPreviewModeSchema,
  clipSec: z.number().positive(), beforeSec: z.number().nonnegative(), afterSec: z.number().nonnegative(),
  durationSec: z.number().positive(), blendStartSec: z.number().nonnegative(),
  loopStartSec: z.number().nonnegative(), loopEndSec: z.number().positive(),
  carryStartSec: z.number().nonnegative(), incomingDrumsSec: z.number().positive(),
  loopSourceRmsDb: z.number().nullable(), loopDuckDb: z.number(), wholeGainDb: z.number(),
  gainsDb: z.tuple([z.number(), z.number()]),
  barLevels: z.array(z.object({ startSec: z.number(), endSec: z.number(),
    outgoingDb: z.number().nullable(), incomingDb: z.number().nullable(), differenceDb: z.number().nullable() })),
  warnings: z.array(z.string()),
});
export const stemBlendPreviewTracksSchema = z.object({
  total: z.number(), offset: z.number(),
  rows: z.array(z.object({ id: z.string(), title: z.string(), artist: z.string(),
    head: z.boolean(), tail: z.boolean(), headGrid: z.boolean(), tailGrid: z.boolean() })),
});
