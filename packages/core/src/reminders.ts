/**
 * Reminders before a lesson (NTF-02, M2-30).
 *
 * A Business says how long before a lesson to remind somebody. This decides which of those
 * reminders are due right now, which is the only hard part: a lesson booked an hour before it
 * starts must not be "reminded" about a day in advance, and a lesson that moved must be
 * reminded about at its new time and not its old one.
 */

import { z } from './zod';

const HOUR = 3_600_000;

/** What the platform ships with: the day before, and two hours before (NTF-02). */
export const reminderHoursDefault: number[] = [24, 2];

/** Sensible bounds: a week ahead at most, and never later than the lesson itself. */
export const reminderHoursRange = { min: 1, max: 168 } as const;

export const reminderHoursSchema = z
  .array(z.coerce.number().int().min(reminderHoursRange.min).max(reminderHoursRange.max))
  .max(4)
  .transform((hours) => [...new Set(hours)].sort((a, b) => b - a));

/** What a Business changed, falling through to the platform default. */
export function resolveReminderHours(...levels: unknown[]): number[] {
  for (const level of levels) {
    if (level === null || level === undefined || typeof level !== 'object') continue;
    const value = (level as Record<string, unknown>).reminder_hours_before;
    const parsed = reminderHoursSchema.safeParse(value);
    if (parsed.success && parsed.data.length > 0) return parsed.data;
  }
  return [...reminderHoursDefault];
}

export interface DueReminderInput {
  startsAt: Date;
  /** When the lesson was booked: nobody is reminded about a lesson they just made. */
  createdAt: Date;
  now: Date;
  hoursBefore: number[];
}

/**
 * The reminders that should have gone out by now and have not been overtaken by the lesson
 * itself. A lesson booked after a reminder's moment never gets that reminder.
 */
export function dueReminders(input: DueReminderInput): number[] {
  const start = input.startsAt.getTime();
  const now = input.now.getTime();
  if (now >= start) return [];

  return input.hoursBefore
    .filter((hours) => {
      const moment = start - hours * HOUR;
      return moment <= now && input.createdAt.getTime() <= moment;
    })
    .sort((a, b) => b - a);
}

/** How a reminder describes when the lesson is: "tomorrow", "in 2 hours". */
export function reminderWording(hoursBefore: number): string {
  if (hoursBefore >= 48) return `in ${String(Math.round(hoursBefore / 24))} days`;
  if (hoursBefore >= 24) return 'tomorrow';
  if (hoursBefore === 1) return 'in an hour';
  return `in ${String(hoursBefore)} hours`;
}

/**
 * The key that stops the same reminder going twice. The lesson's version is in it, so a
 * lesson that moved is reminded about again, at its new time (NTF-02).
 */
export function reminderVersion(version: number | string, hoursBefore: number): string {
  return `${String(version)}h${String(hoursBefore)}`;
}

/** What a Business is offered, rather than a free text box nobody would fill in well. */
export const reminderChoices = [
  { value: '24,2', label: '1 day and 2 hours before' },
  { value: '24', label: '1 day before' },
  { value: '2', label: '2 hours before' },
  { value: '72,24', label: '3 days and 1 day before' },
] as const;

/** "24,2" as a form sends it, and back again. */
export function parseReminderChoice(value: string): number[] {
  const parsed = reminderHoursSchema.safeParse(
    value
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== ''),
  );
  return parsed.success && parsed.data.length > 0 ? parsed.data : [...reminderHoursDefault];
}

export function reminderChoiceOf(hours: number[]): string {
  return hours.join(',');
}
