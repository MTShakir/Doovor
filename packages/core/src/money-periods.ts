/**
 * The periods the money dashboard adds up over (MNY-01, M3-21): this week, this month, and this
 * UK tax year, which runs from 6 April to 5 April.
 *
 * Periods are local dates in London, from the first day to the last, and turned into instants
 * only at the edges, so a payment at 00:30 on 6 April in British Summer Time falls in the new tax
 * year even though it is still 5 April in UTC.
 */

import { addDaysToLocalDate, formatLocalDate, isoWeekday, parseLocalDate, type LocalDate } from './time/calendar.ts';
import { formatCalendarDate } from './time/format.ts';
import { DEFAULT_TIME_ZONE, localToUtc } from './time/zone.ts';

export type MoneyPeriodKey = 'week' | 'month' | 'tax_year';

export const moneyPeriodKeys: readonly MoneyPeriodKey[] = ['week', 'month', 'tax_year'];

export interface MoneyPeriod {
  key: MoneyPeriodKey;
  /** First day, included. */
  from: LocalDate;
  /** Last day, included. */
  to: LocalDate;
  /** What the dashboard calls it: "This week", "September", "2026 to 2027 tax year". */
  label: string;
  /** "Mon 14 Sep 2026 to Sun 20 Sep 2026". */
  range: string;
}

/** The tax year a day falls in, named by the year it starts: 6 April 2026 starts 2026 to 2027. */
export function taxYearStarting(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return month > 4 || (month === 4 && day >= 6) ? year : year - 1;
}

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** One of the dashboard's periods, around a day. */
export function moneyPeriod(key: MoneyPeriodKey, today: LocalDate): MoneyPeriod {
  let from: LocalDate;
  let to: LocalDate;
  let label: string;

  if (key === 'week') {
    // Monday to Sunday, the way a diary week runs.
    from = addDaysToLocalDate(today, 1 - isoWeekday(today));
    to = addDaysToLocalDate(from, 6);
    label = 'This week';
  } else if (key === 'month') {
    const { year, month } = parseLocalDate(today);
    from = formatLocalDate(year, month, 1);
    to = formatLocalDate(year, month, lastDayOfMonth(year, month));
    label = months[month - 1] ?? 'This month';
  } else {
    const start = taxYearStarting(today);
    from = formatLocalDate(start, 4, 6);
    to = formatLocalDate(start + 1, 4, 5);
    label = `${String(start)} to ${String(start + 1)} tax year`;
  }

  return { key, from, to, label, range: `${formatCalendarDate(from)} to ${formatCalendarDate(to)}` };
}

/** The instants a period covers: from its first moment, up to but not including the day after it. */
export function periodInstants(period: Pick<MoneyPeriod, 'from' | 'to'>, timeZone: string = DEFAULT_TIME_ZONE): { from: Date; to: Date } {
  const start = localToUtc(period.from, '00:00', timeZone);
  const end = localToUtc(addDaysToLocalDate(period.to, 1), '00:00', timeZone);
  // Midnight exists on every day in London: the clocks change at 01:00 and 02:00.
  if (start === null || end === null) throw new RangeError(`No midnight on ${period.from} or the day after ${period.to}`);
  return { from: start, to: end };
}
