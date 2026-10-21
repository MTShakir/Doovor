import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const maybeSingle = vi.fn();
const getAccess = vi.fn<() => Promise<unknown>>();
const needsToAgree = vi.fn<() => Promise<boolean>>();
const keptCardsWith = vi.fn<(businessId: string) => Promise<unknown>>();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve({ rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) }),
}));
vi.mock('@/lib/auth/session', () => ({ getAccess: () => getAccess(), needsToAgree: () => needsToAgree() }));
vi.mock('@/lib/payments/cards', () => ({ keptCardsWith: (businessId: string) => keptCardsWith(businessId) }));
vi.mock('@/lib/booking/public', () => ({ openSlots: () => Promise.resolve([]) }));
vi.mock('@/lib/redirect-to', () => ({ redirectTo: () => undefined }));
vi.mock('next/headers', () => ({ cookies: () => Promise.resolve({ set: () => undefined }) }));

const { bookAsLearner } = await import('./actions');

const input = {
  instructorId: '3f1c7a52-8d4e-4b6a-9c2f-5e8d7b1a0c34',
  lessonTypeId: '9a2b4c6d-8e0f-4a1b-8c3d-5e7f9a1b3c5d',
  startsAt: '2026-10-27T10:00:00.000Z',
  durationMinutes: 60,
};

/** The lesson as the database has it once it is made, at a Business that takes cards unless said otherwise. */
function lessonIs(
  lesson: { status: string; payment_status: string; payment_mode?: string; hold_expires_at?: string | null },
  takesCards = true,
) {
  const mode = lesson.payment_mode ?? 'at_booking';
  maybeSingle.mockResolvedValue({
    data: {
      business_id: 'business-1',
      hold_expires_at: null,
      ...lesson,
      payment_mode: mode,
      businesses: { stripe_charges_enabled: takesCards, settings: { payment_mode: mode } },
    },
    error: null,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getAccess.mockResolvedValue({ session: { userId: 'learner-1' }, access: { isLearner: true } });
  rpc.mockResolvedValue({ data: 'booking-1', error: null });
  keptCardsWith.mockResolvedValue(null);
  needsToAgree.mockResolvedValue(false);
});

describe('what is left to do once a learner books on a link (BOK-02, PAY-03, D-318)', () => {
  it('is nothing, for a lesson credit paid for', async () => {
    lessonIs({ status: 'confirmed', payment_status: 'paid_credit' });
    expect(await bookAsLearner(input)).toEqual({
      ok: true,
      data: { bookingId: 'booking-1', status: 'confirmed', next: 'nothing', paidWithCredit: true, holdUntil: null, paidLater: null },
    });
  });

  it('is keeping a card, for a lesson charged the day before, until one is kept (D-328)', async () => {
    lessonIs({ status: 'confirmed', payment_status: 'unpaid', payment_mode: 'before_lesson' });
    expect(await bookAsLearner(input)).toMatchObject({ ok: true, data: { next: 'save_card', paidLater: 'day_before' } });
    expect(keptCardsWith).toHaveBeenCalledWith('business-1');

    keptCardsWith.mockResolvedValue({ cards: [{ paymentMethodId: 'pm_1' }] });
    expect(await bookAsLearner(input)).toMatchObject({ ok: true, data: { next: 'nothing', paidLater: 'day_before' } });
  });

  it('is nothing now, for a lesson paid for by a link once it is done (D-328)', async () => {
    lessonIs({ status: 'confirmed', payment_status: 'unpaid', payment_mode: 'after_lesson' });
    expect(await bookAsLearner(input)).toMatchObject({ ok: true, data: { next: 'nothing', paidLater: 'after' } });
    expect(keptCardsWith).not.toHaveBeenCalled();
  });

  it('is paying to confirm a time held for it, by when it is held', async () => {
    lessonIs({ status: 'pending_payment', payment_status: 'unpaid', hold_expires_at: '2026-10-21T14:47:00+00:00' });
    expect(await bookAsLearner(input)).toMatchObject({
      ok: true,
      data: { status: 'pending_payment', next: 'pay_to_confirm', paidWithCredit: false, holdUntil: '2026-10-21T14:47:00+00:00' },
    });
  });

  it('is authorising a request, which is charged only if accepted', async () => {
    lessonIs({ status: 'requested', payment_status: 'unpaid' });
    expect(await bookAsLearner(input)).toMatchObject({ ok: true, data: { status: 'requested', next: 'authorise', holdUntil: null } });
  });

  it('is paying for a booked lesson, now or later, or nothing where no card is taken', async () => {
    lessonIs({ status: 'confirmed', payment_status: 'unpaid' });
    expect(await bookAsLearner(input)).toMatchObject({ ok: true, data: { status: 'confirmed', next: 'pay' } });

    lessonIs({ status: 'confirmed', payment_status: 'unpaid' }, false);
    expect(await bookAsLearner(input)).toMatchObject({ ok: true, data: { next: 'nothing', paidWithCredit: false } });
  });

  it('asks the database to book it, and passes on what it refused', async () => {
    lessonIs({ status: 'confirmed', payment_status: 'unpaid' });
    await bookAsLearner(input);
    expect(rpc).toHaveBeenCalledWith('create_booking', {
      p_instructor_id: input.instructorId,
      p_learner_id: 'learner-1',
      p_lesson_type_id: input.lessonTypeId,
      p_starts_at: input.startsAt,
      p_duration_minutes: 60,
    });

    rpc.mockResolvedValueOnce({ data: null, error: { code: '23P01', message: 'SLOT_TAKEN' } });
    expect(await bookAsLearner(input)).toMatchObject({ ok: false, code: 'SLOT_TAKEN' });
  });

  it('books nothing for a learner who has still to agree to the current terms (D-265)', async () => {
    needsToAgree.mockResolvedValue(true);
    expect(await bookAsLearner(input)).toMatchObject({ ok: false, code: 'NOT_ALLOWED', message: 'Agree to our terms before you book. Open the link again to do it.' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('books nothing for somebody who is not a learner, or for what is not a lesson', async () => {
    getAccess.mockResolvedValueOnce({ session: { userId: 'instructor-1' }, access: { isLearner: false } });
    expect(await bookAsLearner(input)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(await bookAsLearner({ ...input, startsAt: 'tomorrow' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
