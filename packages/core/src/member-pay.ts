/**
 * What a school pays an instructor who teaches under it (M9-21, D-291): a rate for every hour
 * taught, or a share of each lesson's price, from a Monday on. Shared by the school's form and its
 * Server Action, and by both sides' statements.
 */

import { z } from './zod';
import { formatPence, parsePoundsToPence } from './money.ts';
import { addDaysToLocalDate, isoWeekday, isValidLocalDate } from './time/calendar.ts';

export type PayBasis = 'hourly' | 'share';

export const payBases = [
  { value: 'hourly', label: 'A rate for each hour taught' },
  { value: 'share', label: 'A share of each lesson' },
] as const;

/** £1 to £200 an hour, or 1 to 100 per cent of a lesson, as the database allows. */
export const payRanges = { hourly: { min: 100, max: 20_000 }, share: { min: 1, max: 100 } } as const;

/** The Monday of the week a date is in: pay changes from a Monday. */
export function mondayOfWeek(date: string): string {
  return addDaysToLocalDate(date, 1 - isoWeekday(date));
}

export const memberPaySchema = z
  .object({
    membershipId: z.uuid(),
    /** Empty for no pay set. */
    basis: z.enum(['', 'hourly', 'share'], { error: 'Choose how they are paid' }),
    hourly: z.string().trim().default(''),
    share: z.string().trim().default(''),
    /** Any day of the week it starts from, or empty for this week. */
    from: z.string().trim().default(''),
  })
  .transform((value, context) => {
    if (value.from !== '' && !isValidLocalDate(value.from)) {
      context.addIssue({ code: 'custom', path: ['from'], message: 'Enter a date' });
      return z.NEVER;
    }
    const fromMonday = value.from === '' ? null : mondayOfWeek(value.from);
    if (value.basis === 'hourly') {
      const pence = parsePoundsToPence(value.hourly);
      if (pence === null || pence < payRanges.hourly.min || pence > payRanges.hourly.max) {
        context.addIssue({
          code: 'custom',
          path: ['hourly'],
          message: `Enter a rate between ${formatPence(payRanges.hourly.min)} and ${formatPence(payRanges.hourly.max)} an hour`,
        });
        return z.NEVER;
      }
      return { membershipId: value.membershipId, basis: 'hourly' as const, hourlyPence: pence, sharePercent: null, fromMonday };
    }
    if (value.basis === 'share') {
      const percent = /^\d{1,3}$/.test(value.share) ? Number(value.share) : Number.NaN;
      if (!Number.isInteger(percent) || percent < payRanges.share.min || percent > payRanges.share.max) {
        context.addIssue({ code: 'custom', path: ['share'], message: 'Enter a share between 1 and 100 per cent' });
        return z.NEVER;
      }
      return { membershipId: value.membershipId, basis: 'share' as const, hourlyPence: null, sharePercent: percent, fromMonday };
    }
    return { membershipId: value.membershipId, basis: null, hourlyPence: null, sharePercent: null, fromMonday };
  });

export type MemberPay = z.output<typeof memberPaySchema>;

/** "£18 an hour", "60% of each lesson", or "No pay set". */
export function payWords(basis: PayBasis | null, hourlyPence: number | null, sharePercent: number | null): string {
  if (basis === 'hourly' && hourlyPence !== null) return `${formatPence(hourlyPence)} an hour`;
  if (basis === 'share' && sharePercent !== null) return `${String(sharePercent)}% of each lesson`;
  return 'No pay set';
}
