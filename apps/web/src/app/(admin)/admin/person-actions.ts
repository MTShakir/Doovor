'use server';

import { parsePostgresError, type PostgresErrorLike } from '@repo/core/errors';
import { err, ok, type Err, type Result } from '@repo/core/result';
import { suspendAccountSchema, userIdSchema } from '@repo/core/schemas/admin';
import { revalidatePath } from 'next/cache';
import { adminPerson, type AdminPerson } from '@/lib/admin/people';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** What the database's refusals mean, said to the member of staff who asked (D-126). */
const refusals: Record<string, string> = {
  yourself: 'That is your own account. Ask another super admin.',
  staff: 'Platform staff are not suspended from here.',
  already_suspended: 'It is already suspended.',
  not_suspended: 'It is not suspended.',
  no_two_step: 'They do not have two-step verification on.',
};

function refused(error: PostgresErrorLike): Err {
  const { code, context } = parsePostgresError(error);
  const reason = typeof context.reason === 'string' ? refusals[context.reason] : undefined;
  return err(code, reason);
}

/** The lists that show whether somebody is suspended. */
function refreshLists(): void {
  revalidatePath('/admin/instructors');
  revalidatePath('/admin/learners');
}

/** ADM-02: one person, opened from a list or a Business. Staff only, past their second step. */
export async function openPerson(input: unknown): Promise<Result<AdminPerson>> {
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return err('NOT_FOUND');
  await requirePortal('admin');
  const person = await adminPerson(parsed.data.userId);
  return person ? ok(person) : err('NOT_FOUND');
}

/** ADM-02: a super admin suspends an account, saying why. The database signs them out everywhere. */
export async function suspendAccount(input: unknown): Promise<Result<null>> {
  const parsed = suspendAccountSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  await requirePortal('admin');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_set_account_suspended', {
    p_user_id: parsed.data.userId,
    p_suspended: true,
    p_reason: parsed.data.reason,
  });
  if (error) return refused(error);
  refreshLists();
  return ok(null);
}

export async function reactivateAccount(input: unknown): Promise<Result<null>> {
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return err('NOT_FOUND');
  await requirePortal('admin');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_set_account_suspended', { p_user_id: parsed.data.userId, p_suspended: false });
  if (error) return refused(error);
  refreshLists();
  return ok(null);
}

/** ADM-02, AUTH-08: a super admin resets somebody else's two-step verification. */
export async function resetTwoStep(input: unknown): Promise<Result<null>> {
  const parsed = userIdSchema.safeParse(input);
  if (!parsed.success) return err('NOT_FOUND');
  await requirePortal('admin');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_reset_two_step', { p_user_id: parsed.data.userId });
  if (error) return refused(error);
  return ok(null);
}
