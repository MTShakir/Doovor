/**
 * A lesson length an instructor sets themselves (BOK-03, D-179): one to four and a half hours, on
 * the half hour, priced at the hourly rate for the time it takes. The catalogue's own lengths keep
 * their own prices; this is for the lesson that does not fit them.
 */

export const shortestCustomMinutes = 60;
export const longestCustomMinutes = 270;

/** The hours a picker offers, with the half hour beside them. */
export const customLengthHours = [1, 2, 3, 4] as const;
export const customLengthHalves = [0, 30] as const;

export function isCustomLength(minutes: number): boolean {
  return (
    Number.isInteger(minutes) && minutes >= shortestCustomMinutes && minutes <= longestCustomMinutes && minutes % 30 === 0
  );
}

/** What a length costs at an hourly rate, to the penny. The database works it out the same way (R-05). */
export function customLengthPrice(hourlyPence: number, minutes: number): number {
  return Math.round((hourlyPence * minutes) / 60);
}

/** A length as the picker holds it: hours, and nought or thirty minutes. */
export function lengthInHours(minutes: number): { hours: number; minutes: number } {
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}
