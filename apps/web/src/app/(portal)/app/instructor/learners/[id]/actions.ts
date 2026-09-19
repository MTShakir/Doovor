'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { learnerStatuses } from '@repo/core/learners';
import { learnerNoteSchema } from '@repo/core/schemas/note';
import { revalidatePath } from 'next/cache';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { removePickupPoint, savePickupPoint, updatePickupPoint } from '@/lib/pickup/save';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * A note about a learner, written by the person teaching them (LRN-04). The policies decide
 * whether it may be written: this only says who is asking and what they typed.
 */
export async function addLearnerNote(input: unknown): Promise<Result<null>> {
  const parsed = learnerNoteSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  const { session } = await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();

  // Which Business the note belongs to is not the caller's to choose: it is the one this
  // learner is in, and the row is only visible to them at all through that Business.
  const { data: relationship } = await supabase
    .from('learner_relationships')
    .select('business_id')
    .eq('learner_id', parsed.data.learnerId)
    .maybeSingle();
  if (!relationship) return err('NOT_FOUND', 'That learner is not one of yours.');

  const { error } = await supabase.from('learner_notes').insert({
    business_id: relationship.business_id,
    learner_id: parsed.data.learnerId,
    author_id: session.userId,
    body: parsed.data.body,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  return ok(null);
}

const statusSchema = z.object({
  learnerId: z.uuid(),
  status: z.enum(learnerStatuses),
});

/** LRN-05: where a learner is up to. The RPC checks the permission and records the move. */
export async function setLearnerStatus(input: unknown): Promise<Result<null>> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_learner_status', {
    p_learner_id: parsed.data.learnerId,
    p_status: parsed.data.status,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  revalidatePath('/app/instructor/learners');
  return ok(null);
}

const removalSchema = z.object({ id: z.uuid(), learnerId: z.uuid() });

/** Only the person who wrote a note may take it back, which is what the policy says too. */
export async function deleteLearnerNote(input: unknown): Promise<Result<null>> {
  const parsed = removalSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('learner_notes').delete().eq('id', parsed.data.id);
  if (error) return err(parsePostgresError(error).code);

  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  return ok(null);
}

const learnerPickupSchema = z.object({ learnerId: z.uuid(), pickup: z.unknown() });

/**
 * A pickup point added from the learner's card (COV-04, D-168). It belongs to the Business the
 * learner is with, which is not the caller's to name, and the address is checked as a learner's own
 * would be.
 */
export async function addLearnerPickup(input: unknown): Promise<Result<null>> {
  const parsed = learnerPickupSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { data: relationship } = await supabase
    .from('learner_relationships')
    .select('business_id')
    .eq('learner_id', parsed.data.learnerId)
    .maybeSingle();
  if (!relationship) return err('NOT_FOUND', 'That learner is not one of yours.');

  const saved = await savePickupPoint(parsed.data.pickup, {
    learnerId: parsed.data.learnerId,
    businessId: relationship.business_id,
  });
  if (!saved.ok) return saved;

  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  return ok(null);
}

const pickupChangeSchema = learnerPickupSchema.extend({ pickupId: z.uuid() });

/** Corrects one the Business added (COV-04, D-168); the learner's own are theirs. */
export async function updateLearnerPickup(input: unknown): Promise<Result<null>> {
  const parsed = pickupChangeSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('instructor');
  const updated = await updatePickupPoint(parsed.data.pickupId, parsed.data.pickup);
  if (!updated.ok) return updated;

  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  return ok(null);
}

const pickupRemovalSchema = z.object({ learnerId: z.uuid(), pickupId: z.uuid() });

/** Removes one the Business added (COV-04, D-168). Lessons that started there keep no pickup. */
export async function removeLearnerPickup(input: unknown): Promise<Result<null>> {
  const parsed = pickupRemovalSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('instructor');
  const removed = await removePickupPoint(parsed.data.pickupId);
  if (!removed.ok) return removed;

  revalidatePath(`/app/instructor/learners/${parsed.data.learnerId}`);
  return ok(null);
}
