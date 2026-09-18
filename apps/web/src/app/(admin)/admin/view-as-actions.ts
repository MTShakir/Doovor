'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { getAccessContext } from '@repo/db';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from '@repo/core/zod';
import { landingPath } from '@/lib/auth/portals';
import { requirePortal } from '@/lib/auth/session';
import { VIEW_AS_COOKIE, viewAsCookieOptions, viewingId } from '@/lib/auth/view-as';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const startSchema = z.object({
  userId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(1, { error: 'Say why you need to see what they see' })
    .max(500, { error: 'Use 500 characters or fewer' }),
});

const refusals: Record<string, string> = {
  yourself: 'That is your own account.',
  staff: 'Nobody views as a member of the platform staff.',
};

/**
 * ADM-06: platform staff start viewing as somebody, read only, saying why. Answers where the person
 * would land, for the browser to open afresh (D-129).
 */
export async function startViewingAs(input: unknown): Promise<Result<{ path: string }>> {
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  await requirePortal('admin');

  const supabase = await createSupabaseServerClient({ asStaff: true });
  const { data: viewing, error } = await supabase.rpc('start_impersonation', {
    p_user_id: parsed.data.userId,
    p_reason: parsed.data.reason,
  });
  if (error) {
    const { code, context } = parsePostgresError(error);
    return err(code, typeof context.reason === 'string' ? refusals[context.reason] : undefined);
  }

  (await cookies()).set(VIEW_AS_COOKIE, viewing, viewAsCookieOptions);
  // Where the person would land, read as them.
  const asThem = await createSupabaseServerClient({ viewing });
  return ok({ path: landingPath(await getAccessContext(asThem, parsed.data.userId)) });
}

/** ADM-06: stops viewing, from the staff member's own requests, and goes back to the admin portal. */
export async function stopViewingAs(): Promise<void> {
  const viewing = await viewingId();
  if (viewing !== null) {
    const supabase = await createSupabaseServerClient({ asStaff: true });
    await supabase.rpc('end_impersonation', { p_session_id: viewing });
  }
  (await cookies()).delete(VIEW_AS_COOKIE);
  redirect('/admin');
}
