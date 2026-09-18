'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
import { openSlots } from '@/lib/booking/public';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const lessonSchema = z.object({ bookingId: z.uuid() });

/** BOK-09: the learner calls off their own lesson. The fee, if any, is the policy's (R-06). */
export async function cancelMyLesson(input: unknown): Promise<Result<null>> {
  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('learner');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('cancel_booking', { p_booking_id: parsed.data.bookingId });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/learner/lessons');
  revalidatePath('/app/learner');
  return ok(null);
}

const disputeSchema = lessonSchema.extend({
  reason: z.string().trim().min(1, { error: 'Say what happened' }).max(1000),
});

/** R-09: the learner says being marked as a no-show was wrong, within the seven days. */
export async function disputeNoShow(input: unknown): Promise<Result<{ disputeId: string }>> {
  const parsed = disputeSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', 'Say what happened.');

  await requirePortal('learner');
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('dispute_no_show', {
    p_booking_id: parsed.data.bookingId,
    p_reason: parsed.data.reason,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/learner/lessons');
  return ok({ disputeId: data });
}

const moveSchema = lessonSchema.extend({ startsAt: z.iso.datetime({ offset: true }) });

/** BOK-08: the learner moves their own lesson, while there is still time to (R-06). */
export async function moveMyLesson(input: unknown): Promise<Result<null>> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('learner');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('reschedule_booking', {
    p_booking_id: parsed.data.bookingId,
    p_starts_at: parsed.data.startsAt,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/learner/lessons');
  revalidatePath('/app/learner');
  return ok(null);
}

const slotsSchema = z.object({
  instructorId: z.uuid(),
  date: z.string().min(10).max(10),
  durationMinutes: z.coerce.number().int().min(15).max(480),
  /** The lesson being moved, which does not count as being in the way (BOK-08). */
  bookingId: z.uuid(),
});

/** The times their instructor is free, for the move sheet (BOK-08). */
export async function myInstructorSlots(input: unknown): Promise<Result<string[]>> {
  const parsed = slotsSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('learner');
  return ok(
    await openSlots(parsed.data.instructorId, parsed.data.date, parsed.data.durationMinutes, parsed.data.bookingId),
  );
}
