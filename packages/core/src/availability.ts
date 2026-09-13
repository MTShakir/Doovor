/**
 * When an instructor is open for lessons (R-04, R-14, M2-11).
 *
 * Working hours are a weekly pattern in local wall-clock time, because that is how people
 * think about their week: nine to five on a Tuesday is nine to five whatever the clocks did
 * in March. Exceptions are real instants, because a day off is a day off. This turns the two
 * into plain UTC ranges, which is what everything downstream works in.
 */

import { addDaysToLocalDate, isoWeekday, localTimeToMinutes, minutesToLocalTime, type LocalDate, type LocalTime } from './time/calendar.ts';
import { DEFAULT_TIME_ZONE, localToUtc } from './time/zone.ts';

export interface WorkingHour {
  /** ISO weekday, Monday 1 to Sunday 7. */
  weekday: number;
  start: LocalTime;
  end: LocalTime;
}

export interface TimeRange {
  startsAt: Date;
  endsAt: Date;
}

/** The words the database and the diary editor use: extra hours, and time off. */
export type ExceptionKind = 'open' | 'blocked';

export interface AvailabilityException extends TimeRange {
  kind: ExceptionKind;
}

const MINUTE = 60_000;
/** Long enough to step over any clock change, which is an hour in the United Kingdom. */
const LONGEST_JUMP_MINUTES = 120;

/**
 * The instant a local time happens, or the first instant after it when the clocks skipped
 * that time entirely. A window that starts in the missing hour starts when the hour does.
 */
function instantAtOrAfter(date: LocalDate, time: LocalTime, timeZone: string): Date | null {
  const minutes = localTimeToMinutes(time);
  for (let step = 0; step <= LONGEST_JUMP_MINUTES; step += 1) {
    const at = minutes + step;
    // Past midnight is a different day, and working hours never cross one.
    if (at >= 24 * 60) return null;
    const instant = localToUtc(date, minutesToLocalTime(at), timeZone);
    if (instant !== null) return instant;
  }
  return null;
}

/** Ranges in order, with touching and overlapping ones joined. */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = [...ranges]
    .filter((range) => range.endsAt.getTime() > range.startsAt.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.startsAt.getTime() <= last.endsAt.getTime()) {
      if (range.endsAt.getTime() > last.endsAt.getTime()) last.endsAt = range.endsAt;
      continue;
    }
    merged.push({ startsAt: range.startsAt, endsAt: range.endsAt });
  }
  return merged;
}

/** What is left of one set of ranges once another set is taken out of it. */
export function subtractRanges(from: TimeRange[], remove: TimeRange[]): TimeRange[] {
  const holes = mergeRanges(remove);
  let left = mergeRanges(from);

  for (const hole of holes) {
    const next: TimeRange[] = [];
    for (const range of left) {
      const startsBefore = range.startsAt.getTime() < hole.startsAt.getTime();
      const endsAfter = range.endsAt.getTime() > hole.endsAt.getTime();
      const overlaps =
        range.startsAt.getTime() < hole.endsAt.getTime() && range.endsAt.getTime() > hole.startsAt.getTime();
      if (!overlaps) {
        next.push(range);
        continue;
      }
      if (startsBefore) next.push({ startsAt: range.startsAt, endsAt: hole.startsAt });
      if (endsAfter) next.push({ startsAt: hole.endsAt, endsAt: range.endsAt });
    }
    left = next;
  }
  return left;
}

/** The parts of these ranges that fall inside a window. */
export function clipRanges(ranges: TimeRange[], within: TimeRange): TimeRange[] {
  const clipped: TimeRange[] = [];
  for (const range of ranges) {
    const startsAt = new Date(Math.max(range.startsAt.getTime(), within.startsAt.getTime()));
    const endsAt = new Date(Math.min(range.endsAt.getTime(), within.endsAt.getTime()));
    if (endsAt.getTime() > startsAt.getTime()) clipped.push({ startsAt, endsAt });
  }
  return clipped;
}

/** One day of the weekly pattern, as instants. */
export function windowsForDay(
  hours: WorkingHour[],
  date: LocalDate,
  timeZone: string = DEFAULT_TIME_ZONE,
): TimeRange[] {
  const weekday = isoWeekday(date);
  const windows: TimeRange[] = [];

  for (const hour of hours) {
    if (hour.weekday !== weekday) continue;
    const startsAt = instantAtOrAfter(date, hour.start, timeZone);
    const endsAt = instantAtOrAfter(date, hour.end, timeZone);
    // A window that lives entirely inside the hour the clocks skipped does not happen.
    if (startsAt === null || endsAt === null || endsAt.getTime() <= startsAt.getTime()) continue;
    windows.push({ startsAt, endsAt });
  }
  return mergeRanges(windows);
}

export interface OpenWindowsInput {
  hours: WorkingHour[];
  exceptions?: AvailabilityException[];
  /** Local dates, both included. */
  from: LocalDate;
  to: LocalDate;
  timeZone?: string;
}

/**
 * Every window an instructor is open across a run of days: the weekly pattern, plus the
 * hours they added, minus the time they blocked out.
 */
export function openWindows({
  hours,
  exceptions = [],
  from,
  to,
  timeZone = DEFAULT_TIME_ZONE,
}: OpenWindowsInput): TimeRange[] {
  const windows: TimeRange[] = [];
  for (let date = from; date <= to; date = addDaysToLocalDate(date, 1)) {
    windows.push(...windowsForDay(hours, date, timeZone));
  }

  const extra = exceptions.filter((one) => one.kind === 'open');
  const off = exceptions.filter((one) => one.kind === 'blocked');
  const open = mergeRanges([...windows, ...extra]);

  const dayStart = localToUtc(from, '00:00', timeZone) ?? new Date(0);
  const afterLastDay = localToUtc(addDaysToLocalDate(to, 1), '00:00', timeZone);
  const bounds: TimeRange = {
    startsAt: dayStart,
    endsAt: afterLastDay ?? new Date(dayStart.getTime() + 24 * 60 * MINUTE),
  };

  return clipRanges(subtractRanges(open, off), bounds);
}

/** How long an instructor is open in a set of windows, in minutes. */
export function openMinutes(windows: TimeRange[]): number {
  return Math.round(
    mergeRanges(windows).reduce((total, window) => total + (window.endsAt.getTime() - window.startsAt.getTime()), 0) /
      MINUTE,
  );
}
