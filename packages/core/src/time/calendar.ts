/**
 * Pure calendar arithmetic on local dates ("YYYY-MM-DD") and times ("HH:mm").
 * No time zone is involved here: a local date is a label on the calendar.
 */

export type LocalDate = string;
export type LocalTime = string;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function parseLocalDate(date: LocalDate): { year: number; month: number; day: number } {
  const match = DATE_PATTERN.exec(date);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const probe = new Date(Date.UTC(year, month - 1, day));
    if (probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day) {
      return { year, month, day };
    }
  }
  throw new RangeError(`Invalid local date "${date}", expected YYYY-MM-DD`);
}

export function parseLocalTime(time: LocalTime): { hour: number; minute: number } {
  const match = TIME_PATTERN.exec(time);
  if (!match) throw new RangeError(`Invalid local time "${time}", expected HH:mm`);
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function isValidLocalDate(date: string): boolean {
  try {
    parseLocalDate(date);
    return true;
  } catch {
    return false;
  }
}

export function isValidLocalTime(time: string): boolean {
  return TIME_PATTERN.test(time);
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

export function formatLocalDate(year: number, month: number, day: number): LocalDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function addDaysToLocalDate(date: LocalDate, days: number): LocalDate {
  const { year, month, day } = parseLocalDate(date);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatLocalDate(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

/** ISO weekday: Monday 1 to Sunday 7. Matches `working_hours.weekday`. */
export function isoWeekday(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

export function localTimeToMinutes(time: LocalTime): number {
  const { hour, minute } = parseLocalTime(time);
  return hour * 60 + minute;
}

export function minutesToLocalTime(minutes: number): LocalTime {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes >= 24 * 60) {
    throw new RangeError(`Minutes after midnight must be 0 to 1439, got ${String(minutes)}`);
  }
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}
