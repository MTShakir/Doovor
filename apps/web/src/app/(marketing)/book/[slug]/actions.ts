'use server';

import { parsePostgresError } from '@repo/core/errors';
import { asksForCard, chosenPaymentMode } from '@repo/core/payment-modes';
import { err, ok, type Result } from '@repo/core/result';
import { isValidLocalDate } from '@repo/core/time';
import { cookies } from 'next/headers';
import { z } from '@repo/core/zod';
import { getAccess, needsToAgree } from '@/lib/auth/session';
import { openSlots } from '@/lib/booking/public';
import { owesForLesson } from '@/lib/learner/lessons';
import { keptCardsWith } from '@/lib/payments/cards';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const daySchema = z.object({
  instructorId: z.uuid(),
  date: z.string().refine(isValidLocalDate, { error: 'Choose a day' }),
  durationMinutes: z.coerce.number().int().min(15).max(480),
});

/** The times on one day, for anybody looking at the link (BOK-02). */
export async function slotsOnDay(input: unknown): Promise<Result<string[]>> {
  const parsed = daySchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  return ok(await openSlots(parsed.data.instructorId, parsed.data.date, parsed.data.durationMinutes));
}

const bookSchema = z.object({
  instructorId: z.uuid(),
  lessonTypeId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.coerce.number().int().min(15).max(480),
});

/** What the learner does next with the lesson they have just booked (PAY-03, R-12, D-318, D-328). */
export type BookedNext = 'nothing' | 'pay' | 'pay_to_confirm' | 'authorise' | 'save_card';

export interface Booked {
  bookingId: string;
  /** Booked, asked for, or held while it is paid for. */
  status: 'confirmed' | 'requested' | 'pending_payment';
  next: BookedNext;
  /** Paid for in full from their lesson credit. */
  paidWithCredit: boolean;
  /** Until when a time held while it is paid for stays theirs. */
  holdUntil: string | null;
  /** Paid for later rather than now: charged to a kept card the day before, or by a link once it is done. */
  paidLater: 'day_before' | 'after' | null;
}

/** Said to a learner a full list cannot take, as the link says it before they choose (D-357). */
const LIST_FULL = 'This instructor is not taking new learners at the moment, so this cannot be booked.';

/** BOK-02: the learner books the slot themselves. The RPC holds them to the rules (R-04). */
export async function bookAsLearner(input: unknown): Promise<Result<Booked>> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const access = await getAccess();
  if (!access?.access.isLearner) return err('NOT_ALLOWED', 'Sign in as a learner to book a lesson.');
  // The page sends them to agree first; this is for a page left open while the terms changed (D-265).
  if (await needsToAgree(access)) return err('NOT_ALLOWED', 'Agree to our terms before you book. Open the link again to do it.');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('create_booking', {
    p_instructor_id: parsed.data.instructorId,
    p_learner_id: access.session.userId,
    p_lesson_type_id: parsed.data.lessonTypeId,
    p_starts_at: parsed.data.startsAt,
    p_duration_minutes: parsed.data.durationMinutes,
  });
  if (error) {
    const { code } = parsePostgresError(error);
    // The limit is the instructor's plan, which is nothing to do with the learner: they are told
    // only that nobody new can start just now (D-208, D-357).
    if (code === 'LEARNER_LIMIT') return err(code, LIST_FULL);
    return err(code);
  }

  // What is left to do is read from the lesson as it now is: credit may have paid for it, a
  // request is authorised rather than paid, and a time held while it is paid for is held only so
  // long. A Business that takes cards sends the learner to pay rather than leave them to find it
  // later (PAY-03, D-318).
  const { data: lesson } = await supabase
    .from('bookings')
    .select('business_id, status, payment_status, payment_mode, hold_expires_at, businesses!bookings_business_id_fkey(stripe_charges_enabled, settings)')
    .eq('id', data)
    .maybeSingle();
  const status = lesson?.status === 'requested' || lesson?.status === 'pending_payment' ? lesson.status : 'confirmed';
  const takesCards =
    lesson !== null &&
    asksForCard({ chargesEnabled: lesson.businesses.stripe_charges_enabled, mode: chosenPaymentMode(lesson.businesses.settings) });
  const card = takesCards && owesForLesson(lesson.status, lesson.payment_status, lesson.payment_mode);
  // A lesson the Business charges the day before, or asks for once it is done, has nothing to pay
  // now, asked for or booked. The day before needs a card kept with the Business, so keeping one is
  // what is left until there is one (PAY-03, D-328). Only a request paid for when it is booked is
  // authorised: one paid for afterwards was being authorised, and charged when it was accepted (D-378).
  const later = lesson?.payment_mode === 'before_lesson' ? 'day_before' : lesson?.payment_mode === 'after_lesson' ? 'after' : null;
  const paidLater = !takesCards || status === 'pending_payment' || lesson.payment_status !== 'unpaid' ? null : later;
  const cardKept = lesson !== null && paidLater === 'day_before' && ((await keptCardsWith(lesson.business_id))?.cards.length ?? 0) > 0;
  const next: BookedNext =
    paidLater === 'after' || cardKept
      ? 'nothing'
      : paidLater === 'day_before'
        ? 'save_card'
        : !card
          ? 'nothing'
          : status === 'requested'
            ? 'authorise'
            : status === 'pending_payment'
              ? 'pay_to_confirm'
              : 'pay';

  return ok({
    bookingId: data,
    status,
    next,
    paidWithCredit: lesson?.payment_status === 'paid_credit',
    holdUntil: status === 'pending_payment' ? (lesson?.hold_expires_at ?? null) : null,
    paidLater,
  });
}

const holdSchema = z.object({
  slug: z.string().min(1).max(80),
  startsAt: z.iso.datetime({ offset: true }),
});

const PENDING = 'pending_booking';

/**
 * A visitor with no account chose a time. The choice waits in a cookie of its own while they
 * make one, and the link they come back to has it already picked (BOK-02). Nothing is
 * booked on their behalf: they press the button themselves when they get back.
 */
export async function rememberSlot(input: unknown): Promise<Result<null>> {
  const parsed = holdSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const jar = await cookies();
  jar.set(PENDING, `${parsed.data.slug}|${parsed.data.startsAt}`, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 2,
  });

  // They have said what they are here for by choosing a time, so they are not asked again (D-358).
  return redirectTo('/sign-up?role=learner');
}
