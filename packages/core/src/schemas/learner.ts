/**
 * Learner onboarding (AUTH-06, M2-01).
 *
 * Five answers on one screen: what they are called, where they are, which gearbox, how far
 * along they are, and the date of birth that says they may legally learn.
 */

import { z } from '../zod';
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
  // Asked at sign-up, answered only if they want to (LRN-02, D-180). Nothing chosen comes through
  // as an empty string from the browser, which is no answer rather than a wrong one.
  hasDisability: z.preprocess((value) => (value === '' ? undefined : value), z.enum(['yes', 'no']).optional()),
  disabilityDetails: z.string().trim().max(1000, { error: 'Use 1000 characters or fewer' }).optional(),
}).refine((answers) => answers.hasDisability !== 'yes' || (answers.disabilityDetails ?? '') !== '', {
  error: 'Say what would help, so your instructor can plan for it',
  path: ['disabilityDetails'],
});

/**
 * What a learner chooses to tell us about a disability (LRN-02, D-180). Answering is their choice,
 * so nothing here is required until they pick one; saying yes without saying what would help
 * leaves their instructor none the wiser, so that much is asked for.
 */
export const learnerHealthSchema = z
  .object({
    hasDisability: z.enum(['yes', 'no']),
    details: z.string().trim().max(1000, { error: 'Use 1000 characters or fewer' }).optional(),
  })
  .refine((answer) => answer.hasDisability === 'no' || (answer.details ?? '') !== '', {
    error: 'Say what would help, so your instructor can plan for it',
    path: ['details'],
  });

export type LearnerHealth = z.infer<typeof learnerHealthSchema>;

/**
 * Medication that could affect their driving (LRN-02, D-183). We ask for the detail only where
 * there is something to say, because medication that does not affect driving is none of our
 * business and we would rather not be told about it.
 */
export const learnerMedicationSchema = z
  .object({
    takesMedication: z.enum(['yes', 'no']),
    details: z.string().trim().max(1000, { error: 'Use 1000 characters or fewer' }).optional(),
  })
  .refine((answer) => answer.takesMedication === 'no' || (answer.details ?? '') !== '', {
    error: 'Say what it is, so your instructor knows what to watch for',
    path: ['details'],
  });

export type LearnerMedication = z.infer<typeof learnerMedicationSchema>;

/** A theory pass lasts two years, so the question is about the last two years (LRN-02, D-183). */
export const theoryAnswers = [
  { value: 'passed', label: 'Yes, passed within the last 2 years' },
  { value: 'not_yet', label: 'Not yet' },
] as const;

export const learnerTheorySchema = z.object({ theory: z.enum(['passed', 'not_yet']) });

/** The gearbox their lessons are in, which is the one they will take the test in (LRN-02). */
export const learnerGearboxSchema = z.object({ transmission: z.enum(['manual', 'automatic']) });

/**
 * The getting-started questions (LRN-02, D-183), in the order they are asked. Each one may be
 * skipped, and each one is on the learner's Account afterwards, so skipping loses nothing.
 */
export const setupSteps = ['pickup', 'disability', 'gearbox', 'medication', 'theory'] as const;

export type SetupStep = (typeof setupSteps)[number];

export const setupStepSchema = z.object({ step: z.enum(setupSteps) });

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
