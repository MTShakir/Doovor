import { addDaysToLocalDate, isoWeekday, isValidLocalDate, localToUtc, todayInZone, type LocalDate } from '@repo/core/time';

export type DiaryView = 'day' | 'week' | 'month';

export function isDiaryView(value: string | undefined): value is DiaryView {
  return value === 'day' || value === 'week' || value === 'month';
}

/** The Monday of the week a date falls in. Weeks start on Monday here (PRD 7.6). */
export function startOfWeek(date: LocalDate): LocalDate {
  return addDaysToLocalDate(date, 1 - isoWeekday(date));
}

export function startOfMonth(date: LocalDate): LocalDate {
  return `${date.slice(0, 8)}01`;
}

export function endOfMonth(date: LocalDate): LocalDate {
  const [year, month] = date.split('-').map(Number);
  const nextMonth = month === 12 ? `${String((year ?? 0) + 1)}-01-01` : `${String(year)}-${String((month ?? 1) + 1).padStart(2, '0')}-01`;
  return addDaysToLocalDate(nextMonth, -1);
}

/** A date from the address bar, or today when there is not one. */
export function dateFrom(value: string | undefined): LocalDate {
  return value !== undefined && isValidLocalDate(value) ? value : todayInZone();
}

export interface DiaryWindow {
  /** First local date shown. */
  from: LocalDate;
  /** Last local date shown, inclusive. */
  to: LocalDate;
  /** The instants to ask the database for. */
  startsAt: Date;
  endsAt: Date;
}

/**
 * The window a view covers, in local dates and in instants (DIA-03). Midnight is a wall
 * clock time, so the instants are worked out with the clock-change rules (R-14).
 */
export function windowFor(view: DiaryView, date: LocalDate): DiaryWindow {
  const from = view === 'day' ? date : view === 'week' ? startOfWeek(date) : startOfMonth(date);
  const to = view === 'day' ? date : view === 'week' ? addDaysToLocalDate(from, 6) : endOfMonth(date);
  // The hour after midnight always exists, even on the day the clocks go forward.
  const startsAt = localToUtc(from, '00:00') ?? new Date(`${from}T00:00:00Z`);
  const endsAt = localToUtc(addDaysToLocalDate(to, 1), '00:00') ?? new Date(`${to}T23:59:59Z`);
  return { from, to, startsAt, endsAt };
}

/** The date the arrows move to. */
export function step(view: DiaryView, date: LocalDate, direction: 1 | -1): LocalDate {
  if (view === 'day') return addDaysToLocalDate(date, direction);
  if (view === 'week') return addDaysToLocalDate(date, 7 * direction);
  const first = startOfMonth(date);
  return direction === 1 ? addDaysToLocalDate(endOfMonth(first), 1) : startOfMonth(addDaysToLocalDate(first, -1));
}
