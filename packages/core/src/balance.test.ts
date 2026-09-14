import { describe, expect, it } from 'vitest';
import {
  amountOwedPence,
  historyLine,
  moneyDueAt,
  owedLessons,
  summariseBalance,
  OVERDUE_AFTER_HOURS,
  type MoneyLesson,
} from './balance.ts';

const HOUR = 3_600_000;
const now = new Date('2026-09-20T12:00:00Z');
const at = (hoursFromNow: number) => new Date(now.getTime() + hoursFromNow * HOUR);

const lesson = (overrides: Partial<MoneyLesson> = {}): MoneyLesson => ({
  id: 'l1',
  startsAt: at(-3),
  endsAt: at(-2),
  status: 'completed',
  paymentStatus: 'unpaid',
  paymentMode: 'offline',
  pricePence: 4200,
  feePence: 0,
  cancelledAt: null,
  ...overrides,
});

describe('when a lesson is owed for (PAY-03, PAY-06, M3-16)', () => {
  it('is owed from the start when it is paid in person or at booking', () => {
    expect(moneyDueAt(lesson())).toEqual(at(-3));
    expect(moneyDueAt(lesson({ paymentMode: 'at_booking', status: 'confirmed' }))).toEqual(at(-3));
  });

  it('is owed from the day before when it is charged the day before', () => {
    expect(moneyDueAt(lesson({ paymentMode: 'before_lesson', startsAt: at(10), endsAt: at(11), status: 'confirmed' }))).toEqual(at(-14));
  });

  it('is owed once it is over when it is paid for afterwards', () => {
    expect(moneyDueAt(lesson({ paymentMode: 'after_lesson' }))).toEqual(at(-2));
  });

  it('is never owed when it is paid, free, paid with credit, not going ahead, or still being asked for', () => {
    for (const paymentStatus of ['paid_card', 'paid_cash', 'paid_bank', 'paid_credit', 'refunded', 'partially_refunded'] as const) {
      expect(moneyDueAt(lesson({ paymentStatus }))).toBeNull();
    }
    expect(moneyDueAt(lesson({ pricePence: 0 }))).toBeNull();
    expect(moneyDueAt(lesson({ paymentMode: 'credit' }))).toBeNull();
    for (const status of ['cancelled', 'no_show', 'declined', 'expired', 'requested', 'pending_payment'] as const) {
      expect(moneyDueAt(lesson({ status }))).toBeNull();
    }
  });

  it('still counts a card that was tried and failed, or is part way through, as owed', () => {
    expect(moneyDueAt(lesson({ paymentStatus: 'failed' }))).not.toBeNull();
    expect(moneyDueAt(lesson({ paymentStatus: 'pending' }))).not.toBeNull();
  });
});

describe('a late cancellation fee nobody has paid (PAY-09, M3-18)', () => {
  const calledOff = (overrides: Partial<MoneyLesson> = {}) =>
    lesson({ status: 'cancelled', startsAt: at(20), endsAt: at(21), cancelledAt: at(-4), feePence: 2100, ...overrides });

  it('is owed from the moment the lesson was called off, and the amount is the fee', () => {
    expect(moneyDueAt(calledOff())).toEqual(at(-4));
    expect(amountOwedPence(calledOff())).toBe(2100);
    expect(owedLessons([calledOff()], now)).toEqual([
      { lesson: calledOff(), dueAt: at(-4), overdue: false, amountPence: 2100, lateFee: true },
    ]);
  });

  it('is not owed when there was no fee, or it was paid, or credit or a card paid for the lesson', () => {
    expect(moneyDueAt(calledOff({ feePence: 0 }))).toBeNull();
    for (const paymentStatus of ['paid_card', 'paid_cash', 'paid_bank', 'paid_credit', 'refunded', 'partially_refunded', 'pending'] as const) {
      expect(moneyDueAt(calledOff({ paymentStatus }))).toBeNull();
    }
    expect(moneyDueAt(calledOff({ paymentStatus: 'failed' }))).toEqual(at(-4));
  });

  it('adds the fee, not the price, to what is owed, and money owed back is counted apart', () => {
    const summary = summariseBalance({
      creditMinutes: 0,
      lessons: [calledOff({ cancelledAt: at(-60) }), lesson({ id: 'b', pricePence: 4200 })],
      refunds: [
        { amountPence: 4200, status: 'pending', kind: 'offline' },
        { amountPence: 1000, status: 'succeeded', kind: 'offline' },
        { amountPence: 3000, status: 'pending', kind: 'card' },
      ],
      now,
    });

    expect(summary).toMatchObject({ owedPence: 6300, overduePence: 2100, owedBackPence: 4200 });
  });
});

describe('what is owed, and what is overdue (PAY-06)', () => {
  it('counts only what is already due, longest owed first, and flags it overdue after two days', () => {
    const lessons = [
      lesson({ id: 'tomorrow', startsAt: at(20), endsAt: at(21), status: 'confirmed' }),
      lesson({ id: 'today', startsAt: at(-3), endsAt: at(-2) }),
      lesson({ id: 'last week', startsAt: at(-170), endsAt: at(-169) }),
      lesson({ id: 'paid', startsAt: at(-50), endsAt: at(-49), paymentStatus: 'paid_cash' }),
    ];

    const owed = owedLessons(lessons, now);

    expect(owed.map((one) => [one.lesson.id, one.overdue])).toEqual([
      ['last week', true],
      ['today', false],
    ]);
  });

  it('turns overdue at exactly two days, not a moment before', () => {
    const due = lesson({ startsAt: at(-OVERDUE_AFTER_HOURS), endsAt: at(-OVERDUE_AFTER_HOURS + 1) });
    expect(owedLessons([due], now)[0]?.overdue).toBe(true);
    expect(owedLessons([due], new Date(now.getTime() - 1))[0]?.overdue).toBe(false);
  });

  it('adds it up, in pence', () => {
    const summary = summariseBalance({
      creditMinutes: 90,
      lessons: [
        lesson({ id: 'a', startsAt: at(-100), endsAt: at(-99), pricePence: 4200 }),
        lesson({ id: 'b', startsAt: at(-1), endsAt: at(0), pricePence: 6250 }),
      ],
      now,
    });

    expect(summary).toMatchObject({ creditMinutes: 90, owedPence: 10450, overduePence: 4200, owedBackPence: 0 });
    expect(summary.owed).toHaveLength(2);
  });
});

describe('a line of history', () => {
  const day = new Date('2026-09-15T09:00:00Z');

  it('says what a payment was for, how it was paid and what came back', () => {
    expect(historyLine({ kind: 'payment', at: day, amountPence: 4200, method: 'cash', refundedPence: 0, pendingRefundPence: 0, lessonAt: day, creditMinutes: null })).toEqual({
      title: 'Lesson on Tue 15 Sep',
      detail: 'Cash',
      amount: '£42',
    });
    expect(historyLine({ kind: 'payment', at: day, amountPence: 38000, method: 'card', refundedPence: 0, pendingRefundPence: 0, lessonAt: null, creditMinutes: 600 })).toEqual({
      title: '10 hours of credit bought',
      detail: 'Card',
      amount: '£380',
    });
    expect(historyLine({ kind: 'payment', at: day, amountPence: 4200, method: 'card', refundedPence: 4200, pendingRefundPence: 0, lessonAt: day, creditMinutes: null }).detail).toBe(
      'Card, refunded',
    );
    expect(historyLine({ kind: 'payment', at: day, amountPence: 4200, method: 'bank', refundedPence: 2100, pendingRefundPence: 0, lessonAt: day, creditMinutes: null }).detail).toBe(
      'Bank transfer, £21 refunded',
    );
  });

  it('says where a refund has got to', () => {
    expect(historyLine({ kind: 'refund', at: day, amountPence: 4200, status: 'pending', refundKind: 'card' })).toEqual({
      title: 'Refund',
      detail: 'On its way back',
      amount: '£42',
    });
    expect(historyLine({ kind: 'refund', at: day, amountPence: 4200, status: 'succeeded', refundKind: 'card' }).detail).toBe('Paid back');
    expect(historyLine({ kind: 'refund', at: day, amountPence: 4200, status: 'failed', refundKind: 'card' }).detail).toBe('Could not be paid back');
    // Cash goes back when somebody hands it back (M3-18).
    expect(historyLine({ kind: 'refund', at: day, amountPence: 4200, status: 'pending', refundKind: 'offline' }).detail).toBe('Owed back');
    expect(historyLine({ kind: 'refund', at: day, amountPence: 4200, status: 'succeeded', refundKind: 'offline' }).detail).toBe('Paid back');
  });

  it('says what happened to credit, in time rather than money', () => {
    expect(historyLine({ kind: 'credit', at: day, move: 'use', minutes: -60, lessonAt: day })).toEqual({
      title: '1 hour of credit used',
      detail: 'Lesson on Tue 15 Sep',
      amount: null,
    });
    expect(historyLine({ kind: 'credit', at: day, move: 'return', minutes: 90, lessonAt: day }).title).toBe('1 hour 30 minutes of credit back');
    expect(historyLine({ kind: 'credit', at: day, move: 'fee', minutes: -30, lessonAt: day }).title).toBe('30 minutes of credit kept as a late fee');
    expect(historyLine({ kind: 'credit', at: day, move: 'expiry', minutes: -120, lessonAt: null })).toEqual({
      title: '2 hours of credit ran out',
      detail: 'Credit',
      amount: null,
    });
    expect(historyLine({ kind: 'credit', at: day, move: 'refund', minutes: -60, lessonAt: null }).title).toBe('1 hour of credit refunded');
    expect(historyLine({ kind: 'credit', at: day, move: 'adjustment', minutes: 60, lessonAt: null }).title).toBe('1 hour of credit added');
    expect(historyLine({ kind: 'credit', at: day, move: 'adjustment', minutes: -60, lessonAt: null }).title).toBe('1 hour of credit taken off');
  });
});
