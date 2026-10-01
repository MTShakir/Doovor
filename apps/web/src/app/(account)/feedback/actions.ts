'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { feedbackInputSchema } from '@repo/core/schemas/feedback';
import { z } from '@repo/core/zod';
import { requireAccess } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { refuseWhileViewing } from '@/lib/auth/view-as';

/**
 * D-202: a request, a problem, or anything else.
 *
 * Anybody signed in may send one. The pictures are uploaded by the browser into that person's own
 * folder first, and the database checks each path belongs to them before it keeps any of it: a
 * path is the one thing here somebody could otherwise point anywhere they liked.
 *
 * It answers with the reference the database gave it, so the screen can show somebody the number
 * to quote at us (D-241).
 */
export async function sendFeedback(input: unknown): Promise<Result<{ id: string; reference: string }>> {
  const refused = await refuseWhileViewing();
  if (refused) return refused;
  const parsed = feedbackInputSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  // Signed in is the only requirement: a learner with a problem is worth hearing from too.
  await requireAccess();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('submit_feedback', {
    p_kind: parsed.data.kind,
    p_message: parsed.data.message,
    p_images: parsed.data.images,
    p_page: parsed.data.page === '' ? undefined : parsed.data.page,
  });
  if (error) return err(parsePostgresError(error).code);

  const answer = answerSchema.safeParse(data);
  if (!answer.success) return err('UNKNOWN');

  return ok(answer.data);
}

/** What `submit_feedback` answers with. Read rather than trusted, like any other jsonb. */
const answerSchema = z.object({ id: z.string(), reference: z.string() });
