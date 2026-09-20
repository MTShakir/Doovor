/**
 * The dates a dashboard adds its figures up over (ADM-01, D-171): today, this week, this month,
 * the last 30 days, this UK tax year, or days somebody typed.
 *
 * Ranges are local dates in London, from the first day to the last, and become instants only at
 * the edges, the way the money dashboard's periods do (MNY-01). The named ones the two screens
 * share are worked out in one place, so "this week" means the same on both.
 */

import { moneyPeriod } from './money-periods.ts';
import { addDaysToLocalDate, isValidLocalDate, type LocalDate } from './time/calendar.ts';
import { formatCalendarDate } from './time/format.ts';

export type StatsRangeKey = 'today' | 'week' | 'month' | 'last_30_days' | 'tax_year' | 'custom';

/** The ranges with a button of their own, in the order the buttons are shown. */
export const statsRangeKeys = ['today', 'week', 'month', 'last_30_days', 'tax_year'] as const;

export type NamedRangeKey = (typeof statsRangeKeys)[number];

const labels: Record<NamedRangeKey, string> = {
  today: 'Today',
  week: 'This week',
  month: 'This month',
  last_30_days: 'Last 30 days',
  tax_year: 'Tax year',
};

export interface StatsRange {
  key: StatsRangeKey;
  /** First day, included. */
  from: LocalDate;
  /** Last day, included. */
  to: LocalDate;
  /** What the button says: "This week". */
  label: string;
  /** The days in words: "Mon 14 Sep 2026 to Sun 20 Sep 2026". */
  range: string;
}

/** One day as the day, longer as first to last. */
export function rangeInWords(from: LocalDate, to: LocalDate): string {
  return from === to ? formatCalendarDate(from) : `${formatCalendarDate(from)} to ${formatCalendarDate(to)}`;
}

/** One of the named ranges, around a day. */
export function statsRange(key: NamedRangeKey, today: LocalDate): StatsRange {
  const days =
    key === 'today'
      ? { from: today, to: today }
      : key === 'last_30_days'
        ? { from: addDaysToLocalDate(today, -29), to: today }
        : moneyPeriod(key === 'tax_year' ? 'tax_year' : key, today);
  return { key, from: days.from, to: days.to, label: labels[key], range: rangeInWords(days.from, days.to) };
}

/** Days somebody typed, read the way round they meant them. Null when either is not a date. */
export function customRange(from: string, to: string): StatsRange | null {
  if (!isValidLocalDate(from) || !isValidLocalDate(to)) return null;
  const [first, last] = from <= to ? [from, to] : [to, from];
  const words = rangeInWords(first, last);
  return { key: 'custom', from: first, to: last, label: words, range: words };
}

/** The range an address asks for: days typed, a named range, or the last 30 days. */
export function rangeFromParams(
  params: { range?: string | undefined; from?: string | undefined; to?: string | undefined },
  today: LocalDate,
): StatsRange {
  if (params.from !== undefined && params.to !== undefined) {
    const typed = customRange(params.from, params.to);
    if (typed) return typed;
  }
  const named = statsRangeKeys.find((key) => key === params.range);
  return statsRange(named ?? 'last_30_days', today);
}
