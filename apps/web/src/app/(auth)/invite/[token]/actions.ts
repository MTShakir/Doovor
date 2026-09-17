'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, type Result } from '@repo/core/result';
import { z } from 'zod';
import { completeSignIn } from '@/lib/auth/complete-sign-in';
import { getAccess } from '@/lib/auth/session';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const tokenSchema = z.string().min(1).max(200);

/** AUTH-07: links a learner who already has an account to the instructor who invited them. */
export async function acceptInvitation(token: unknown): Promise<Result<null>> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return err('NOT_FOUND', 'This link does not work. Ask for a new one.');

  const access = await getAccess();
  if (!access?.access.isLearner) return err('NOT_ALLOWED', 'Sign in as a learner to accept an invitation.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('accept_invitation', { p_token: parsed.data });
  if (error) {
    const { code } = parsePostgresError(error);
    if (code === 'VALIDATION_FAILED') return err('NOT_FOUND', 'This link has already been used or has expired.');
    return err(code);
  }

  // Accepted, so this redirects and never resolves.
  return redirectTo('/app/learner');
}

/**
 * AUTH-05: somebody already signed in joins the school that invited them to teach, then carries
 * on as a new instructor would: their mobile, if it is not verified yet, and a short onboarding.
 */
export async function acceptMemberInvitation(token: unknown): Promise<Result<null>> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return err('NOT_FOUND', 'This link does not work. Ask for a new one.');

  const access = await getAccess();
  if (!access) return err('NOT_AUTHENTICATED', 'Sign in to join the school.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('accept_member_invitation', { p_token: parsed.data });
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (code === 'VALIDATION_FAILED' && context.reason === 'teaches_elsewhere') {
      return err(
        'NOT_ALLOWED',
        'This account already teaches for another driving business. To join the school, sign out and create an account with a different email.',
      );
    }
    if (code === 'VALIDATION_FAILED') return err('NOT_FOUND', 'This link has already been used or has expired.');
    return err(code);
  }

  // Joined, so this redirects and never resolves.
  return redirectTo(await completeSignIn());
}
