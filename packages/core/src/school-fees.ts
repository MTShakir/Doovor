/**
 * What a linked instructor pays the school that sends them pupils (M9-11, D-287): a fee every
 * week or every month from a date, perhaps after some free weeks, and a fee for each pupil the
 * school introduces. The platform keeps the record; it collects nothing yet (M9-14).
 *
 * Shared by the school's form and its Server Action, and by both sides' statements.
 */

import { z } from './zod';
import { formatPence, parsePoundsToPence } from './money.ts';
import { addDaysToLocalDate, isValidLocalDate, type LocalDate } from './time/calendar.ts';

export const feePeriods = [
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
] as const;
export type FeePeriod = (typeof feePeriods)[number]['value'];

/** A fee is £1 to £2,000, a fee for a pupil £1 to £500, and at most a year of weeks is free. */
export const feeRanges = { fee: { min: 100, max: 200_000 }, pupilFee: { min: 100, max: 50_000 }, freeWeeks: { max: 52 } } as const;

function optionalPounds(min: number, max: number) {
  return z
    .string()
    .trim()
    .transform((value, context): number | null => {
      if (value === '') return null;
      const pence = parsePoundsToPence(value);
      if (pence === null || pence < min || pence > max) {
        context.addIssue({ code: 'custom', message: `Enter an amount between ${formatPence(min)} and ${formatPence(max)}` });
        return z.NEVER;
      }
      return pence;
    });
}

export const schoolFeeTermsSchema = z
  .object({
    linkId: z.uuid(),
    /** Empty for no weekly or monthly fee: a school may charge for pupils alone. */
    period: z.enum(['', 'weekly', 'monthly'], { error: 'Choose how often' }),
    fee: optionalPounds(feeRanges.fee.min, feeRanges.fee.max),
    startsOn: z
      .string()
      .trim()
      .refine((value) => value === '' || isValidLocalDate(value), { error: 'Enter a date' }),
    freeWeeks: z
      .string()
      .trim()
      .regex(/^\d{0,2}$/, { error: 'Enter a number of weeks, like 2' })
      .transform((value) => (value === '' ? 0 : Number(value)))
      .pipe(z.number().max(feeRanges.freeWeeks.max, { error: `Enter ${String(feeRanges.freeWeeks.max)} weeks or fewer` })),
    pupilFee: optionalPounds(feeRanges.pupilFee.min, feeRanges.pupilFee.max),
  })
  .superRefine((terms, context) => {
    if (terms.period === '') return;
    if (terms.fee === null) context.addIssue({ code: 'custom', path: ['fee'], message: 'Enter the fee' });
    if (terms.startsOn === '') context.addIssue({ code: 'custom', path: ['startsOn'], message: 'Choose when the fees start' });
  });

export type SchoolFeeTermsInput = z.input<typeof schoolFeeTermsSchema>;

/** How a fee was settled: paid outside the platform, written off, or back to owed after a mistake. */
export const settleFeeSchema = z.object({
  feeId: z.uuid(),
  outcome: z.enum(['paid', 'written_off', 'owed']),
  note: z.string().trim().max(200, { error: 'Use 200 characters or fewer' }).default(''),
});

/** The day the first fee falls due: the start, after any free weeks. */
export function firstFeeOn(startsOn: LocalDate, freeWeeks: number): LocalDate {
  return addDaysToLocalDate(startsOn, freeWeeks * 7);
}

export interface FeeTerms {
  period: FeePeriod | null;
  feePence: number | null;
  startsOn: LocalDate | null;
  freeWeeks: number;
  pupilFeePence: number | null;
}

/**
 * The terms in words, a line each, for both the school and the instructor. Dates are passed in
 * already written, as a page that is built ahead of time may not read them.
 */
export function feeTermsWords(terms: FeeTerms, firstFeeDate: string | null): string[] {
  const lines: string[] = [];
  if (terms.period !== null && terms.feePence !== null) {
    const every = terms.period === 'weekly' ? 'a week' : 'a month';
    const free = terms.freeWeeks === 0 ? '' : `, after ${terms.freeWeeks === 1 ? '1 free week' : `${String(terms.freeWeeks)} free weeks`}`;
    lines.push(`${formatPence(terms.feePence)} ${every}, the first due ${firstFeeDate ?? 'soon'}${free}`);
  }
  if (terms.pupilFeePence !== null) lines.push(`${formatPence(terms.pupilFeePence)} for each pupil the school introduces`);
  if (lines.length === 0) lines.push('No fees');
  return lines;
}
