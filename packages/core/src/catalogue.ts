/**
 * What a Business sells: a price for each lesson type and length, and packages of hours
 * (R-05, PAY-04, SCH-04, M5-15).
 *
 * A school's prices apply to everybody who teaches for it, and an instructor the school allows
 * may put their own price on any lesson, which wins wherever a price is shown or charged. The
 * database decides the same way (`private.effective_lesson_prices`); this is the rule for the
 * forms, and what they accept.
 */

import { z } from './zod';
import { formatPence, parsePoundsToPence } from './money.ts';
import { formatMinutes } from './time/format.ts';

/** The lesson lengths a Business offers unless it prices others (R-05). */
export const defaultLessonLengths = [60, 90, 120] as const;

/** A lesson costs £5 to £1,000, as the database allows. */
export const lessonPriceRange = { min: 500, max: 100_000 } as const;

/** A package costs £5 to £5,000 and holds half an hour to 100 hours. */
export const packageRanges = { price: { min: 500, max: 500_000 }, minutes: { min: 30, max: 6000 }, expiryDays: { min: 1, max: 1095 } } as const;

function pounds(min: number, max: number, error: string) {
  return z
    .string()
    .trim()
    .transform((value, context): number | null => {
      if (value === '') return null;
      const pence = parsePoundsToPence(value);
      if (pence === null || pence < min || pence > max) {
        context.addIssue({ code: 'custom', message: error });
        return z.NEVER;
      }
      return pence;
    });
}

const lessonLength = z
  .number()
  .int()
  .min(30)
  .max(480)
  .refine((minutes) => minutes % 15 === 0);

/** One price in the form: blank takes the lesson off, or goes back to the school's price. */
export const lessonPriceEntrySchema = z.object({
  lessonTypeId: z.uuid(),
  durationMinutes: lessonLength,
  price: pounds(lessonPriceRange.min, lessonPriceRange.max, `Enter a price between ${formatPence(lessonPriceRange.min)} and ${formatPence(lessonPriceRange.max)}`),
});

export const lessonPricesSchema = z.object({
  prices: z.array(lessonPriceEntrySchema).min(1).max(60),
});

export type LessonPriceEntry = z.output<typeof lessonPriceEntrySchema>;

/** Hours typed as 10 or 7.5, in half hours. */
const packageHours = z
  .string()
  .trim()
  .transform((value, context): number => {
    const hours = Number(value);
    const minutes = Math.round(hours * 60);
    if (value === '' || !Number.isFinite(hours) || minutes % 30 !== 0 || minutes < packageRanges.minutes.min || minutes > packageRanges.minutes.max) {
      context.addIssue({ code: 'custom', message: 'Enter the hours, from 0.5 to 100, in half hours' });
      return z.NEVER;
    }
    return minutes;
  });

export const packageSchema = z.object({
  /** Null for a package being added. */
  packageId: z.uuid().nullable(),
  name: z.string().trim().min(1, { error: 'Name the package, like 10 hours' }).max(60, { error: 'Use 60 characters or fewer' }),
  hours: packageHours,
  price: pounds(packageRanges.price.min, packageRanges.price.max, `Enter a price between ${formatPence(packageRanges.price.min)} and ${formatPence(packageRanges.price.max)}`).refine(
    (pence) => pence !== null,
    { error: 'Enter the price of the package' },
  ),
  /** Blank when the hours never run out. */
  expiryDays: z
    .string()
    .trim()
    .transform((value, context): number | null => {
      if (value === '') return null;
      const days = Number(value);
      if (!Number.isInteger(days) || days < packageRanges.expiryDays.min || days > packageRanges.expiryDays.max) {
        context.addIssue({ code: 'custom', message: 'Enter the days to use the hours in, up to 1095, or leave it blank' });
        return z.NEVER;
      }
      return days;
    }),
  onSale: z.boolean(),
});

export type PackageInput = z.output<typeof packageSchema>;

export interface PriceRow {
  lessonTypeId: string;
  lessonType: string;
  durationMinutes: number;
  /** The Business's price, or null when it does not offer this lesson. */
  businessPence: number | null;
  /** The instructor's own price, or null when they teach at the Business's. */
  ownPence: number | null;
}

/** The price that applies: the instructor's own where they have one (SCH-04). */
export function effectivePence(row: Pick<PriceRow, 'businessPence' | 'ownPence'>): number | null {
  return row.ownPence ?? row.businessPence;
}

/**
 * Every lesson a form offers a price for: each active lesson type at the usual lengths, and at any
 * other length already priced, in order of type and then length.
 */
export function priceRows(
  types: readonly { id: string; name: string }[],
  prices: readonly { lessonTypeId: string; durationMinutes: number; pricePence: number; instructorId: string | null }[],
  instructorId: string | null = null,
): PriceRow[] {
  return types.flatMap((type) => {
    const mine = prices.filter((price) => price.lessonTypeId === type.id && (price.instructorId === null || price.instructorId === instructorId));
    const lengths = [...new Set<number>([...defaultLessonLengths, ...mine.map((price) => price.durationMinutes)])].sort((a, b) => a - b);
    return lengths.map((durationMinutes) => ({
      lessonTypeId: type.id,
      lessonType: type.name,
      durationMinutes,
      businessPence: mine.find((price) => price.durationMinutes === durationMinutes && price.instructorId === null)?.pricePence ?? null,
      ownPence:
        instructorId === null
          ? null
          : (mine.find((price) => price.durationMinutes === durationMinutes && price.instructorId === instructorId)?.pricePence ?? null),
    }));
  });
}

/** "Standard lesson, 1 hour 30 minutes": what a row is called in a form. */
export function priceRowLabel(row: Pick<PriceRow, 'lessonType' | 'durationMinutes'>): string {
  return `${row.lessonType}, ${formatMinutes(row.durationMinutes)}`;
}

/** Pence as the pounds a person would type: 4200 as "42", 4250 as "42.50", nothing as blank. */
export function penceAsTyped(pence: number | null): string {
  if (pence === null) return '';
  return pence % 100 === 0 ? String(pence / 100) : (pence / 100).toFixed(2);
}
