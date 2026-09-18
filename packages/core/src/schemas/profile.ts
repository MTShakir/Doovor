/**
 * The instructor profile a learner reads before booking (INS-01, M1-11).
 *
 * Shared by the editor and the Server Action, so the same rules decide both. The badge
 * fields are not here: they are set by a submission that a person reviews (INS-02, M1-04).
 */

import { z } from '../zod';
import { fullNameSchema } from './auth.ts';

/** The list the database accepts, with the words a person would use (PRD 9.2). */
export const specialisms = [
  { value: 'nervous_drivers', label: 'Nervous drivers' },
  { value: 'intensive_courses', label: 'Intensive courses' },
  { value: 'pass_plus', label: 'Pass Plus' },
  { value: 'motorway', label: 'Motorway' },
  { value: 'refresher', label: 'Refresher' },
  { value: 'test_prep', label: 'Test preparation' },
] as const;

export type Specialism = (typeof specialisms)[number]['value'];

/**
 * Languages offered as chips (D-060). Anything the database accepts is a string, so this list
 * only decides what is easy to pick; it starts from the languages most spoken in the United
 * Kingdom after English, plus British Sign Language.
 */
export const languages = [
  'English',
  'Polish',
  'Punjabi',
  'Urdu',
  'Bengali',
  'Gujarati',
  'Arabic',
  'Romanian',
  'Portuguese',
  'Spanish',
  'French',
  'Welsh',
  'British Sign Language',
] as const;

export const transmissions = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Automatic' },
  { value: 'both', label: 'Manual and automatic' },
] as const;

export type Transmission = (typeof transmissions)[number]['value'];

const specialismValues = specialisms.map((item) => item.value) as [Specialism, ...Specialism[]];

export const instructorProfileSchema = z.object({
  displayName: fullNameSchema.pipe(z.string().max(80, { error: 'Use 80 characters or fewer' })),
  /** 300 characters, as the PRD asks. Empty is allowed: a bio can wait. */
  bio: z.string().trim().max(300, { error: 'Use 300 characters or fewer' }),
  languages: z
    .array(z.string().trim().min(1).max(40))
    .min(1, { error: 'Choose at least one language' })
    .max(8, { error: 'Choose up to 8 languages' }),
  /** Left empty means they would rather not say, which is not the same as none. */
  yearsTeaching: z
    .string()
    .trim()
    .transform((value, context) => {
      if (value === '') return null;
      const years = Number(value);
      if (!Number.isInteger(years) || years < 0 || years > 70) {
        context.addIssue({ code: 'custom', message: 'Enter a whole number of years, up to 70' });
        return z.NEVER;
      }
      return years;
    }),
  transmission: z.enum(['manual', 'automatic', 'both']),
  carMake: z.string().trim().max(40, { error: 'Use 40 characters or fewer' }),
  carModel: z.string().trim().max(40, { error: 'Use 40 characters or fewer' }),
  /** A learner car has them, and PRD 9.2 says so, but a school car being checked may not yet. */
  dualControls: z.boolean(),
  specialisms: z.array(z.enum(specialismValues)).max(specialismValues.length),
});

export type InstructorProfile = z.infer<typeof instructorProfileSchema>;
