'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { isValidLocalDate } from '@repo/core/time';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePortal } from '@/lib/auth/session';
import { bookingDay, lessonOptions, type BookingDay, type LessonOption } from '@/lib/booking/day';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** Where the caller teaches. Every booking screen in this portal is about one instructor. */
async function place(): Promise<{ instructorProfileId: string; businessId: string } | null> {
  const { access } = await requirePortal('instructor');
  const membership = access.memberships.find((one) => one.instructorProfileId !== null);
  if (!membership?.instructorProfileId) return null;
  return { instructorProfileId: membership.instructorProfileId, businessId: membership.businessId };
}

const daySchema = z.object({
  date: z.string().refine(isValidLocalDate, { error: 'Choose a day' }),
  durationMinutes: z.coerce.number().int().min(15).max(480),
});

/** BOK-03: the times on one day, and the times only an instructor may take (R-04). */
export async function slotsForDay(input: unknown): Promise<Result<BookingDay>> {
  const parsed = daySchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const where = await place();
  if (!where) return err('NOT_ALLOWED');

  return ok(await bookingDay(where.instructorProfileId, parsed.data.date, parsed.data.durationMinutes));
}

/** The lessons this instructor offers, with what each length costs (R-05). */
export async function bookableLessons(): Promise<Result<LessonOption[]>> {
  const where = await place();
  if (!where) return err('NOT_ALLOWED');
  return ok(await lessonOptions(where.instructorProfileId, where.businessId));
}

const bookingSchema = z.object({
  learnerId: z.uuid(),
  lessonTypeId: z.uuid(),
  startsAt: z.iso.datetime(),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  pickupPointId: z.union([z.literal('').transform(() => null), z.uuid()]).nullable().default(null),
});

/** BOK-01: the instructor books a lesson. The RPC decides whether it may happen. */
export async function bookLesson(input: unknown): Promise<Result<{ bookingId: string }>> {
  const parsed = bookingSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const where = await place();
  if (!where) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('create_booking', {
    p_instructor_id: where.instructorProfileId,
    p_learner_id: parsed.data.learnerId,
    p_lesson_type_id: parsed.data.lessonTypeId,
    p_starts_at: parsed.data.startsAt,
    p_duration_minutes: parsed.data.durationMinutes,
    p_pickup_point_id: parsed.data.pickupPointId ?? undefined,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/instructor/diary');
  revalidatePath('/app/instructor');
  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  return ok({ bookingId: data });
}
