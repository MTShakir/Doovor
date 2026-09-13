/**
 * How old someone is, and how much of that anybody else is told (AUTH-06, R-16, M2-01).
 *
 * A date of birth is a calendar date, not an instant, and age is whole years on the day you
 * ask. Nothing here converts to a time zone: a birthday is the same date wherever you stand.
 */

import { parseLocalDate, type LocalDate } from './time/calendar.ts';

/** The youngest anyone may hold a provisional licence and take a lesson (DVSA). */
export const leastLearnerAge = 16;

/** What an instructor is told instead of a date of birth (R-16). */
export type AgeBand = 'under_18' | '18_plus';

/** Whole years old on a given day. Negative before they are born. */
export function ageOn(dateOfBirth: LocalDate, today: LocalDate): number {
  const born = parseLocalDate(dateOfBirth);
  const now = parseLocalDate(today);
  const hadBirthday = now.month > born.month || (now.month === born.month && now.day >= born.day);
  return now.year - born.year - (hadBirthday ? 0 : 1);
}

/** True on the birthday itself, which is the day the law changes for them. */
export function isAtLeast(dateOfBirth: LocalDate, years: number, today: LocalDate): boolean {
  return ageOn(dateOfBirth, today) >= years;
}

/**
 * The only thing an instructor sees (R-16). Under 18 changes what a lesson may involve, which
 * is why it is shown at all; the date itself is the learner's own.
 */
export function ageBand(dateOfBirth: LocalDate, today: LocalDate): AgeBand {
  return isAtLeast(dateOfBirth, 18, today) ? '18_plus' : 'under_18';
}
