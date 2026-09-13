import { isoWeekday, localTimeToMinutes, utcToLocal } from '@repo/core/time';
import { describe, expect, it } from 'vitest';
import { generateBookings } from './bookings';
import { instructors } from './data';

const BLOCKING = new Set(['completed', 'confirmed', 'requested']);

describe('seed booking generator (M0-29)', () => {
  // A week containing the March clock change, to prove local times survive it.
  for (const today of ['2026-09-11', '2026-03-25']) {
    const bookings = generateBookings(instructors, today, { blockedDates: { tom: ['2026-09-17'] } });

    it(`creates lessons for every instructor around ${today}`, () => {
      for (const instructor of instructors) {
        expect(bookings.filter((b) => b.instructorKey === instructor.key).length).toBeGreaterThan(5);
      }
    });

    it(`never breaks the instructor buffer rule around ${today} (D-001)`, () => {
      for (const instructor of instructors) {
        const mine = bookings
          .filter((b) => b.instructorKey === instructor.key && BLOCKING.has(b.status))
          .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
        for (let i = 1; i < mine.length; i += 1) {
          const previous = mine[i - 1];
          const current = mine[i];
          if (!previous || !current) continue;
          const gapMinutes = (current.startsAt.getTime() - previous.endsAt.getTime()) / 60_000;
          expect(gapMinutes).toBeGreaterThanOrEqual(instructor.bufferMinutes);
        }
      }
    });

    it(`never double-books a learner around ${today} (R-03)`, () => {
      const byLearner = new Map<string, typeof bookings>();
      for (const b of bookings.filter((x) => BLOCKING.has(x.status))) {
        byLearner.set(b.learnerKey, [...(byLearner.get(b.learnerKey) ?? []), b]);
      }
      for (const list of byLearner.values()) {
        const sorted = list.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
        for (let i = 1; i < sorted.length; i += 1) {
          expect(sorted[i]?.startsAt.getTime()).toBeGreaterThanOrEqual(sorted[i - 1]?.endsAt.getTime() ?? 0);
        }
      }
    });

    it(`keeps every lesson inside working hours in London time around ${today}`, () => {
      for (const b of bookings) {
        const instructor = instructors.find((i) => i.key === b.instructorKey);
        const hours = instructor?.hours.find((h) => h.weekday === isoWeekday(b.date));
        expect(hours).toBeDefined();
        const start = utcToLocal(b.startsAt);
        const end = utcToLocal(b.endsAt);
        expect(start.date).toBe(b.date);
        expect(localTimeToMinutes(start.time)).toBeGreaterThanOrEqual(localTimeToMinutes(hours?.start ?? '00:00'));
        expect(localTimeToMinutes(end.time)).toBeLessThanOrEqual(localTimeToMinutes(hours?.end ?? '23:59'));
      }
    });
  }

  it('includes a no-show, a late cancellation and a request for the diary', () => {
    const statuses = new Set(generateBookings(instructors, '2026-09-11').map((b) => b.status));
    expect([...statuses].sort()).toEqual(['cancelled', 'completed', 'confirmed', 'no_show', 'requested']);
  });

  it('gives nobody a lesson they would not be having (LRN-05)', () => {
    const today = '2026-09-11';
    const bookings = generateBookings(instructors, today);
    const statusOf = (key: string): string | undefined =>
      instructors.flatMap((i) => i.learners).find((l) => l.key === key)?.status;

    for (const booking of bookings) {
      const status = statusOf(booking.learnerKey);
      expect(status, `${booking.learnerKey} is waiting and has no lessons`).not.toBe('waiting');
      if (status === 'passed') expect(booking.date < today, 'a learner who passed has lessons behind them').toBe(true);
    }
    expect(bookings.some((b) => statusOf(b.learnerKey) === 'passed')).toBe(true);
  });

  it('skips blocked days', () => {
    const bookings = generateBookings(instructors, '2026-09-11', { blockedDates: { tom: ['2026-09-17'] } });
    expect(bookings.some((b) => b.instructorKey === 'tom' && b.date === '2026-09-17')).toBe(false);
  });
});
