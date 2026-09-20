'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { z } from '@repo/core/zod';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const keepSchema = z.object({
  requestId: z.uuid(),
  note: z.string().trim().min(1, 'Say what was sorted out').max(500),
});

/**
 * AUTH-09, D-175: a super admin calls off somebody's deletion request after putting right
 * whatever sent them away. The database decides who may and writes the audit row.
 */
export async function keepAccount(input: unknown): Promise<Result<null>> {
  const parsed = keepSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  await requirePortal('admin');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_cancel_deletion_request', {
    p_request_id: parsed.data.requestId,
    p_note: parsed.data.note,
  });
  if (error) {
    const { code } = parsePostgresError(error);
    if (code === 'NOT_FOUND') return err(code, 'That request has already been settled.');
    if (code === 'NOT_ALLOWED') return err(code, 'Only a super admin can call a deletion off.');
    return err(code);
  }

  revalidatePath('/admin/deletions');
  return ok(null);
}
