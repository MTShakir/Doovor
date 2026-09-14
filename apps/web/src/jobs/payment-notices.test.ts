import { describe, expect, it } from 'vitest';
import type { BookingNotice } from './booking-notices';
import {
  peopleToTellAboutPayment,
  planCreditLow,
  planDailySummary,
  planOverdue,
  planPaymentReceived,
  type CreditNotice,
  type PaymentNotice,
} from './payment-notices';

const payment: PaymentNotice = {
  payment_id: 'payment-1',
  business_id: 'business-1',
  amount_pence: 4200,
  method: 'card',
  booking_id: 'booking-1',
  // 09:00 London, in British Summer Time.
  starts_at: '2026-09-16T08:00:00+00:00',
  booking_status: 'confirmed',
  fee_pence: null,
  credit_minutes: null,
  learner_user_id: 'learner-1',
  learner_name: 'Jack Taylor',
  instructor_user_id: 'instructor-1',
  instructor_name: 'Sarah Khan',
  recorded_by: null,
};

describe('a payment received (NTF-03, M3-22, Appendix B)', () => {
  it('tells the instructor who paid what, and the learner without a second email, since their receipt is one', () => {
    const planned = planPaymentReceived(payment);

    expect(planned.map((one) => [one.userId, one.kind, one.channels])).toEqual([
      ['learner-1', 'payment.received', ['in_app', 'push']],
      ['instructor-1', 'payment.received', ['in_app', 'push', 'email']],
    ]);
    expect(planned[0]).toMatchObject({ title: 'Payment received', body: '£42 by card. Wed 16 Sep at 09:00 with Sarah Khan.', link: '/app/learner/payments' });
    expect(planned[1]).toMatchObject({ title: 'Jack Taylor paid', body: '£42 by card. Wed 16 Sep at 09:00 with Jack Taylor.', link: '/app/instructor/learners/learner-1' });
    expect(planned[1]?.dedupeKey).toBe('payment.received:payment-1:0:instructor-1');
  });

  it('says what credit and fees were bought with the money', () => {
    const credit = planPaymentReceived({ ...payment, booking_id: null, starts_at: null, booking_status: null, credit_minutes: 600, amount_pence: 38000, method: 'cash' });
    expect(credit[1]?.body).toBe('£380 for 10 hours of credit.');
    expect(planPaymentReceived({ ...payment, booking_status: 'no_show', fee_pence: 4200 })[1]?.body).toContain('£42 by card as the no-show fee');
    expect(planPaymentReceived({ ...payment, booking_status: 'cancelled', fee_pence: 2100, amount_pence: 2100 })[1]?.body).toContain(
      '£21 by card as the late cancellation fee',
    );
    // The lesson itself, paid for and then called off before anybody was told: not a fee.
    expect(planPaymentReceived({ ...payment, booking_status: 'cancelled', fee_pence: 2100 })[1]?.body).toBe(
      '£42 by card. Wed 16 Sep at 09:00 with Jack Taylor.',
    );
  });

  it('does not tell an instructor about their own payment twice', () => {
    expect(planPaymentReceived({ ...payment, instructor_user_id: 'learner-1' }).map((one) => one.userId)).toEqual(['learner-1']);
    expect(planPaymentReceived({ ...payment, instructor_user_id: null }).map((one) => one.userId)).toEqual(['learner-1']);
    expect(peopleToTellAboutPayment({ ...payment, instructor_user_id: null })).toEqual(['learner-1']);
  });

  it('does not tell the instructor who marked the cash paid, but does when somebody else at the school did', () => {
    const cash = { ...payment, method: 'cash' };
    expect(planPaymentReceived({ ...cash, recorded_by: 'instructor-1' }).map((one) => one.userId)).toEqual(['learner-1']);
    expect(planPaymentReceived({ ...cash, recorded_by: 'manager-1' }).map((one) => [one.userId, one.body])).toEqual([
      ['learner-1', '£42 in cash. Wed 16 Sep at 09:00 with Sarah Khan.'],
      ['instructor-1', '£42 in cash. Wed 16 Sep at 09:00 with Jack Taylor.'],
    ]);
  });
});

const lesson: BookingNotice = {
  booking_id: 'booking-1',
  business_id: 'business-1',
  status: 'completed',
  version: 3,
  starts_at: '2026-09-16T08:00:00+00:00',
  learner_user_id: 'learner-1',
  learner_name: 'Jack Taylor',
  instructor_user_id: 'instructor-1',
  instructor_name: 'Sarah Khan',
  school_user_ids: ['manager-1'],
};

describe('a lesson owed for two days (NTF-03, M3-22)', () => {
  const overdue = { booking_id: 'booking-1', due_at: '2026-09-16T08:00:00Z', amount_pence: 4200, in_person: false };

  it('asks the learner to pay it and tells the instructor and the school, once', () => {
    const planned = planOverdue(overdue, lesson);

    expect(planned.map((one) => [one.userId, one.title])).toEqual([
      ['learner-1', 'Payment overdue'],
      ['instructor-1', 'A payment from Jack Taylor is overdue'],
      ['manager-1', 'A payment from Jack Taylor is overdue'],
    ]);
    expect(planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Sarah Khan. £42 has been owed since Wed 16 Sep. Pay it now.');
    expect(planned[0]?.link).toBe('/app/learner/pay/booking-1');
    expect(planned[1]?.body).toBe('Wed 16 Sep at 09:00 with Jack Taylor. £42 has been owed since Wed 16 Sep.');
    expect(planned[0]?.dedupeKey).toBe('payment.overdue:booking-1:overdue:learner-1');
  });

  it('does not chase a learner for a lesson paid in person, and asks the instructor to mark it paid if it was', () => {
    const planned = planOverdue({ ...overdue, in_person: true }, lesson);

    expect(planned.map((one) => one.userId)).toEqual(['instructor-1', 'manager-1']);
    expect(planned[0]?.body).toBe('Wed 16 Sep at 09:00 with Jack Taylor. £42 has been owed since Wed 16 Sep. If it was paid in person, mark it paid.');
  });
});

describe('credit running low (NTF-03, M3-22)', () => {
  const credit: CreditNotice = {
    account_id: 'account-1',
    business_id: 'business-1',
    business_name: 'Quayside Driving School',
    balance_minutes: 90,
    latest_lot_id: 'lot-2',
    learner_user_id: 'learner-1',
    learner_name: 'Jack Taylor',
    instructor_user_id: 'instructor-1',
    instructor_name: 'Emma Clarke',
  };

  it('tells the learner and their instructor what is left, once for each package bought', () => {
    const planned = planCreditLow(credit);

    expect(planned.map((one) => [one.userId, one.title, one.body])).toEqual([
      ['learner-1', 'Your credit is running low', '1 hour 30 minutes of credit left with Quayside Driving School. Top it up before your next lesson.'],
      ['instructor-1', 'Jack Taylor is running low on credit', '1 hour 30 minutes of credit left.'],
    ]);
    expect(planned.map((one) => one.dedupeKey)).toEqual(['credit.low:account-1:lot-2:learner-1', 'credit.low:account-1:lot-2:instructor-1']);
  });

  it('says so when there is none left, and nothing once it has been topped up again', () => {
    expect(planCreditLow({ ...credit, balance_minutes: 0 })[0]?.body).toContain('No credit left with Quayside Driving School');
    expect(planCreditLow({ ...credit, balance_minutes: 600 })).toEqual([]);
    expect(planCreditLow({ ...credit, instructor_user_id: null }).map((one) => one.userId)).toEqual(['learner-1']);
  });
});

describe('the day before, for a school (NTF-03, M3-22)', () => {
  it('sums up a day for its owners and managers, once for each day', () => {
    const planned = planDailySummary(
      { business_id: 'business-1', business_name: 'Quayside Driving School', total_pence: 42000, count: 10, user_ids: ['owner-1', 'manager-1'] },
      '2026-09-14',
    );

    expect(planned.map((one) => [one.userId, one.title, one.body, one.link])).toEqual([
      ['owner-1', 'Payments yesterday', '£420 from 10 payments on Mon 14 Sep at Quayside Driving School.', '/app/school/money'],
      ['manager-1', 'Payments yesterday', '£420 from 10 payments on Mon 14 Sep at Quayside Driving School.', '/app/school/money'],
    ]);
    expect(planned[0]?.dedupeKey).toBe('payment.daily_summary:business-1:2026-09-14:owner-1');
    expect(planDailySummary({ business_id: 'b', business_name: 'Bee School', total_pence: 4200, count: 1, user_ids: ['owner-1'] }, '2026-09-14')[0]?.body).toBe(
      '£42 from 1 payment on Mon 14 Sep at Bee School.',
    );
  });
});
