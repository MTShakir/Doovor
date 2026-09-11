/**
 * Deterministic demo lessons: five days of history and 14 days ahead (M0-29). Lessons follow
 * each instructor's hours with one buffer between them (D-001) and never double-book a
 * learner, so the database constraints accept every row.
 */
import { addDaysToLocalDate, isoWeekday, localTimeToMinutes, localToUtc, minutesToLocalTime } from '@repo/core/time';
import type { SeedInstructor } from './data';

export type SeedBookingStatus = 'completed' | 'confirmed' | 'requested' | 'cancelled' | 'no_show';
export type SeedPaymentStatus = 'unpaid' | 'paid_cash' | 'paid_bank';

export interface SeedBooking {
  instructorKey: string;
  learnerKey: string;
  date: string;
  start: string;
  durationMinutes: number;
  startsAt: Date;
  endsAt: Date;
  status: SeedBookingStatus;
  paymentStatus: SeedPaymentStatus;
}

const FIRST_LESSON = localTimeToMinutes('09:00');
const PAST_PAYMENTS: SeedPaymentStatus[] = ['paid_cash', 'paid_bank', 'unpaid'];
const FUTURE_PAYMENTS: SeedPaymentStatus[] = ['unpaid', 'paid_bank'];

export function generateBookings(
  instructors: SeedInstructor[],
  today: string,
  options: { daysBack?: number; daysAhead?: number; blockedDates?: Record<string, string[]> } = {},
): SeedBooking[] {
  const { daysBack = 5, daysAhead = 14, blockedDates = {} } = options;
  const bookings: SeedBooking[] = [];

  instructors.forEach((instructor, instructorIndex) => {
    let learnerCursor = 0;
    let paymentCursor = 0;
    for (let offset = -daysBack; offset <= daysAhead; offset += 1) {
      const date = addDaysToLocalDate(today, offset);
      if (blockedDates[instructor.key]?.includes(date)) continue;
      const hours = instructor.hours.find((h) => h.weekday === isoWeekday(date));
      if (!hours) continue;

      const lessonsToday = 2 + ((offset + instructorIndex + 30) % 2);
      const dayEnd = localTimeToMinutes(hours.end);
      let cursor = Math.max(localTimeToMinutes(hours.start), FIRST_LESSON);
      const bookedToday = new Set<string>();

      for (let n = 0; n < lessonsToday; n += 1) {
        const learner = instructor.learners[learnerCursor % instructor.learners.length];
        learnerCursor += 1;
        if (!learner || bookedToday.has(learner.key)) break;
        const end = cursor + learner.usualMinutes;
        if (end > dayEnd) break;

        const start = minutesToLocalTime(cursor);
        const startsAt = localToUtc(date, start);
        const endsAt = localToUtc(date, minutesToLocalTime(end));
        if (!startsAt || !endsAt) break;

        const past = offset < 0;
        bookings.push({
          instructorKey: instructor.key,
          learnerKey: learner.key,
          date,
          start,
          durationMinutes: learner.usualMinutes,
          startsAt,
          endsAt,
          status: past ? 'completed' : 'confirmed',
          paymentStatus: past
            ? (PAST_PAYMENTS[paymentCursor % PAST_PAYMENTS.length] ?? 'unpaid')
            : (FUTURE_PAYMENTS[paymentCursor % FUTURE_PAYMENTS.length] ?? 'unpaid'),
        });
        paymentCursor += 1;
        bookedToday.add(learner.key);
        // One buffer after each lesson, plus a lunch break after the first two.
        cursor = end + instructor.bufferMinutes + (n === 1 ? 30 : 0);
      }
    }
  });

  return applyStoryline(bookings, today);
}

/** A few lessons that show other states in the diary: a no-show, a late cancellation, a request. */
function applyStoryline(bookings: SeedBooking[], today: string): SeedBooking[] {
  const firstOn = (instructorKey: string, offset: number) =>
    bookings.find((b) => b.instructorKey === instructorKey && b.date === addDaysToLocalDate(today, offset));
  const markers: [string, number, SeedBookingStatus][] = [
    ['sarah', -2, 'no_show'],
    ['tom', -1, 'cancelled'],
    ['emma', 3, 'requested'],
  ];
  for (const [instructorKey, offset, status] of markers) {
    // Look a few days either side in case that exact day is a day off.
    for (let shift = 0; shift < 4; shift += 1) {
      const target = firstOn(instructorKey, offset + (offset < 0 ? -shift : shift));
      if (target) {
        target.status = status;
        target.paymentStatus = 'unpaid';
        break;
      }
    }
  }
  return bookings;
}
