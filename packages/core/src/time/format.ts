/** Display formats from PRD 7.6: "Tue 15 Sep", "14:30". Always in the given zone. */
import { TZDate } from '@date-fns/tz';
import { format } from 'date-fns';
import { parseLocalDate, type LocalDate } from './calendar.ts';
import { DEFAULT_TIME_ZONE } from './zone.ts';

function inZone(instant: Date, timeZone: string): TZDate {
  return new TZDate(instant.getTime(), timeZone);
}

export function formatDate(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return format(inZone(instant, timeZone), 'EEE d MMM');
}

export function formatDateWithYear(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return format(inZone(instant, timeZone), 'EEE d MMM yyyy');
}

/**
 * A calendar date with no instant behind it, such as a badge expiry. It is a label on the
 * calendar, so no zone is involved and none is applied.
 */
export function formatCalendarDate(date: LocalDate, options: { year?: boolean } = {}): string {
  const { year, month, day } = parseLocalDate(date);
  return format(new Date(year, month - 1, day), options.year === false ? 'EEE d MMM' : 'EEE d MMM yyyy');
}

export function formatTime(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return format(inZone(instant, timeZone), 'HH:mm');
}

export function formatDateTime(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  return `${formatDate(instant, timeZone)}, ${formatTime(instant, timeZone)}`;
}
