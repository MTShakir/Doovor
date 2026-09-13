'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { isValidLocalDate } from '@repo/core/time';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { getAccess } from '@/lib/auth/session';
import { openSlots } from '@/lib/booking/public';
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

/** BOK-02: the learner books the slot themselves. The RPC holds them to the rules (R-04). */
export async function bookAsLearner(input: unknown): Promise<Result<{ bookingId: string }>> {
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

  return ok({ bookingId: data });
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
