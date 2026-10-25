import { z } from 'zod';

export const researchGapStatusSchema = z.enum(['source-not-found','partial-coverage','extraction-failed','identity-unresolved','pending','unexplored','covered','empty','stopped','related-credit']);
export type ResearchGapStatus = z.infer<typeof researchGapStatusSchema>;
export const researchGapSnapshotSchema = z.object({
  checkedAt: z.string(), libraryIndexedAt: z.string().nullable(), libraryArtists: z.number(),
  counts: z.object({attention: z.number(), pending: z.number(), unexplored: z.number(), covered: z.number(), empty: z.number(), related: z.number()}),
  items: z.array(z.object({
    id: z.string(), name: z.string(), status: researchGapStatusSchema,
    libraryArtistIds: z.array(z.string()), storyCount: z.number(), lastAttemptAt: z.string().nullable(),
    identities: z.array(z.object({id: z.string(), name: z.string(), mbid: z.string().nullable(), articleUrl: z.string().nullable(),
      storyCount: z.number(), matchedTracks: z.number(), canRetry: z.boolean()})),
  })),
});
export type ResearchGapSnapshot = z.infer<typeof researchGapSnapshotSchema>;
