'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
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

const pickupSchema = lessonSchema.extend({ pickupPointId: z.union([z.literal('').transform(() => null), z.uuid()]) });

/**
 * Where this lesson is collected from (COV-04, D-185). The learner picks one of their own places,
 * or takes it off again; the database checks it is theirs and that the lesson is still to happen.
 */
export async function setMyLessonPickup(input: unknown): Promise<Result<null>> {
  const parsed = pickupSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('learner');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_booking_pickup', {
    p_booking_id: parsed.data.bookingId,
    // The RPC takes no argument at all for "nowhere", which is its own default.
    p_pickup_point_id: parsed.data.pickupPointId ?? undefined,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath(`/app/learner/lessons/${parsed.data.bookingId}`);
  revalidatePath('/app/learner/lessons');
  revalidatePath('/app/learner');
  return ok(null);
}
