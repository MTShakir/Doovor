/**
 * A lesson record as the phone sends it (PRG-01, PRG-09, M4-05). Shared by the form, the route
 * that saves it and, later, the outbox that sends it when there is signal again.
 */

import { z } from 'zod';
import { isSkillCode, type SkillCode } from '../skills.ts';

export const skillRatingSchema = z.object({
  skillCode: z.custom<SkillCode>((value) => isSkillCode(value), { error: 'Choose a skill from the map' }),
  rating: z.number().int().min(1, { error: 'Rate it from 1 to 5' }).max(5, { error: 'Rate it from 1 to 5' }),
});

export const lessonRecordSchema = z.object({
  /** Made on the phone when the record is started, so sending it twice saves it once. */
  id: z.uuid(),
  bookingId: z.uuid(),
  ratings: z
    .array(skillRatingSchema)
    .min(1, { error: 'Tap at least one skill you covered' })
    .max(23)
    .refine((ratings) => new Set(ratings.map((one) => one.skillCode)).size === ratings.length, {
      error: 'Rate each skill once',
    }),
  summary: z.string().trim().min(1, { error: 'Write a line about the lesson' }).max(500, { error: 'Keep it to 500 characters' }),
  nextFocus: z.string().trim().max(300, { error: 'Keep it to 300 characters' }).default(''),
  homework: z.string().trim().max(500, { error: 'Keep it to 500 characters' }).default(''),
  /** From opening the form to saving it: PRG-01 promises under a minute. */
  secondsTaken: z.number().int().min(0).max(86400).optional(),
});

export type LessonRecordInput = z.input<typeof lessonRecordSchema>;
export type LessonRecord = z.output<typeof lessonRecordSchema>;
