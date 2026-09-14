import { describe, expect, it } from 'vitest';
import {
  canMarkNoShow,
  cancellationOutcome,
  cancellationWarning,
  isLateCancellation,
  noShowOutcome,
  type CancelActor,
  type PaidWith,
} from './cancellation.ts';
import { formatPence } from './money.ts';

const lesson = new Date('2026-09-15T10:00:00Z');
const base = {
  startsAt: lesson,
  windowHours: 48,
  lateFeePercent: 100,
  pricePence: 4200,
  paidWith: 'card' as PaidWith,
};

/** Hours before the lesson, as an instant. */
const before = (hours: number): Date => new Date(lesson.getTime() - hours * 3_600_000);

describe('isLateCancellation (R-06)', () => {
  it('is late inside the window and not outside it', () => {
    expect(isLateCancellation(lesson, before(49), 48)).toBe(false);
    expect(isLateCancellation(lesson, before(48), 48)).toBe(false);
    expect(isLateCancellation(lesson, before(47), 48)).toBe(true);
  });

  it('with no window at all, only a lesson that has started is late', () => {
    expect(isLateCancellation(lesson, before(1), 0)).toBe(false);
    expect(isLateCancellation(lesson, new Date(lesson.getTime() + 60_000), 0)).toBe(true);
  });
});

describe('the cancellation policy, row by row (R-06, R-07, R-08)', () => {
  const cases: {
    name: string;
    by: CancelActor;
    hoursBefore: number;
    paidWith: PaidWith;
    lateFeePercent?: number;
    creditMinutes?: number;
    expect: { late: boolean; feePence: number; refundPence: number; creditReturnedMinutes: number };
  }[] = [
    {
      name: 'a learner cancelling in time, paid by card, is refunded in full',
      by: 'learner',
      hoursBefore: 72,
      paidWith: 'card',
      expect: { late: false, feePence: 0, refundPence: 4200, creditReturnedMinutes: 0 },
    },
    {
      name: 'a learner cancelling late, paid by card, is charged the lot',
      by: 'learner',
      hoursBefore: 24,
      paidWith: 'card',
      expect: { late: true, feePence: 4200, refundPence: 0, creditReturnedMinutes: 0 },
    },
    {
      name: 'a learner cancelling late where the Business charges half keeps half',
      by: 'learner',
      hoursBefore: 24,
      paidWith: 'card',
      lateFeePercent: 50,
      expect: { late: true, feePence: 2100, refundPence: 2100, creditReturnedMinutes: 0 },
    },
    {
      name: 'a learner cancelling late where the Business charges nothing pays nothing',
      by: 'learner',
      hoursBefore: 1,
      paidWith: 'card',
      lateFeePercent: 0,
      expect: { late: true, feePence: 0, refundPence: 4200, creditReturnedMinutes: 0 },
    },
    {
      name: 'credit cancelled in time comes back in full (R-07)',
      by: 'learner',
      hoursBefore: 72,
      paidWith: 'credit',
      creditMinutes: 60,
      expect: { late: false, feePence: 0, refundPence: 0, creditReturnedMinutes: 60 },
    },
    {
      name: 'credit cancelled late is used as the fee (R-07)',
      by: 'learner',
      hoursBefore: 2,
      paidWith: 'credit',
      creditMinutes: 60,
      expect: { late: true, feePence: 4200, refundPence: 0, creditReturnedMinutes: 0 },
    },
    {
      name: 'credit cancelled late where the fee is half gives half the minutes back',
      by: 'learner',
      hoursBefore: 2,
      paidWith: 'credit',
      creditMinutes: 60,
      lateFeePercent: 50,
      expect: { late: true, feePence: 2100, refundPence: 0, creditReturnedMinutes: 30 },
    },
    {
      name: 'a lesson nobody has paid for owes nothing back, but the fee still stands',
      by: 'learner',
      hoursBefore: 2,
      paidWith: 'none',
      expect: { late: true, feePence: 4200, refundPence: 0, creditReturnedMinutes: 0 },
    },
    {
      name: 'the instructor cancelling late still refunds in full (R-08)',
      by: 'instructor',
      hoursBefore: 1,
      paidWith: 'card',
      expect: { late: true, feePence: 0, refundPence: 4200, creditReturnedMinutes: 0 },
    },
    {
      name: 'the instructor cancelling credit gives every minute back (R-08)',
      by: 'instructor',
      hoursBefore: 1,
      paidWith: 'credit',
      creditMinutes: 90,
      expect: { late: true, feePence: 0, refundPence: 0, creditReturnedMinutes: 90 },
    },
    {
      name: 'the Business cancelling is the same as the instructor',
      by: 'business',
      hoursBefore: 1,
      paidWith: 'cash',
      expect: { late: true, feePence: 0, refundPence: 4200, creditReturnedMinutes: 0 },
    },
  ];

  for (const row of cases) {
    it(row.name, () => {
      const outcome = cancellationOutcome({
        ...base,
        by: row.by,
        now: before(row.hoursBefore),
        paidWith: row.paidWith,
        lateFeePercent: row.lateFeePercent ?? base.lateFeePercent,
        creditMinutes: row.creditMinutes,
      });

      expect(outcome).toMatchObject(row.expect);
    });
  }

  it('asks an instructor why, and never a learner (R-08)', () => {
    const byInstructor = cancellationOutcome({ ...base, by: 'instructor', now: before(1) });
    const byLearner = cancellationOutcome({ ...base, by: 'learner', now: before(1) });

    expect(byInstructor.reasonRequired).toBe(true);
    expect(byLearner.reasonRequired).toBe(false);
  });
});

describe('no-show (R-09)', () => {
  it('cannot be marked before the quarter of an hour is up', () => {
    expect(canMarkNoShow(lesson, new Date(lesson.getTime() + 14 * 60_000))).toBe(false);
    expect(canMarkNoShow(lesson, new Date(lesson.getTime() + 15 * 60_000))).toBe(true);
  });

  it('is treated as a late cancellation by the learner', () => {
    const outcome = noShowOutcome({ ...base, now: new Date(lesson.getTime() + 20 * 60_000) });
    const late = cancellationOutcome({ ...base, by: 'learner', now: before(1) });

    expect(outcome).toEqual(late);
  });
});

describe('cancellationWarning', () => {
  it('says what pressing the button will cost', () => {
    const inTime = cancellationOutcome({ ...base, by: 'learner', now: before(72) });
    const late = cancellationOutcome({ ...base, by: 'learner', now: before(2) });
    const lateButFree = cancellationOutcome({ ...base, by: 'learner', now: before(2), lateFeePercent: 0 });

    expect(cancellationWarning(inTime, formatPence)).toContain('No charge');
    expect(cancellationWarning(late, formatPence)).toContain('£42 is charged');
    expect(cancellationWarning(lateButFree, formatPence)).toContain('no fee');
  });

  it('talks about credit, not money, for a lesson paid with credit (R-07)', () => {
    const credit = { ...base, by: 'learner' as const, paidWith: 'credit' as const, creditMinutes: 90 };

    const inTime = cancellationOutcome({ ...credit, now: before(72) });
    const late = cancellationOutcome({ ...credit, now: before(2) });
    const half = cancellationOutcome({ ...credit, now: before(2), lateFeePercent: 50 });

    expect(cancellationWarning(inTime, formatPence)).toBe('No charge: the credit it used comes back to you.');
    expect(late).toMatchObject({ creditReturnedMinutes: 0, creditKeptMinutes: 90 });
    expect(cancellationWarning(late, formatPence)).toBe(
      'This is a late cancellation, so 1 hour 30 minutes of your credit is kept as the fee.',
    );
    expect(half).toMatchObject({ creditReturnedMinutes: 45, creditKeptMinutes: 45 });
    expect(cancellationWarning(half, formatPence)).toContain('45 minutes of your credit is kept');
  });

  it('keeps, returns and rounds odd minutes the way the database does (R-07)', () => {
    // 45 minutes at half: 22.5 back, rounded up to 23, so 22 are kept.
    const odd = cancellationOutcome({ ...base, by: 'learner', paidWith: 'credit', creditMinutes: 45, now: before(2), lateFeePercent: 50 });
    expect(odd).toMatchObject({ creditReturnedMinutes: 23, creditKeptMinutes: 22 });
  });
});
