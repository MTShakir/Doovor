/**
 * Conversion between UTC instants and local wall-clock time (R-14). All instants are stored
 * in UTC; working hours and recurring lessons are defined in local time.
 *
 * Clock change rules (ARCHITECTURE.md 7.1):
 * - a local time skipped when clocks go forward does not exist: localToUtc returns null;
 * - a local time repeated when clocks go back resolves to its first occurrence.
 */
import { TZDate, tzOffset } from '@date-fns/tz';
import { formatLocalDate, parseLocalDate, parseLocalTime, type LocalDate, type LocalTime } from './calendar.ts';

export const DEFAULT_TIME_ZONE = 'Europe/London';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export type LocalTimeKind = 'normal' | 'nonexistent' | 'ambiguous';

/** All UTC instants that show this wall-clock time in the zone, earliest first. */
function instantsForLocal(date: LocalDate, time: LocalTime, timeZone: string): number[] {
  const { year, month, day } = parseLocalDate(date);
  const { hour, minute } = parseLocalTime(time);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  // The zone's offsets either side of this moment cover any single clock change.
  const offsets = new Set([tzOffset(timeZone, new Date(wall - DAY)), tzOffset(timeZone, new Date(wall + DAY))]);
  const instants: number[] = [];
  for (const offset of offsets) {
    const candidate = wall - offset * MINUTE;
    if (tzOffset(timeZone, new Date(candidate)) === offset) instants.push(candidate);
  }
  return instants.sort((a, b) => a - b);
}

export function classifyLocalTime(
  date: LocalDate,
  time: LocalTime,
  timeZone: string = DEFAULT_TIME_ZONE,
): LocalTimeKind {
  const count = instantsForLocal(date, time, timeZone).length;
  if (count === 0) return 'nonexistent';
  return count > 1 ? 'ambiguous' : 'normal';
}

/** The UTC instant for a local date and time, or null if clocks skipped that time. */
export function localToUtc(date: LocalDate, time: LocalTime, timeZone: string = DEFAULT_TIME_ZONE): Date | null {
  const [first] = instantsForLocal(date, time, timeZone);
  return first === undefined ? null : new Date(first);
}

export interface LocalParts {
  date: LocalDate;
  time: LocalTime;
  /** ISO weekday, Monday 1 to Sunday 7. */
  weekday: number;
}

/** Today's date in the zone. Pass the instant so rules that depend on it stay testable. */
export function todayInZone(now: Date = new Date(), timeZone: string = DEFAULT_TIME_ZONE): LocalDate {
  return utcToLocal(now, timeZone).date;
}

export function utcToLocal(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): LocalParts {
  const zoned = new TZDate(instant.getTime(), timeZone);
  const jsDay = zoned.getDay();
  return {
    date: formatLocalDate(zoned.getFullYear(), zoned.getMonth() + 1, zoned.getDate()),
    time: `${String(zoned.getHours()).padStart(2, '0')}:${String(zoned.getMinutes()).padStart(2, '0')}`,
    weekday: jsDay === 0 ? 7 : jsDay,
  };
}
