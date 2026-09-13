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
import { emailSchema, fullNameSchema, ukMobileSchema } from './auth.ts';

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

/**
 * A learner an instructor adds themselves, who has not signed up (LRN-03, M2-08).
 *
 * One way of reaching them is required, because that is how they claim the account later,
 * and it is what the duplicate check compares.
 */
export const manualLearnerSchema = z
  .object({
    fullName: fullNameSchema,
    email: z.union([z.literal('').transform(() => null), emailSchema]),
    phone: z.union([z.literal('').transform(() => null), ukMobileSchema]),
    postcode: z.union([
      z.literal('').transform(() => null),
      z
        .string()
        .trim()
        .refine(isPostcode, { error: 'Enter a UK postcode like LS1 4DY' })
        .transform((value) => normalisePostcode(value) ?? value),
    ]),
    transmission: z.union([z.literal('').transform(() => null), z.enum(['manual', 'automatic'])]),
  })
  // No path: it is not one field that is wrong, it is that neither was filled in.
  .refine((value) => value.email !== null || value.phone !== null, {
    error: 'Add an email address or a mobile number, so they can claim their account later',
  });

export type ManualLearner = z.infer<typeof manualLearnerSchema>;
