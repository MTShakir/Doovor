/**
 * Instructor onboarding, one schema per step (AUTH-04, M1-02).
 *
 * Shared by the client form and the Server Action so the same rules decide both, and later by
 * the mobile app. Steps added in M1-05 onwards join this file.
 */

import { z } from 'zod';
import { isPostcode, normalisePostcode } from '../postcode.ts';
import { isValidLocalDate } from '../time/calendar.ts';
import { todayInZone } from '../time/zone.ts';
import { fullNameSchema } from './auth.ts';

/** Step 1: the name learners see, and the photo shown beside it (INS-01). */
export const onboardingNameSchema = z.object({
  fullName: fullNameSchema,
  /**
   * Where the prepared picture was stored. Absent means the photo is unchanged, null removes
   * it. The server checks the path belongs to the caller before saving it.
   */
  photoPath: z.string().max(200).nullish(),
});

export type OnboardingName = z.infer<typeof onboardingNameSchema>;

export const qualificationSchema = z.enum(['adi', 'pdi']);
export type Qualification = z.infer<typeof qualificationSchema>;

/**
 * The number printed on the badge. The DVSA issues digits, but the field is kept wide enough
 * for a badge that does not match what we expect rather than turning a real instructor away
 * (D-056). A person checks it against the register before the tick is granted.
 */
export const badgeNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{4,12}$/, { error: 'Enter the number printed on your badge' });

/** Step 2: ADI or PDI badge and DBS (INS-02). */
export const onboardingBadgeSchema = z.object({
  qualification: qualificationSchema,
  badgeNumber: badgeNumberSchema,
  badgeExpiry: z
    .string()
    .trim()
    .refine(isValidLocalDate, { error: 'Enter the expiry date on your badge' })
    .refine((date) => date > todayInZone(), { error: 'That date has passed. Renew your badge first' }),
  /** Teaching a learner requires a current enhanced check, so this cannot be left unticked. */
  dbsConfirmed: z.boolean().refine((confirmed) => confirmed, { error: 'Confirm your enhanced DBS check' }),
  /** Where the badge photo was stored, in the private bucket. */
  badgePath: z.string().max(200).nullish(),
});

export type OnboardingBadge = z.infer<typeof onboardingBadgeSchema>;

/** How far an instructor will travel, in miles (COV-01, PRD 11.1). */
export const radiusMilesSchema = z.coerce
  .number({ error: 'Choose how far you travel' })
  .int()
  .min(1, { error: 'Choose at least 1 mile' })
  .max(30, { error: 'Choose 30 miles or fewer' });

export const defaultRadiusMiles = 8;

/** Step 3: where lessons start from, and how far out they go (COV-01). */
export const onboardingAreaSchema = z.object({
  postcode: z
    .string()
    .trim()
    .refine(isPostcode, { error: 'Enter a UK postcode like LS1 4DY' })
    .transform((value) => normalisePostcode(value) ?? value),
  radiusMiles: radiusMilesSchema,
});

export type OnboardingArea = z.infer<typeof onboardingAreaSchema>;
