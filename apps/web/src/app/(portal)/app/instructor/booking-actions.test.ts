import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({
  requirePortal: () =>
    Promise.resolve({
      session: { userId: 'instructor-1' },
      access: { memberships: [{ instructorProfileId: 'profile-1', businessId: 'business-1' }] },
    }),
}));
vi.mock('@/lib/booking/day', () => ({ bookingDay: vi.fn(), lessonOptions: vi.fn() }));
vi.mock('@/lib/forms', () => ({ fieldErrors: vi.fn() }));
const lessonDetails = vi.fn<(bookingId: string) => Promise<unknown>>();
const defaultPickupFor = vi.fn<(learnerId: string) => Promise<string | null>>();
vi.mock('@/lib/pickup/list', () => ({ defaultPickupFor: (learnerId: string) => defaultPickupFor(learnerId) }));
vi.mock('@/lib/lessons/details', () => ({ lessonDetails: (bookingId: string) => lessonDetails(bookingId) }));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => { revalidatePath(...args); } }));

const { bookLesson, lessonDetailsFor, recordOfflinePayment, sendReminder, undoOfflinePayment } = await import('./booking-actions');

const bookingId = '6f1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13';
const paymentId = '2b7e1d44-3c9a-4f0e-9a1b-5d6c7e8f9a0b';

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: paymentId, error: null });
});

describe('recording a lesson paid in person (PAY-05, M3-15)', () => {
  it('records cash or a bank transfer against the lesson, and hands back the payment for undo', async () => {
    expect(await recordOfflinePayment({ bookingId, method: 'cash' })).toEqual({ ok: true, data: { paymentId } });
    expect(rpc).toHaveBeenCalledWith('record_offline_payment', { p_booking_id: bookingId, p_method: 'cash' });

    await recordOfflinePayment({ bookingId, method: 'bank' });
    expect(rpc).toHaveBeenLastCalledWith('record_offline_payment', { p_booking_id: bookingId, p_method: 'bank' });
    expect(revalidatePath).toHaveBeenCalledWith('/app/instructor/diary');
  });

  it('asks the database nothing about a lesson or a method it does not recognise', async () => {
    expect(await recordOfflinePayment({ bookingId, method: 'cheque' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(await recordOfflinePayment({ bookingId: 'nope', method: 'cash' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes on what the database refused, in the words the screen uses', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "payment"}' } });
    expect(await recordOfflinePayment({ bookingId, method: 'cash' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });

    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await recordOfflinePayment({ bookingId, method: 'cash' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('undoing it (PAY-05, M3-15)', () => {
  it('takes the payment back out', async () => {
    rpc.mockResolvedValue({ data: bookingId, error: null });

    expect(await undoOfflinePayment({ paymentId })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('undo_offline_payment', { p_payment_id: paymentId });
  });

  it('says so when it is too late, or not theirs to undo', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "payment"}' } });
    expect(await undoOfflinePayment({ paymentId })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(await undoOfflinePayment({ paymentId: 'nope' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
  });
});

describe('opening a lesson (DIA-04, D-166)', () => {
  it('hands the sheet what the database lets this person see of the lesson', async () => {
    const details = { id: bookingId, learner: { id: 'learner-1', name: 'Jack Taylor', phone: '+447700900001', email: null } };
    lessonDetails.mockResolvedValue(details);
    expect(await lessonDetailsFor({ bookingId })).toEqual({ ok: true, data: details });
    expect(lessonDetails).toHaveBeenCalledWith(bookingId);
  });

  it('says not found for a lesson that is not theirs, rather than anything about it', async () => {
    lessonDetails.mockResolvedValue(null);
    expect(await lessonDetailsFor({ bookingId })).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });

  it('asks nothing for something that is not a lesson', async () => {
    expect(await lessonDetailsFor({ bookingId: 'nope' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(lessonDetails).not.toHaveBeenCalled();
  });
});

describe('sending a reminder by hand (NTF-02, D-166)', () => {
  it('asks the database for one, by email or by text', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await sendReminder({ bookingId, channel: 'email' })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('request_lesson_reminder', { p_booking_id: bookingId, p_channel: 'email' });
    await sendReminder({ bookingId, channel: 'sms' });
    expect(rpc).toHaveBeenLastCalledWith('request_lesson_reminder', { p_booking_id: bookingId, p_channel: 'sms' });
  });

  it('asks nothing for a way there is not', async () => {
    expect(await sendReminder({ bookingId, channel: 'post' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('says so when one already went this way within the hour', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '53400', message: 'RATE_LIMITED' } });
    expect(await sendReminder({ bookingId, channel: 'email' })).toMatchObject({ ok: false, code: 'RATE_LIMITED' });
  });
});

describe('where a lesson the instructor books starts (COV-04, D-168)', () => {
  const learnerId = '4e1f8a2b-6c3d-4e5f-8a9b-0c1d2e3f4a5b';
  const lesson = { learnerId, lessonTypeId: '5f2a9b3c-7d4e-4f6a-9b0c-1d2e3f4a5b6c', startsAt: '2026-10-01T09:00:00Z', durationMinutes: 60 };
  const theirs = '6a3b0c4d-8e5f-4a7b-8c1d-2e3f4a5b6c7d';
  const chosen = '7b4c1d5e-9f6a-4b8c-9d2e-3f4a5b6c7d8e';

  it("starts where the learner's lessons start, unless another is chosen", async () => {
    rpc.mockResolvedValue({ data: bookingId, error: null });
    defaultPickupFor.mockResolvedValue(theirs);

    await bookLesson(lesson);
    expect(defaultPickupFor).toHaveBeenCalledWith(learnerId);
    expect(rpc).toHaveBeenLastCalledWith('create_booking', expect.objectContaining({ p_pickup_point_id: theirs }));

    await bookLesson({ ...lesson, pickupPointId: chosen });
    expect(rpc).toHaveBeenLastCalledWith('create_booking', expect.objectContaining({ p_pickup_point_id: chosen }));
  });

  it('books with none when the learner has none yet', async () => {
    rpc.mockResolvedValue({ data: bookingId, error: null });
    defaultPickupFor.mockResolvedValue(null);
    await bookLesson(lesson);
    expect(rpc).toHaveBeenLastCalledWith('create_booking', expect.objectContaining({ p_pickup_point_id: undefined }));
  });
});
