'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requirePortal } from '@/lib/auth/session';
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
