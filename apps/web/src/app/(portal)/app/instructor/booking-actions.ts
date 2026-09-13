'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { isValidLocalDate } from '@repo/core/time';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
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
  startsAt: z.iso.datetime({ offset: true }),
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

const decisionSchema = z.object({
  bookingId: z.uuid(),
  accept: z.boolean(),
  reason: z.string().trim().max(500, { error: 'Use 500 characters or fewer' }).default(''),
});

/** BOK-06: the instructor answers a request. The RPC checks it is still theirs to answer. */
export async function decideRequest(input: unknown): Promise<Result<{ status: string }>> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('decide_booking_request', {
    p_booking_id: parsed.data.bookingId,
    p_accept: parsed.data.accept,
    p_reason: parsed.data.reason === '' ? undefined : parsed.data.reason,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/instructor/diary');
  revalidatePath('/app/instructor');
  return ok({ status: data });
}

const weeklySchema = bookingSchema.extend({
  weeks: z.coerce.number().int().min(1).max(52),
  openEnded: z.boolean().default(false),
});

export interface WeeklyOutcome {
  booked: number;
  clashes: { startsAt: string; reason: string }[];
}

/** BOK-05: the same slot every week. A week that clashes is reported, not fatal (R-13). */
export async function bookWeekly(input: unknown): Promise<Result<WeeklyOutcome>> {
  const parsed = weeklySchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  const where = await place();
  if (!where) return err('NOT_ALLOWED');

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('book_weekly', {
    p_instructor_id: where.instructorProfileId,
    p_learner_id: parsed.data.learnerId,
    p_lesson_type_id: parsed.data.lessonTypeId,
    p_first_starts_at: parsed.data.startsAt,
    p_duration_minutes: parsed.data.durationMinutes,
    p_weeks: parsed.data.weeks,
    p_open_ended: parsed.data.openEnded,
    p_pickup_point_id: parsed.data.pickupPointId ?? undefined,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/instructor/diary');
  revalidatePath('/app/instructor');
  // A week that clashed comes back with no booking and a reason; the generated types have
  // no way of knowing that a column of a set returning function can be null.
  const weeks = data as { starts_at: string; booking_id: string | null; problem: string | null }[];
  return ok({
    booked: weeks.filter((week) => week.booking_id !== null).length,
    clashes: weeks
      .filter((week) => week.booking_id === null)
      .map((week) => ({ startsAt: week.starts_at, reason: week.problem ?? 'UNKNOWN' })),
  });
}

const cancelSchema = z.object({
  bookingId: z.uuid(),
  reason: z.string().trim().min(1, { error: 'Say why, so the learner knows' }).max(500),
});

/** BOK-09: the instructor calls a lesson off, and says why (R-08). */
export async function cancelLesson(input: unknown): Promise<Result<null>> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('cancel_booking', {
    p_booking_id: parsed.data.bookingId,
    p_reason: parsed.data.reason,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/instructor/diary');
  revalidatePath('/app/instructor');
  return ok(null);
}

const moveSchema = z.object({
  bookingId: z.uuid(),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.coerce.number().int().min(15).max(480).optional(),
});

/** BOK-08: the same lesson, at another time. */
export async function moveLesson(input: unknown): Promise<Result<null>> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('reschedule_booking', {
    p_booking_id: parsed.data.bookingId,
    p_starts_at: parsed.data.startsAt,
    p_duration_minutes: parsed.data.durationMinutes,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/instructor/diary');
  revalidatePath('/app/instructor');
  return ok(null);
}
