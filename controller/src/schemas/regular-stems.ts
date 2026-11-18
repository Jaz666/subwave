import { z } from 'zod';

export const regularStemStatusSchema = z.object({
  audition: z.boolean(),
  workingCache: z.boolean().default(false),
  trackLimit: z.literal(9),
  windows: z.array(z.object({
    trackId: z.string(),
    side: z.enum(['head', 'tail']),
    state: z.enum(['pending', 'running', 'ready', 'failed', 'absent']),
  })),
});
export type RegularStemStatus = z.infer<typeof regularStemStatusSchema>;
