import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const revalidatePath = vi.fn();
/** One row a table gives back, by table: the instructor asked for, or the lesson being moved. */
const rows = new Map<string, unknown>();
const from = vi.fn((table: string) => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: rows.get(table) ?? null }) }) }) }));

const instructor = { session: { userId: 'instructor-1' }, access: { memberships: [{ instructorProfileId: 'profile-1', businessId: 'business-1', role: 'owner' }] } };
/** Somebody who runs a school and teaches nobody themselves (PRD 6.2, D-330). */
const office = { session: { userId: 'owner-1' }, access: { memberships: [{ instructorProfileId: null, businessId: 'school-1', role: 'owner' }] } };
const signedIn = { current: instructor as unknown };
const requirePortal = vi.fn<(portals: unknown) => Promise<unknown>>(() => Promise.resolve(signedIn.current));

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc, from }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: (portals: unknown) => requirePortal(portals) }));
const bookingDay = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/booking/day', () => ({ bookingDay: (...args: unknown[]) => bookingDay(...args), lessonOptions: vi.fn() }));
vi.mock('@/lib/forms', () => ({ fieldErrors: vi.fn() }));
const lessonDetails = vi.fn<(bookingId: string) => Promise<unknown>>();
vi.mock('@/lib/lessons/details', () => ({ lessonDetails: (bookingId: string) => lessonDetails(bookingId) }));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => { revalidatePath(...args); } }));

const { bookLesson, cancelLesson, lessonDetailsFor, recordOfflinePayment, sendReminder, setLessonPickup, slotsForDay, stopWeekly, undoOfflinePayment } =
  await import('./booking-actions');

const bookingId = '6f1c3a52-9d8e-4b7a-8c61-2f0e9b4d7a13';
const paymentId = '2b7e1d44-3c9a-4f0e-9a1b-5d6c7e8f9a0b';

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: paymentId, error: null });
  signedIn.current = instructor;
  rows.clear();
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

describe('stopping a lesson booked every week (BOK-05, D-380)', () => {
  const weeklyId = '9a4c2f1e-7b3d-4e8a-b5c6-1d2e3f4a5b6c';

  it('asks the database to stop it, and redraws the diary and Today', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await stopWeekly({ weeklyId })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('stop_recurrence', { p_recurrence_id: weeklyId });
    expect(revalidatePath).toHaveBeenCalledWith('/app/instructor/diary');
    expect(revalidatePath).toHaveBeenCalledWith('/app/instructor');
  });

  it('asks nothing for something that is not a weekly slot', async () => {
    expect(await stopWeekly({ weeklyId: 'every week' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes on a refusal, for a slot that is not theirs', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await stopWeekly({ weeklyId })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe('where a lesson the instructor books starts (COV-04, D-168, D-215)', () => {
  const learnerId = '4e1f8a2b-6c3d-4e5f-8a9b-0c1d2e3f4a5b';
  const lesson = { learnerId, lessonTypeId: '5f2a9b3c-7d4e-4f6a-9b0c-1d2e3f4a5b6c', startsAt: '2026-10-01T09:00:00Z', durationMinutes: 60 };
  const chosen = '7b4c1d5e-9f6a-4b8c-9d2e-3f4a5b6c7d8e';

  it('passes on the place that was chosen', async () => {
    rpc.mockResolvedValue({ data: bookingId, error: null });
    await bookLesson({ ...lesson, pickupPointId: chosen });
    expect(rpc).toHaveBeenLastCalledWith('create_booking', expect.objectContaining({ p_pickup_point_id: chosen }));
  });

  it("asks for nothing when nothing was chosen, and lets the database say where lessons start", async () => {
    // D-215: this used to read the learner's default here and pass it on, which left the learner
    // booking themselves, a recurring lesson and a seeded row all with no pickup at all. The rule
    // is one trigger now (supabase/tests/114_default_pickup_test.sql), so this asks for nothing.
    rpc.mockResolvedValue({ data: bookingId, error: null });
    await bookLesson(lesson);
    expect(rpc).toHaveBeenLastCalledWith('create_booking', expect.objectContaining({ p_pickup_point_id: undefined }));
  });
});

describe('where a lesson goes instead, for one lesson (COV-04, D-215)', () => {
  const chosen = '7b4c1d5e-9f6a-4b8c-9d2e-3f4a5b6c7d8e';

  it('asks the RPC to collect them from one of their own places', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    const result = await setLessonPickup({ bookingId, pickupPointId: chosen });
    expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenLastCalledWith('set_booking_pickup', { p_booking_id: bookingId, p_pickup_point_id: chosen });
  });

  it('takes it off again, which the RPC spells as no argument at all', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await setLessonPickup({ bookingId, pickupPointId: '' });
    expect(rpc).toHaveBeenLastCalledWith('set_booking_pickup', { p_booking_id: bookingId, p_pickup_point_id: undefined });
  });

  it('refuses anything that is not a lesson and a place', async () => {
    const result = await setLessonPickup({ bookingId: 'not a lesson', pickupPointId: chosen });
    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'VALIDATION_FAILED' }));
  });
});

describe("the office of a school, with its instructors' lessons (PRD 6.2, D-330)", () => {
  const learnerId = '4e1f8a2b-6c3d-4e5f-8a9b-0c1d2e3f4a5b';
  const mona = '8c5d2e6f-0a7b-4c9d-8e3f-4a5b6c7d8e9f';
  const lesson = { learnerId, lessonTypeId: '5f2a9b3c-7d4e-4f6a-9b0c-1d2e3f4a5b6c', startsAt: '2026-10-01T09:00:00Z', durationMinutes: 60 };

  beforeEach(() => {
    signedIn.current = office;
  });

  it('books a lesson in the diary of one of its instructors, and redraws both portals', async () => {
    rows.set('instructor_profiles', { id: mona, business_id: 'school-1' });
    rpc.mockResolvedValue({ data: bookingId, error: null });
    expect(await bookLesson({ ...lesson, instructorId: mona })).toEqual({ ok: true, data: { bookingId } });
    expect(rpc).toHaveBeenCalledWith('create_booking', expect.objectContaining({ p_instructor_id: mona, p_learner_id: learnerId }));
    expect(requirePortal).toHaveBeenCalledWith(['instructor', 'school']);
    expect(revalidatePath).toHaveBeenCalledWith('/app/school/diary');
    expect(revalidatePath).toHaveBeenCalledWith(`/app/school/learners/${learnerId}`);
  });

  it('books nothing with an instructor of a business it does not run, or with nobody', async () => {
    rows.set('instructor_profiles', { id: mona, business_id: 'school-2' });
    expect(await bookLesson({ ...lesson, instructorId: mona })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(await bookLesson(lesson)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    signedIn.current = { ...office, access: { memberships: [{ instructorProfileId: null, businessId: 'school-1', role: 'instructor' }] } };
    expect(await bookLesson({ ...lesson, instructorId: mona })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('moves a lesson in the diary of the instructor it is with', async () => {
    rows.set('bookings', { instructor_id: mona });
    rows.set('instructor_profiles', { id: mona, business_id: 'school-1' });
    bookingDay.mockResolvedValue({ slots: [] });
    expect(await slotsForDay({ date: '2026-10-01', durationMinutes: 60, exceptBookingId: bookingId })).toEqual({ ok: true, data: { slots: [] } });
    expect(bookingDay).toHaveBeenCalledWith(mona, '2026-10-01', 60, 'instructor', expect.any(Date), bookingId, false);
  });

  it('calls a lesson off through the same door, which decides whether it may', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await cancelLesson({ bookingId, reason: 'Instructor unwell' })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('cancel_booking', { p_booking_id: bookingId, p_reason: 'Instructor unwell' });
    expect(revalidatePath).toHaveBeenCalledWith('/app/school/diary');
  });
});
