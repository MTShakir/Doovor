'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { answerMoveSchema } from '@repo/core/schemas/school';
import { requirePortal } from '@/lib/auth/session';
import { refuseWhileViewing } from '@/lib/auth/view-as';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** D-292: the learner moves with their instructor, or back to their school, or says no. Theirs to say. */
export async function answerMove(input: unknown): Promise<Result<null>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = answerMoveSchema.safeParse(input);
  if (!parsed.success) return err('NOT_FOUND', 'That could not be found.');

  await requirePortal('learner');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('answer_learner_move', { p_move_id: parsed.data.moveId, p_move: parsed.data.move });
  if (error) {
    const { code, context } = parsePostgresError(error);
    return context.reason === 'answered' ? err('VALIDATION_FAILED', 'You have already answered this.') : err(code);
  }
  return ok(null);
}
