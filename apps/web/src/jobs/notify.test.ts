import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const listSavedCards = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));
vi.mock('@/lib/payments/provider', () => ({ paymentsProvider: () => ({ listSavedCards }) }));

const { notifyAboutBooking } = await import('./notify');

const missed = {
  booking_id: 'book-1',
  business_id: 'business-1',
  status: 'no_show',
  version: 3,
  starts_at: '2026-10-21T09:15:00Z',
  learner_user_id: 'lily',
  learner_name: 'Lily Learner',
  instructor_user_id: 'sam',
  instructor_name: 'Sam Solo',
  school_user_ids: [],
  fee_pence: 2100,
  price_pence: 4200,
  payment_mode: 'at_booking',
  payment_status: 'unpaid',
};

const noShow = {
  name: 'booking.no_show',
  payload: { booking_id: 'book-1', fee_pence: 2100, kept_pence: 0, fee_percent: 50, charging: true, dispute_until: '2026-10-28T09:15:00Z' },
};

const card = { paymentMethodId: 'pm_1', brand: 'visa', last4: '4242', expiryMonth: 12, expiryYear: 2030 };

/** Answers each `system_*` function by name, the way the database would. */
function database(notice: Record<string, unknown>, fee: Record<string, unknown> | null) {
  rpc.mockImplementation((name: string, args: Record<string, unknown> = {}) => {
    if (name === 'system_booking_notice') return Promise.resolve({ data: notice, error: null });
    if (name === 'system_fee_to_charge') return Promise.resolve({ data: fee, error: null });
    if (name === 'system_notification_mutes') return Promise.resolve({ data: [], error: null });
    if (name === 'system_notify') return Promise.resolve({ data: (args.p_rows as unknown[]).length, error: null });
    throw new Error(`Nothing answers ${name}`);
  });
}

const learnerBody = (): string => {
  const rows = rpc.mock.calls.filter(([name]) => name === 'system_notify').flatMap(([, args]) => (args as { p_rows: { user_id: string; body: string }[] }).p_rows);
  return rows.find((row) => row.user_id === 'lily')?.body ?? '';
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a fee is said to come off a saved card only when one does (PAY-09, D-310)', () => {
  it('tells a learner who paid by card but kept no card that the fee is owed, not that it is being charged', async () => {
    database(missed, { account_id: 'acct_1', customer_id: 'cus_lily' });
    listSavedCards.mockResolvedValue({ ok: true, data: [] });

    await notifyAboutBooking(noShow);
    expect(listSavedCards).toHaveBeenCalledWith({ accountId: 'acct_1', customerId: 'cus_lily' });
    expect(learnerBody()).toContain('a fee of £21 is owed');
    expect(learnerBody()).not.toContain('saved card');
  });

  it('says it is being charged to the saved card when the Business keeps one that works', async () => {
    database(missed, { account_id: 'acct_1', customer_id: 'cus_lily' });
    listSavedCards.mockResolvedValue({ ok: true, data: [card] });

    await notifyAboutBooking(noShow);
    expect(learnerBody()).toContain('the £21 fee is being charged to your saved card');
  });

  it('counts a card that has run out as no card at all', async () => {
    database(missed, { account_id: 'acct_1', customer_id: 'cus_lily' });
    listSavedCards.mockResolvedValue({ ok: true, data: [{ ...card, expiryYear: 2020 }] });

    await notifyAboutBooking(noShow);
    expect(learnerBody()).toContain('a fee of £21 is owed');
  });

  it('keeps the words for a fee already charged, with nothing to ask the provider', async () => {
    database({ ...missed, payment_status: 'paid_card' }, null);

    await notifyAboutBooking(noShow);
    expect(listSavedCards).not.toHaveBeenCalled();
    expect(learnerBody()).toContain('being charged to your saved card');
  });

  it('asks nothing when the database never meant to charge a card', async () => {
    database(missed, null);

    await notifyAboutBooking({ ...noShow, payload: { ...noShow.payload, charging: false } });
    expect(rpc).not.toHaveBeenCalledWith('system_fee_to_charge', expect.anything());
    expect(listSavedCards).not.toHaveBeenCalled();
    expect(learnerBody()).toContain('a fee of £21 is owed');
  });

  it('says so when the cards cannot be read, so the job tries again rather than guessing', async () => {
    database(missed, { account_id: 'acct_1', customer_id: 'cus_lily' });
    listSavedCards.mockResolvedValue({ ok: false, reason: 'UNAVAILABLE', message: 'down' });

    await expect(notifyAboutBooking(noShow)).rejects.toThrow("Could not read a learner's cards: down");
  });
});
