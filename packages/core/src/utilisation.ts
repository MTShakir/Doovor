/**
 * How full an instructor's week is (SCH-01, M5-12): the time their lessons take, against the time
 * they are open for lessons. Lessons booked outside open hours count too, so a week can be more
 * than full, and a week with no open hours has no figure at all rather than a misleading 0%.
 */

/** Whole per cent, or null when nothing was open. */
export function utilisationPercent(bookedMinutes: number, openMinutes: number): number | null {
  if (openMinutes <= 0) return null;
  return Math.round((Math.max(0, bookedMinutes) / openMinutes) * 100);
}

/** "12.5 hours", "1 hour", "0 hours": to the nearest tenth, for figures that sit side by side. */
export function hoursText(minutes: number): string {
  const hours = Math.round(Math.max(0, minutes) / 6) / 10;
  return hours === 1 ? '1 hour' : `${String(hours)} hours`;
}

/** "6 of 43 hours booked", the words beside a utilisation figure. */
export function utilisationWords(bookedMinutes: number, openMinutes: number): string {
  if (openMinutes <= 0) return bookedMinutes > 0 ? `${hoursText(bookedMinutes)} booked, with no open hours` : 'No open hours this week';
  const open = hoursText(openMinutes);
  const booked = Math.round(Math.max(0, bookedMinutes) / 6) / 10;
  return `${String(booked)} of ${open} booked`;
}
