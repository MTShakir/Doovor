'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { revalidatePath } from 'next/cache';
import { z } from '@repo/core/zod';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { expireAllInstructorProfiles } from '@/lib/public/instructor-profile';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const decisionSchema = z
  .object({
    profileId: z.uuid(),
    approved: z.boolean(),
    reason: z.string().trim().max(500, { error: 'Use 500 characters or fewer' }),
  })
  .refine((value) => value.approved || value.reason.length > 0, {
    error: 'Say why, so the instructor knows what to fix',
    path: ['reason'],
  });

/** ADM-03: a person decides, and the database records who (INS-02). */
export async function decideVerification(input: unknown): Promise<Result<null>> {
  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));

  // Staff only, and only with two-step verification: the gate and the RPC both say so.
  await requirePortal('admin');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('decide_verification', {
    p_profile_id: parsed.data.profileId,
    p_approved: parsed.data.approved,
    p_reason: parsed.data.reason === '' ? undefined : parsed.data.reason,
  });
  if (error) return err(parsePostgresError(error).code);

  revalidatePath('/admin/verification');
  // An approval makes a profile, and a refusal takes one away (INS-05).
  expireAllInstructorProfiles();
  return ok(null);
}
