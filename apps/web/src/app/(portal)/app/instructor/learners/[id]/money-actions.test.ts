import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({
  requirePortal: () => Promise.resolve({ session: { userId: 'instructor-1' }, access: {} }),
}));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => { revalidatePath(path); } }));

const { decideNoShowDispute, issueRefund, markHandedBack, recordOfflinePackage, refundOptions } = await import('./money-actions');

const learnerId = '11111111-1111-4111-8111-111111111111';
const packageId = '33333333-3333-4333-8333-333333333333';
const lotId = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: lotId, error: null });
});

describe('a package paid for in person (PAY-04, PAY-05, M3-16)', () => {
  it('records it through the function that writes the payment and the credit together', async () => {
    expect(await recordOfflinePackage({ learnerId, packageId, method: 'cash' })).toEqual({ ok: true, data: { lotId } });
    expect(rpc).toHaveBeenCalledWith('record_offline_package', {
      p_learner_id: learnerId,
      p_package_id: packageId,
      p_method: 'cash',
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/instructor/learners/${learnerId}`);
  });

  it('asks nothing of the database for a learner, package or method it does not recognise', async () => {
    expect(await recordOfflinePackage({ learnerId, packageId, method: 'cheque' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(await recordOfflinePackage({ learnerId: 'nope', packageId, method: 'cash' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes on what the database refused', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await recordOfflinePackage({ learnerId, packageId, method: 'bank' })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });

    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "package"}' } });
    expect(await recordOfflinePackage({ learnerId, packageId, method: 'bank' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

const paymentId = '55555555-5555-4555-8555-555555555555';

describe('what can be refunded, and refunding it (PAY-07, M3-17)', () => {
  it('reads what is left to give back for a lesson, and for credit bought', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        payment_id: paymentId, method: 'card', status: 'paid', amount_pence: 4200, refunded_pence: 0, pending_pence: 1000,
        refundable_pence: 3200, lesson_at: '2026-09-15T09:00:00Z', lesson_minutes: 60, lot: null,
      },
      error: null,
    });
    expect(await refundOptions({ paymentId })).toEqual({
      ok: true,
      data: { paymentId, method: 'card', amountPence: 4200, refundablePence: 3200, lessonAt: '2026-09-15T09:00:00Z', lessonMinutes: 60, lot: null },
    });

    rpc.mockResolvedValueOnce({
      data: {
        payment_id: paymentId, method: 'cash', status: 'paid', amount_pence: 38000, refunded_pence: 0, pending_pence: 0,
        refundable_pence: 38000, lesson_at: null, lesson_minutes: null,
        lot: { minutes_total: 600, usable_minutes: 540, price_pence: 38000, value_pence: 34200 },
      },
      error: null,
    });
    const credit = await refundOptions({ paymentId });
    expect(credit).toMatchObject({ ok: true, data: { lot: { minutesTotal: 600, usableMinutes: 540, pricePence: 38000, valuePence: 34200 } } });
  });

  it('says who may not, as the database decides', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await refundOptions({ paymentId })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
  });

  it('refunds a lesson by an amount, or credit by the minute, always with a reason', async () => {
    rpc.mockResolvedValue({ data: 'refund-1', error: null });

    expect(await issueRefund({ paymentId, learnerId, reason: ' Lesson ran short ', to: 'payment', amountPence: 1000 })).toEqual({
      ok: true,
      data: { refundId: 'refund-1' },
    });
    expect(rpc).toHaveBeenLastCalledWith('issue_refund', {
      p_payment_id: paymentId,
      p_reason: 'Lesson ran short',
      p_amount_pence: 1000,
      p_minutes: undefined,
      p_to: 'payment',
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/instructor/learners/${learnerId}`);

    await issueRefund({ paymentId, learnerId, reason: 'Moving away', to: 'payment', minutes: 120 });
    expect(rpc).toHaveBeenLastCalledWith('issue_refund', {
      p_payment_id: paymentId,
      p_reason: 'Moving away',
      p_amount_pence: undefined,
      p_minutes: 120,
      p_to: 'payment',
    });
  });

  it('refuses a refund with no reason, both an amount and minutes, or nothing to give back', async () => {
    for (const bad of [
      { paymentId, learnerId, reason: '  ', to: 'payment' },
      { paymentId, learnerId, reason: 'Both', to: 'payment', amountPence: 100, minutes: 30 },
      { paymentId, learnerId, reason: 'Nothing', to: 'payment', amountPence: 0 },
      { paymentId, learnerId, reason: 'Where', to: 'cheque' },
    ]) {
      expect(await issueRefund(bad)).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes on what the database refused', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await issueRefund({ paymentId, learnerId, reason: 'Goodwill', to: 'payment' })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });
  });
});

describe('cash owed back, handed back (R-08, M3-18)', () => {
  const refundId = '66666666-6666-4666-8666-666666666666';

  it('settles it through the function that decides who may', async () => {
    rpc.mockResolvedValue({ data: { applied: true }, error: null });

    expect(await markHandedBack({ refundId, learnerId })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('settle_offline_refund', { p_refund_id: refundId });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/instructor/learners/${learnerId}`);
  });

  it('asks nothing of the database for a refund it does not recognise', async () => {
    expect(await markHandedBack({ refundId: 'nope', learnerId })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes on what the database refused: somebody else, or handed back already', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await markHandedBack({ refundId, learnerId })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "status"}' } });
    expect(await markHandedBack({ refundId, learnerId })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('deciding a no-show dispute (R-09, M3-19)', () => {
  const disputeId = '77777777-7777-4777-8777-777777777777';

  it('waives or keeps the fee through the function that decides who may, with a note if given', async () => {
    rpc.mockResolvedValue({ data: { outcome: 'waived' }, error: null });

    expect(await decideNoShowDispute({ disputeId, learnerId, outcome: 'waived', note: ' Sorry ' })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenLastCalledWith('decide_no_show_dispute', { p_dispute_id: disputeId, p_outcome: 'waived', p_note: 'Sorry' });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/instructor/learners/${learnerId}`);

    await decideNoShowDispute({ disputeId, learnerId, outcome: 'kept' });
    expect(rpc).toHaveBeenLastCalledWith('decide_no_show_dispute', { p_dispute_id: disputeId, p_outcome: 'kept', p_note: undefined });
  });

  it('asks nothing of the database for an outcome it does not know', async () => {
    expect(await decideNoShowDispute({ disputeId, learnerId, outcome: 'maybe' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes on what the database refused: a school instructor, or decided already', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await decideNoShowDispute({ disputeId, learnerId, outcome: 'waived' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
