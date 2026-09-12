/**
 * Instructor onboarding, one schema per step (AUTH-04, M1-02).
 *
 * Shared by the client form and the Server Action so the same rules decide both, and later by
 * the mobile app. Steps added in M1-05 onwards join this file.
 */

import { z } from 'zod';
import { parsePoundsToPence } from '../money.ts';
import { isPostcode, normalisePostcode } from '../postcode.ts';
import { isValidLocalDate, isValidLocalTime, localTimeToMinutes } from '../time/calendar.ts';
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

/** Prices are typed in pounds and stored in pence (CLAUDE.md rule 3). */
function priceInPence(low: number, high: number, error: string) {
  return z
    .string()
    .trim()
    .transform((value, context) => {
      const pence = parsePoundsToPence(value);
      if (pence === null || pence < low || pence > high) {
        context.addIssue({ code: 'custom', message: error });
        return z.NEVER;
      }
      return pence;
    });
}

/** The package the PRD names: ten hours bought in one go (PAY-04). */
export const packageHours = 10;

/** Step 4: what an hour costs, and what ten hours cost (R-05, PAY-04). */
export const onboardingPricesSchema = z.object({
  hourlyPrice: priceInPence(500, 50000, 'Enter an hourly price between £5 and £500'),
  packagePrice: z.union([
    z.literal('').transform(() => null),
    priceInPence(500, 500000, 'Enter a package price between £5 and £5000'),
  ]),
});

export type OnboardingPrices = z.infer<typeof onboardingPricesSchema>;

/** Monday is 1 and Sunday is 7, as ISO says and as the database stores it. */
export const weekdays = [
  { value: 1, short: 'Mon', long: 'Monday' },
  { value: 2, short: 'Tue', long: 'Tuesday' },
  { value: 3, short: 'Wed', long: 'Wednesday' },
  { value: 4, short: 'Thu', long: 'Thursday' },
  { value: 5, short: 'Fri', long: 'Friday' },
  { value: 6, short: 'Sat', long: 'Saturday' },
  { value: 7, short: 'Sun', long: 'Sunday' },
] as const;

export const defaultWorkingDays = [1, 2, 3, 4, 5];
export const defaultWorkingHours = { startTime: '09:00', endTime: '18:00' } as const;

const localTime = z.string().trim().refine(isValidLocalTime, { error: 'Enter a time like 09:00' });

/**
 * Step 5: the week an instructor works (DIA-01). Onboarding asks for one pair of times across
 * the days they choose; different times per day are set in the full editor later (M1-17).
 * Times are local wall clock, never instants: 09:00 stays 09:00 through a clock change.
 */
export const onboardingHoursSchema = z
  .object({
    days: z
      .array(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6), z.literal(7)]))
      .min(1, { error: 'Choose at least one day' }),
    startTime: localTime,
    endTime: localTime,
  })
  .refine(
    (value) =>
      // A time that is not a time already has its own message; do not add a second one.
      !isValidLocalTime(value.startTime) ||
      !isValidLocalTime(value.endTime) ||
      localTimeToMinutes(value.endTime) > localTimeToMinutes(value.startTime),
    { error: 'The finish time has to be after the start time', path: ['endTime'] },
  );

export type OnboardingHours = z.infer<typeof onboardingHoursSchema>;
