'use server';

import { parsePostgresError } from '@repo/core/errors';
import { asksForCard, chosenPaymentMode } from '@repo/core/payment-modes';
import { err, ok, type Result } from '@repo/core/result';
import { isValidLocalDate } from '@repo/core/time';
import { cookies } from 'next/headers';
import { z } from '@repo/core/zod';
import { getAccess } from '@/lib/auth/session';
import { openSlots } from '@/lib/booking/public';
import { owesForLesson } from '@/lib/learner/lessons';
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

/** What the learner does next with the lesson they have just booked (PAY-03, R-12, D-318). */
export type BookedNext = 'nothing' | 'pay' | 'pay_to_confirm' | 'authorise';

export interface Booked {
  bookingId: string;
  /** Booked, asked for, or held while it is paid for. */
  status: 'confirmed' | 'requested' | 'pending_payment';
  next: BookedNext;
  /** Paid for in full from their lesson credit. */
  paidWithCredit: boolean;
  /** Until when a time held while it is paid for stays theirs. */
  holdUntil: string | null;
}

/** BOK-02: the learner books the slot themselves. The RPC holds them to the rules (R-04). */
export async function bookAsLearner(input: unknown): Promise<Result<Booked>> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const access = await getAccess();
  if (!access?.access.isLearner) return err('NOT_ALLOWED', 'Sign in as a learner to book a lesson.');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('create_booking', {
    p_instructor_id: parsed.data.instructorId,
    p_learner_id: access.session.userId,
    p_lesson_type_id: parsed.data.lessonTypeId,
    p_starts_at: parsed.data.startsAt,
    p_duration_minutes: parsed.data.durationMinutes,
  });
  if (error) return err(parsePostgresError(error).code);

  // What is left to do is read from the lesson as it now is: credit may have paid for it, a
  // request is authorised rather than paid, and a time held while it is paid for is held only so
  // long. A Business that takes cards sends the learner to pay rather than leave them to find it
  // later (PAY-03, D-318).
  const { data: lesson } = await supabase
    .from('bookings')
    .select('status, payment_status, hold_expires_at, businesses!bookings_business_id_fkey(stripe_charges_enabled, settings)')
    .eq('id', data)
    .maybeSingle();
  const status = lesson?.status === 'requested' || lesson?.status === 'pending_payment' ? lesson.status : 'confirmed';
  const card =
    lesson !== null &&
    asksForCard({ chargesEnabled: lesson.businesses.stripe_charges_enabled, mode: chosenPaymentMode(lesson.businesses.settings) }) &&
    owesForLesson(lesson.status, lesson.payment_status);
  const next: BookedNext = !card ? 'nothing' : status === 'requested' ? 'authorise' : status === 'pending_payment' ? 'pay_to_confirm' : 'pay';

  return ok({
    bookingId: data,
    status,
    next,
    paidWithCredit: lesson?.payment_status === 'paid_credit',
    holdUntil: status === 'pending_payment' ? (lesson?.hold_expires_at ?? null) : null,
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

  return redirectTo('/start?role=learner');
}
