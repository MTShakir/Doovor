/**
 * Private notes an instructor keeps about a learner (LRN-04, M2-06).
 *
 * The learner never sees these, so the wording is the instructor's own: the only rules are
 * that a note says something and is not a novel.
 */

import { z } from '../zod';

export const noteBodySchema = z
  .string()
  .trim()
  .min(1, { error: 'Write the note first' })
  .max(5000, { error: 'Use 5000 characters or fewer' });

export const learnerNoteSchema = z.object({
  learnerId: z.uuid({ error: 'Choose a learner' }),
  body: noteBodySchema,
});

export type LearnerNoteInput = z.infer<typeof learnerNoteSchema>;
