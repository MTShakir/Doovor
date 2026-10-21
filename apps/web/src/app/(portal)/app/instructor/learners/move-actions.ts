'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { answerMoveSchema } from '@repo/core/schemas/school';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth/session';
import { refuseWhileViewing } from '@/lib/auth/view-as';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * D-322: the instructor says what a learner who has never signed in chose, having asked them. A
 * learner who has signed in answers for themselves; the database decides which is which.
 */
export async function answerMoveFor(input: unknown): Promise<Result<null>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = answerMoveSchema.safeParse(input);
  if (!parsed.success) return err('NOT_FOUND', 'That could not be found.');

  await requirePortal('instructor');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('answer_learner_move_for', { p_move_id: parsed.data.moveId, p_move: parsed.data.move });
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (context.reason === 'answered') return err('VALIDATION_FAILED', 'This has been answered already.');
    if (context.reason === 'can_answer') return err('VALIDATION_FAILED', 'They have signed in, so they answer for themselves.');
    return err(code);
  }
  revalidatePath('/app/instructor/learners');
  return ok(null);
}
