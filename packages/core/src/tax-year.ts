/**
 * The UK tax year, and the quarters Making Tax Digital reports in (MNY-04, D-198).
 *
 * A tax year runs 6 April to 5 April and is named by the year it starts in. Its four standard
 * quarterly periods run from the 6th to the 5th as well, which is the default: a business may
 * elect calendar quarters instead, and that election is not offered here.
 *
 * Everything is a local date in London. Turning a period into instants is `periodInstants` in
 * money-periods, so one rule about midnight and British Summer Time serves both.
 */

import { taxYearStarting } from './money-periods.ts';
import { formatLocalDate, parseLocalDate, type LocalDate } from './time/calendar.ts';
import { formatCalendarDate } from './time/format.ts';

export interface TaxYear {
  /** The year it begins in: 2026 means 6 April 2026 to 5 April 2027. */
  starts: number;
  /** First day, included. */
  from: LocalDate;
  /** Last day, included. */
  to: LocalDate;
  /** "2026 to 2027". */
  label: string;
  /** "6 Apr 2026 to Mon 5 Apr 2027". */
  range: string;
}

/** The tax year that begins in a given year. */
export function taxYear(starts: number): TaxYear {
  const from = formatLocalDate(starts, 4, 6);
  const to = formatLocalDate(starts + 1, 4, 5);
  return {
    starts,
    from,
    to,
    label: `${String(starts)} to ${String(starts + 1)}`,
    range: `${formatCalendarDate(from)} to ${formatCalendarDate(to)}`,
  };
}

/** The tax year a day falls in. */
export function taxYearFor(date: LocalDate): TaxYear {
  return taxYear(taxYearStarting(date));
}

export type QuarterNumber = 1 | 2 | 3 | 4;

export interface MtdQuarter {
  quarter: QuarterNumber;
  /** The tax year it belongs to, by the year that year begins in. */
  taxYearStarts: number;
  from: LocalDate;
  to: LocalDate;
  /** "Quarter 1". */
  label: string;
  /** "6 Apr 2026 to Sun 5 Jul 2026". */
  range: string;
}

const quarterStarts: readonly { month: number; yearOffset: number }[] = [
  { month: 4, yearOffset: 0 },
  { month: 7, yearOffset: 0 },
  { month: 10, yearOffset: 0 },
  { month: 1, yearOffset: 1 },
];

/** The four standard quarterly periods of a tax year, in order. */
export function mtdQuarters(starts: number): MtdQuarter[] {
  return quarterStarts.map((quarter, index) => {
    const next = quarterStarts[(index + 1) % 4] ?? quarterStarts[0];
    const from = formatLocalDate(starts + quarter.yearOffset, quarter.month, 6);
    // The day before the next quarter opens, which for the last one is 5 April.
    const toYear = index === 3 ? starts + 1 : starts + (next?.yearOffset ?? 0);
    const to = formatLocalDate(toYear, next?.month ?? 4, 5);
    return {
      quarter: (index + 1) as QuarterNumber,
      taxYearStarts: starts,
      from,
      to,
      label: `Quarter ${String(index + 1)}`,
      range: `${formatCalendarDate(from)} to ${formatCalendarDate(to)}`,
    };
  });
}

/** The quarterly period a day falls in. */
export function mtdQuarterFor(date: LocalDate): MtdQuarter {
  const starts = taxYearStarting(date);
  const quarters = mtdQuarters(starts);
  const found = quarters.find((one) => date >= one.from && date <= one.to);
  // Every day of a tax year is in one of its four quarters, so this cannot be missed.
  if (!found) throw new RangeError(`${date} is in no quarter of the ${String(starts)} tax year`);
  return found;
}

/**
 * Turnover at or above which the short self-employment pages are not enough and the full ones are
 * used instead. Held in pence, like every other amount.
 */
export const sa103ShortLimitPence = 9_000_000;

export type Sa103Form = 'short' | 'full';

/**
 * Which self-employment pages a return uses. HMRC sets the threshold by tax year; it has been
 * ninety thousand pounds since 2023 to 2024, and a year before that is not offered here.
 */
export function sa103Form(turnoverPence: number): Sa103Form {
  return turnoverPence >= sa103ShortLimitPence ? 'full' : 'short';
}

/** Whether a day is one the app will keep books for: the first tax year it supports is 2023. */
export function isSupportedTaxYear(starts: number): boolean {
  return Number.isInteger(starts) && starts >= 2023 && starts <= 2100;
}

/** The tax years to offer, newest first, up to and including the one a day falls in. */
export function taxYearsUpTo(date: LocalDate, count = 4): TaxYear[] {
  const latest = taxYearStarting(date);
  const years: TaxYear[] = [];
  for (let starts = latest; starts > latest - count && isSupportedTaxYear(starts); starts -= 1) {
    years.push(taxYear(starts));
  }
  return years;
}

/** Re-exported so a caller needs one module for "which tax year is this". */
export { taxYearStarting, parseLocalDate };
