'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, type Result } from '@repo/core/result';
import { z } from '@repo/core/zod';
import { completeSignIn } from '@/lib/auth/complete-sign-in';
import { getAccess } from '@/lib/auth/session';
import { expireAllInstructorProfiles } from '@/lib/public/instructor-profile';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * M9-25, D-292: having left the school, the owner opens their own Business again. The database
 * checks it is theirs and that they no longer teach under anybody else's.
 */
export async function reopenOwnBusiness(businessId: unknown): Promise<Result<null>> {
  const parsed = z.uuid().safeParse(businessId);
  if (!parsed.success) return err('NOT_FOUND', 'That business could not be found.');
  if (!(await getAccess())) return err('NOT_AUTHENTICATED', 'Sign in to open your business again.');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('reopen_own_business', { p_business_id: parsed.data });
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (context.reason === 'teaches_elsewhere') {
      return err('VALIDATION_FAILED', 'You still teach under a school. Once it has switched you off, open your business again here.');
    }
    return err(code);
  }
  // Its profile and booking link are back on the public pages.
  expireAllInstructorProfiles();
  return redirectTo(await completeSignIn());
}
