import { describe, expect, it } from 'vitest';
import {
  canMarkNoShow,
  cancellationOutcome,
  cancellationWarning,
  cancelledMoneyWords,
  disputeDecisionWords,
  isLateCancellation,
  noShowMoneyWords,
  noShowOutcome,
  type CancelActor,
  type CancelledMoney,
  type PaidWith,
} from './cancellation.ts';
import type { BookingStatus } from './diary.ts';
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
    status?: BookingStatus;
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
    {
      name: 'withdrawing a request close to the time is never late, because it was never a lesson (M3-18)',
      by: 'learner',
      hoursBefore: 2,
      paidWith: 'none',
      status: 'requested',
      expect: { late: false, feePence: 0, refundPence: 0, creditReturnedMinutes: 0 },
    },
    {
      name: 'nor is letting go of a slot held while a card is found (M3-18)',
      by: 'learner',
      hoursBefore: 2,
      paidWith: 'none',
      status: 'pending_payment',
      expect: { late: false, feePence: 0, refundPence: 0, creditReturnedMinutes: 0 },
    },
    {
      name: 'a lesson under way is still late',
      by: 'learner',
      hoursBefore: -0.5,
      paidWith: 'none',
      status: 'in_progress',
      expect: { late: true, feePence: 4200, refundPence: 0, creditReturnedMinutes: 0 },
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
        status: row.status,
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
    const unpaid = { ...base, by: 'learner' as const, paidWith: 'none' as const };
    const inTime = cancellationOutcome({ ...unpaid, now: before(72) });
    const late = cancellationOutcome({ ...unpaid, now: before(2) });
    const lateButFree = cancellationOutcome({ ...unpaid, now: before(2), lateFeePercent: 0 });

    expect(cancellationWarning(inTime, formatPence)).toBe('No charge: this is inside the free cancellation window.');
    expect(cancellationWarning(late, formatPence)).toBe('This is a late cancellation, so £42 is charged.');
    expect(cancellationWarning(lateButFree, formatPence)).toBe('This is a late cancellation, but there is no fee.');
  });

  it('says what happens to money already paid: the fee comes out of it, and the rest goes back (PAY-09, M3-18)', () => {
    const paid = { ...base, by: 'learner' as const };
    const warning = (overrides: { now: Date; paidWith?: PaidWith; lateFeePercent?: number }) =>
      cancellationWarning(cancellationOutcome({ ...paid, ...overrides }), formatPence);

    expect(warning({ now: before(72) })).toBe('No charge: the £42 you paid goes back to your card.');
    expect(warning({ now: before(72), paidWith: 'cash' })).toBe('No charge: the £42 you paid is owed back to you.');
    expect(warning({ now: before(24) })).toBe('This is a late cancellation, so the £42 you paid is kept as the fee.');
    expect(warning({ now: before(24), lateFeePercent: 50 })).toBe(
      'This is a late cancellation, so £21 of what you paid is kept as the fee and £21 goes back to your card.',
    );
    expect(warning({ now: before(24), lateFeePercent: 50, paidWith: 'bank' })).toBe(
      'This is a late cancellation, so £21 of what you paid is kept as the fee and £21 is owed back to you.',
    );
    expect(warning({ now: before(2), lateFeePercent: 0 })).toBe(
      'This is a late cancellation, but there is no fee: the £42 you paid goes back to your card.',
    );
  });

  it('never warns of a fee for a request or a held slot', () => {
    const asked = cancellationOutcome({ ...base, by: 'learner', paidWith: 'none', now: before(2), status: 'requested' });
    expect(cancellationWarning(asked, formatPence)).toBe('No charge: this is inside the free cancellation window.');
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

describe('what the people told about a cancellation read afterwards (acceptance-04, acceptance-05)', () => {
  const nothing: CancelledMoney = {
    by: 'learner',
    late: false,
    feePence: 0,
    keptPence: 0,
    cardRefundPence: 0,
    offlineRefundPence: 0,
    creditReturnedMinutes: 0,
    creditKeptMinutes: 0,
    charging: false,
    policy: null,
  };
  const policy = { minutesBefore: 24 * 60 + 17, windowHours: 48, lateFeePercent: 100 };
  const learner = { kind: 'learner' } as const;
  const business = { kind: 'business', learnerName: 'Jack Taylor' } as const;
  const words = (money: Partial<CancelledMoney>, reader: typeof learner | typeof business = learner) =>
    cancelledMoneyWords({ ...nothing, ...money }, reader, formatPence).join(' ');

  it('acceptance-04: tells a learner who cancelled a card lesson a day before why the whole fee was kept', () => {
    const late = { late: true, feePence: 4200, keptPence: 4200, policy };

    expect(words(late)).toBe(
      'You cancelled 24 hours before it started. Cancelling less than 48 hours before a lesson costs the full price, so the £42 you paid is kept as the fee.',
    );
    expect(words(late, business)).toBe('Jack Taylor cancelled late, so the £42 they paid is kept as the fee.');
  });

  it('says what a smaller fee kept, and where the rest went', () => {
    const half = { late: true, feePence: 2100, keptPence: 2100, cardRefundPence: 2100, policy: { ...policy, lateFeePercent: 50 } };

    expect(words(half)).toBe(
      'You cancelled 24 hours before it started. Cancelling less than 48 hours before a lesson costs half the price, so £21 of what you paid is kept as the fee and £21 is going back to your card.',
    );
    expect(words({ ...half, cardRefundPence: 0, offlineRefundPence: 2100 }, business)).toBe(
      'Jack Taylor cancelled late, so £21 of what they paid is kept as the fee and they are owed back £21.',
    );
  });

  it('says a fee is owed when nothing had been paid, and what credit paid it with', () => {
    expect(words({ late: true, feePence: 4200, policy: { ...policy, minutesBefore: 45 } })).toBe(
      'You cancelled 45 minutes before it started. Cancelling less than 48 hours before a lesson costs the full price, so a fee of £42 is owed.',
    );
    expect(words({ late: true, feePence: 2100, creditKeptMinutes: 30, creditReturnedMinutes: 30 })).toBe(
      '30 minutes of your credit is kept as the fee and 30 minutes is back.',
    );
    expect(words({ late: true, feePence: 4200, policy: { ...policy, minutesBefore: -5 } })).toContain('You cancelled after it had started.');
    expect(words({ late: true, feePence: 4200, policy: { ...policy, minutesBefore: 0, lateFeePercent: 30 } })).toBe(
      'You cancelled less than a minute before it started. Cancelling less than 48 hours before a lesson costs 30% of the price, so a fee of £42 is owed.',
    );
  });

  it('acceptance-05: tells the learner an instructor cancelled on that everything they paid goes back', () => {
    expect(words({ by: 'instructor', late: true, cardRefundPence: 4200 })).toBe('£42 is going back to your card.');
    expect(words({ by: 'instructor', late: true, cardRefundPence: 4200 }, business)).toBe("£42 is going back to Jack Taylor's card.");
    expect(words({ by: 'business', offlineRefundPence: 4200 })).toBe('You are owed back the £42 you paid.');
    expect(words({ by: 'instructor', offlineRefundPence: 4200 }, business)).toBe('Jack Taylor is owed back the £42 they paid.');
    expect(words({ by: 'instructor', creditReturnedMinutes: 60 }, business)).toBe('1 hour of credit is back with Jack Taylor.');
  });

  it('tells a learner who cancelled in time there is no charge, and nobody else anything', () => {
    expect(words({})).toBe('There is no charge.');
    expect(words({ creditReturnedMinutes: 90 })).toBe('1 hour 30 minutes of credit is back.');
    expect(words({}, business)).toBe('');
    expect(words({ by: 'instructor' })).toBe('');
  });
});

describe('the fee charged to a kept card, and lessons nobody came to (PAY-09, R-09, M3-19)', () => {
  const nothing = {
    feePence: 0,
    keptPence: 0,
    cardRefundPence: 0,
    offlineRefundPence: 0,
    creditReturnedMinutes: 0,
    creditKeptMinutes: 0,
    charging: false,
  };
  const learner = { kind: 'learner' } as const;
  const business = { kind: 'business', learnerName: 'Jack Taylor' } as const;

  it('says a late fee nothing paid is being charged to the saved card, rather than owed', () => {
    const late = { ...nothing, by: 'learner' as const, late: true, feePence: 4200, charging: true, policy: { minutesBefore: 600, windowHours: 48, lateFeePercent: 100 } };

    expect(cancelledMoneyWords(late, learner, formatPence).join(' ')).toBe(
      'You cancelled 10 hours before it started. Cancelling less than 48 hours before a lesson costs the full price, so the £42 fee is being charged to your saved card.',
    );
    expect(cancelledMoneyWords(late, business, formatPence)).toEqual(['Jack Taylor cancelled late, so the £42 fee is being charged to their saved card.']);
  });

  it('tells a learner nobody saw that missing a lesson costs what cancelling late does, and what paid it', () => {
    const words = (money: Partial<typeof nothing> & { lateFeePercent?: number | null }, reader: typeof learner | typeof business = learner) =>
      noShowMoneyWords({ ...nothing, lateFeePercent: 100, ...money }, reader, formatPence).join(' ');

    expect(words({ feePence: 4200, keptPence: 4200 })).toBe('Missing a lesson costs the full price, as cancelling late does, so the £42 you paid is kept as the fee.');
    expect(words({ feePence: 2100, keptPence: 2100, cardRefundPence: 2100, lateFeePercent: 50 })).toBe(
      'Missing a lesson costs half the price, as cancelling late does, so £21 of what you paid is kept as the fee and £21 is going back to your card.',
    );
    expect(words({ feePence: 4200, creditKeptMinutes: 60 })).toBe('Missing a lesson costs the full price, as cancelling late does, so 1 hour of your credit is kept as the fee.');
    expect(words({ feePence: 4200, charging: true })).toBe('Missing a lesson costs the full price, as cancelling late does, so the £42 fee is being charged to your saved card.');
    expect(words({ feePence: 4200 })).toBe('Missing a lesson costs the full price, as cancelling late does, so a fee of £42 is owed.');
    expect(words({ feePence: 4200, lateFeePercent: null })).toBe('A fee of £42 is owed.');
  });

  it('tells the Business what came of it, without the policy', () => {
    expect(noShowMoneyWords({ ...nothing, lateFeePercent: 100, feePence: 4200, keptPence: 4200 }, business, formatPence)).toEqual([
      'The £42 they paid is kept as the fee.',
    ]);
    expect(noShowMoneyWords({ ...nothing, lateFeePercent: 100, feePence: 4200, charging: true }, business, formatPence)).toEqual([
      'The £42 fee is being charged to their saved card.',
    ]);
  });

  it('says there is no charge when the policy keeps nothing, and gives back what was paid', () => {
    expect(noShowMoneyWords({ ...nothing, lateFeePercent: 0 }, learner, formatPence)).toEqual(['There is no charge.']);
    expect(noShowMoneyWords({ ...nothing, lateFeePercent: 0, cardRefundPence: 4200 }, learner, formatPence)).toEqual(['£42 is going back to your card.']);
    expect(noShowMoneyWords({ ...nothing, lateFeePercent: 0 }, business, formatPence)).toEqual([]);
  });
});

describe('what the learner is told when a dispute is decided (R-09, M3-19)', () => {
  const decision = {
    outcome: 'waived' as const,
    feePence: 4200,
    keptPence: 0,
    cardRefundPence: 0,
    offlineRefundPence: 0,
    creditReturnedMinutes: 0,
    creditKeptMinutes: 0,
    charging: false,
  };

  it('says the fee is waived and what comes back, or that nothing is owed', () => {
    expect(disputeDecisionWords({ ...decision, cardRefundPence: 4200 }, formatPence)).toEqual(['The £42 fee is waived.', '£42 is going back to your card.']);
    expect(disputeDecisionWords({ ...decision, creditReturnedMinutes: 60 }, formatPence)).toEqual(['The £42 fee is waived.', '1 hour of credit is back.']);
    expect(disputeDecisionWords({ ...decision, offlineRefundPence: 4200 }, formatPence)).toEqual(['The £42 fee is waived.', 'You are owed back the £42 you paid.']);
    expect(disputeDecisionWords(decision, formatPence)).toEqual(['The £42 fee is waived, so nothing is owed.']);
    expect(disputeDecisionWords({ ...decision, feePence: 0 }, formatPence)).toEqual(['The fee is waived, so nothing is owed.']);
  });

  it('says the fee stands when it is kept', () => {
    expect(disputeDecisionWords({ ...decision, outcome: 'kept' }, formatPence)).toEqual(['The fee stands.']);
  });
});
