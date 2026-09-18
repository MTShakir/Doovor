'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
import { learnerAllocation, type LearnerAllocation } from '@/lib/school/allocation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const assignSchema = z.object({ learnerId: z.uuid(), instructorId: z.uuid() });

/** LRN-06: a school hands a learner to one of its instructors. The RPC checks and records it. */
export async function assignLearner(input: unknown): Promise<Result<null>> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');

  await requirePortal('school');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('assign_learner', {
    p_learner_id: parsed.data.learnerId,
    p_instructor_id: parsed.data.instructorId,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/app/school/learners');
  return ok(null);
}

/**
 * SCH-03: who suits a learner best, with why, and everybody else still teaching at the school. A
 * failure is an answer the sheet can live with: anybody can still be chosen by hand.
 */
export async function suggestInstructors(learnerId: unknown): Promise<Result<LearnerAllocation>> {
  const parsed = z.uuid().safeParse(learnerId);
  if (!parsed.success) return err('NOT_FOUND');

  const { access } = await requirePortal('school');
  const school = access.memberships.find(
    (one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'),
  );
  if (!school) return err('NOT_ALLOWED');
  try {
    return ok(await learnerAllocation(school.businessId, parsed.data));
  } catch {
    return err('UNKNOWN', 'We could not work out who suits them best just now.');
  }
}
