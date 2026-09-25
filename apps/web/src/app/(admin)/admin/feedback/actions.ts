'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { z } from '@repo/core/zod';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const handleSchema = z.object({ feedbackId: z.uuid(), handled: z.boolean() });

/**
 * D-202: staff mark a report read and dealt with, or put it back. The database decides who may and
 * writes the audit row.
 */
export async function handleFeedback(input: unknown): Promise<Result<{ handled: boolean }>> {
  const parsed = handleSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  await requirePortal('admin');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_handle_feedback', {
    p_feedback_id: parsed.data.feedbackId,
    p_handled: parsed.data.handled,
  });
  if (error) {
    const { code } = parsePostgresError(error);
    if (code === 'NOT_FOUND') return err(code, 'That report is no longer there.');
    if (code === 'NOT_ALLOWED') return err(code, 'Only platform staff can do that.');
    return err(code);
  }

  revalidatePath('/admin/feedback');
  return ok({ handled: parsed.data.handled });
}
