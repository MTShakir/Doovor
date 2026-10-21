'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, type Result } from '@repo/core/result';
import { completeSignIn } from '@/lib/auth/complete-sign-in';
import { getAccess } from '@/lib/auth/session';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * D-332: somebody a school switched off sets up a Business of their own, because they asked to,
 * never because they signed in. The database refuses a second one to somebody who has one.
 */
export async function startOwnBusiness(): Promise<Result<null>> {
  const result = await getAccess();
  if (!result) return err('NOT_AUTHENTICATED', 'Sign in to set up your own business.');

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from('users').select('full_name').eq('id', result.session.userId).single();
  const { error } = await supabase.rpc('create_business', {
    p_type: 'independent',
    p_name: profile?.full_name || 'My driving business',
  });
  if (error) return err(parsePostgresError(error).code);
  return redirectTo(await completeSignIn());
}
