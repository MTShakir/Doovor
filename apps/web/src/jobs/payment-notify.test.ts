import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));

const { notifyAboutPayment, notifyCreditLow, notifyOverdueLessons, sendDailyPaymentSummaries } = await import('./payment-notify');

type Answers = Record<string, (args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }>;

/** Answers each `system_*` function by name, the way the database would. */
function database(answers: Answers) {
  rpc.mockImplementation((name: string, args: Record<string, unknown> = {}) => {
    const answer = answers[name];
    if (answer === undefined) throw new Error(`Nothing answers ${name}`);
    return Promise.resolve(answer(args));
  });
}

const ok = (data: unknown) => () => ({ data, error: null });
const written = (args: Record<string, unknown>) => ({ data: (args.p_rows as unknown[]).length, error: null });
const rowsWritten = () =>
  rpc.mock.calls.filter(([name]) => name === 'system_notify').flatMap(([, args]) => (args as { p_rows: Record<string, unknown>[] }).p_rows);

const payment = {
  payment_id: 'payment-1',
  business_id: 'business-1',
  amount_pence: 4200,
  method: 'card',
  booking_id: 'booking-1',
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

beforeEach(() => {
  vi.clearAllMocks();
});

describe('telling people about a payment received (NTF-03, M3-22)', () => {
  it('writes a notification for the learner and the instructor, about the payment, leaving out channels they switched off', async () => {
    database({
      system_payment_notice: ok(payment),
      system_notification_mutes: ok([{ user_id: 'instructor-1', channel: 'email' }]),
      system_notify: written,
    });

    expect(await notifyAboutPayment('payment-1')).toEqual({ written: 2 });
    expect(rpc).toHaveBeenCalledWith('system_notification_mutes', { p_user_ids: ['learner-1', 'instructor-1'], p_category: 'money' });
    expect(rowsWritten().map((row) => [row.user_id, row.kind, row.entity_type, row.entity_id, row.business_id])).toEqual([
      ['learner-1', 'payment.received', 'payment', 'payment-1', 'business-1'],
      ['instructor-1', 'payment.received', 'payment', 'payment-1', 'business-1'],
    ]);
    // Money is a service message, so it still reaches the inbox; the email was switched off.
    expect(rowsWritten()[1]?.channels).toEqual(['in_app', 'push']);
  });

  it('waits out the ten minutes cash can be taken back out in, and tells nobody about a payment that is not there', async () => {
    database({ system_payment_notice: ok({ wait_until: '2026-09-16T08:10:00+00:00' }) });
    expect(await notifyAboutPayment('payment-1')).toEqual({ written: 0, waitUntil: '2026-09-16T08:10:00+00:00' });

    database({ system_payment_notice: ok(null) });
    expect(await notifyAboutPayment('payment-1')).toEqual({ written: 0 });
    expect(rpc).not.toHaveBeenCalledWith('system_notify', expect.anything());
  });

  it('fails loudly when the database cannot be read, so the job tries again', async () => {
    database({ system_payment_notice: () => ({ data: null, error: { message: 'connection refused' } }) });
    await expect(notifyAboutPayment('payment-1')).rejects.toThrow('Could not read the payment to notify about it: connection refused');
  });
});

describe('the morning sweep for money owed (NTF-03, M3-22)', () => {
  const lesson = {
    booking_id: 'booking-1',
    business_id: 'business-1',
    status: 'completed',
    version: 3,
    starts_at: '2026-09-10T08:00:00+00:00',
    learner_user_id: 'learner-1',
    learner_name: 'Jack Taylor',
    instructor_user_id: 'instructor-1',
    instructor_name: 'Sarah Khan',
    school_user_ids: ['manager-1'],
  };

  it('tells everybody each overdue lesson concerns, and skips a lesson gone since it was found', async () => {
    database({
      system_overdue_lessons: ok([
        { booking_id: 'booking-1', due_at: '2026-09-10T08:00:00Z', amount_pence: 4200, in_person: false },
        { booking_id: 'booking-gone', due_at: '2026-09-10T09:00:00Z', amount_pence: 4200, in_person: false },
      ]),
      system_booking_notice: (args) => ({ data: args.p_booking_id === 'booking-1' ? lesson : null, error: null }),
      system_notification_mutes: ok([]),
      system_notify: written,
    });

    expect(await notifyOverdueLessons()).toEqual({ looked: 2, written: 3 });
    expect(rowsWritten().map((row) => [row.user_id, row.kind, row.dedupe_key])).toEqual([
      ['learner-1', 'payment.overdue', 'payment.overdue:booking-1:overdue:learner-1'],
      ['instructor-1', 'payment.overdue', 'payment.overdue:booking-1:overdue:instructor-1'],
      ['manager-1', 'payment.overdue', 'payment.overdue:booking-1:overdue:manager-1'],
    ]);
  });

  it('writes nothing when nothing is owed', async () => {
    database({ system_overdue_lessons: ok([]) });
    expect(await notifyOverdueLessons()).toEqual({ looked: 0, written: 0 });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe('credit running low (NTF-03, M3-22)', () => {
  it('tells the learner and their instructor, about the credit account', async () => {
    database({
      system_credit_notice: ok({
        account_id: 'account-1',
        business_id: 'business-1',
        business_name: 'Quayside Driving School',
        balance_minutes: 60,
        latest_lot_id: 'lot-1',
        learner_user_id: 'learner-1',
        learner_name: 'Jack Taylor',
        instructor_user_id: 'instructor-1',
        instructor_name: 'Emma Clarke',
      }),
      system_notification_mutes: ok([]),
      system_notify: written,
    });

    expect(await notifyCreditLow('business-1', 'learner-1')).toEqual({ written: 2 });
    expect(rpc).toHaveBeenCalledWith('system_credit_notice', { p_business_id: 'business-1', p_learner_id: 'learner-1' });
    expect(rowsWritten().map((row) => [row.user_id, row.entity_type, row.entity_id])).toEqual([
      ['learner-1', 'credit_account', 'account-1'],
      ['instructor-1', 'credit_account', 'account-1'],
    ]);
  });
});

describe("a school's day, the next morning (NTF-03, M3-22)", () => {
  it('sums up yesterday in London, midnight to midnight, for each school', async () => {
    database({
      system_daily_payment_summaries: ok([
        { business_id: 'school-1', business_name: 'Quayside Driving School', total_pence: 42000, count: 10, user_ids: ['owner-1', 'manager-1'] },
      ]),
      system_notification_mutes: ok([]),
      system_notify: written,
    });

    // 08:00 on Tuesday 15 September in London is 07:00 in UTC.
    expect(await sendDailyPaymentSummaries(new Date('2026-09-15T07:00:00Z'))).toEqual({ day: '2026-09-14', schools: 1, written: 2 });
    expect(rpc).toHaveBeenCalledWith('system_daily_payment_summaries', {
      p_from: '2026-09-13T23:00:00.000Z',
      p_to: '2026-09-14T23:00:00.000Z',
    });
    expect(rowsWritten().map((row) => [row.user_id, row.body, row.entity_type])).toEqual([
      ['owner-1', '£420 from 10 payments on Mon 14 Sep at Quayside Driving School.', 'business'],
      ['manager-1', '£420 from 10 payments on Mon 14 Sep at Quayside Driving School.', 'business'],
    ]);
  });

  it('covers the whole of the day the clocks go back, and writes nothing for a day nobody paid', async () => {
    database({ system_daily_payment_summaries: ok([]) });

    // Sunday 25 October 2026 is 25 hours long in London.
    expect(await sendDailyPaymentSummaries(new Date('2026-10-26T08:00:00Z'))).toEqual({ day: '2026-10-25', schools: 0, written: 0 });
    expect(rpc).toHaveBeenCalledWith('system_daily_payment_summaries', {
      p_from: '2026-10-24T23:00:00.000Z',
      p_to: '2026-10-26T00:00:00.000Z',
    });
  });
});
