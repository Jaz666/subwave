import { z } from 'zod';

export const sparkFeedbackSchema = z.object({
  story: z.union([z.enum(['good', 'routine', 'unclear', 'incorrect', 'wrong-subject']), z.literal('').transform(() => null)]).nullable(),
  delivery: z.union([z.enum(['worked', 'forced', 'wrong-subject']), z.literal('').transform(() => null)]).nullable(),
  note: z.string().trim().max(500),
}).refine(value => value.story !== null || value.delivery !== null, {
  message: 'Choose story or delivery feedback', path: ['story'],
}).refine(value => !['unclear', 'incorrect', 'wrong-subject'].includes(value.story ?? '') || value.note.length >= 20, {
  message: 'Describe the specific problem in at least 20 characters for Review', path: ['note'],
});
