/**
 * When to warn an instructor that their badge is running out, and what happens when it does
 * (INS-03, M1-13).
 *
 * A badge is a calendar date, not an instant: it is good until the end of the day printed on
 * it. Everything here works in whole days, so a clock change cannot move a reminder.
 */

import { parseLocalDate, type LocalDate } from './time/calendar.ts';

/** Warn at two months, one month and one week. Each is sent once (PRD 9.2). */
export const reminderDays = [60, 30, 7] as const;

export type ReminderDay = (typeof reminderDays)[number];

function asUtcDays(date: LocalDate): number {
  const { year, month, day } = parseLocalDate(date);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Whole days from today until the badge expires. Negative once it has. */
export function daysUntilExpiry(expiry: LocalDate, today: LocalDate): number {
  return asUtcDays(expiry) - asUtcDays(today);
}

/** Expired means the printed day has passed: the day itself still counts. */
export function isBadgeExpired(expiry: LocalDate, today: LocalDate): boolean {
  return daysUntilExpiry(expiry, today) < 0;
}

/**
 * The reminder due today, or null. The nearest one wins: an instructor who joins with five
 * days left gets the seven-day warning, not all three.
 */
export function reminderDue(expiry: LocalDate, today: LocalDate): ReminderDay | null {
  const left = daysUntilExpiry(expiry, today);
  if (left < 0) return null;
  // Nearest first, so seven days left is the seven-day warning and not the sixty-day one.
  return [...reminderDays].reverse().find((day) => left <= day) ?? null;
}

/** What the reminder says, so the copy is the same wherever it is sent. */
export function reminderSummary(expiry: LocalDate, today: LocalDate): string {
  const left = daysUntilExpiry(expiry, today);
  if (left < 0) return 'Your instructor badge has expired';
  if (left === 0) return 'Your instructor badge expires today';
  if (left === 1) return 'Your instructor badge expires tomorrow';
  return `Your instructor badge expires in ${String(left)} days`;
}
