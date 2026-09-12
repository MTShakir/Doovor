/**
 * Learner onboarding (AUTH-06, M2-01).
 *
 * Five answers on one screen: what they are called, where they are, which gearbox, how far
 * along they are, and the date of birth that says they may legally learn.
 */

import { z } from 'zod';
import { isAtLeast, leastLearnerAge } from '../age.ts';
import { isPostcode, normalisePostcode } from '../postcode.ts';
import { isValidLocalDate } from '../time/calendar.ts';
import { todayInZone } from '../time/zone.ts';
import { fullNameSchema } from './auth.ts';

export const learnerTransmissions = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Automatic' },
] as const;

export const experienceLevels = [
  { value: 'none', label: 'I have never driven' },
  { value: 'some', label: 'I have had some lessons' },
  { value: 'test_booked', label: 'My test is booked' },
] as const;

export type LearnerTransmission = (typeof learnerTransmissions)[number]['value'];
export type ExperienceLevel = (typeof experienceLevels)[number]['value'];

export const learnerOnboardingSchema = z.object({
  fullName: fullNameSchema,
  postcode: z
    .string()
    .trim()
    .refine(isPostcode, { error: 'Enter a UK postcode like LS1 4DY' })
    .transform((value) => normalisePostcode(value) ?? value),
  transmission: z.enum(['manual', 'automatic']),
  experienceLevel: z.enum(['none', 'some', 'test_booked']),
  dateOfBirth: z
    .string()
    .trim()
    // Each check stands on its own: something that is not a date has no age to work out,
    // and one problem should produce one message.
    .refine(isValidLocalDate, { error: 'Enter your date of birth' })
    .refine((date) => !isValidLocalDate(date) || date > '1900-01-01', { error: 'Enter your date of birth' })
    // The rule the database keeps as well: nobody learns to drive before sixteen.
    .refine((date) => !isValidLocalDate(date) || isAtLeast(date, leastLearnerAge, todayInZone()), {
      error: 'You have to be 16 to start learning to drive',
    }),
});

export type LearnerOnboarding = z.infer<typeof learnerOnboardingSchema>;
