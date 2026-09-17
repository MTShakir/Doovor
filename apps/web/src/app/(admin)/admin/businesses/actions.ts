'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { businessIdSchema, suspendBusinessSchema } from '@repo/core/schemas/admin';
import { revalidatePath } from 'next/cache';
import { adminBusiness, type AdminBusiness } from '@/lib/admin/businesses';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { expireAllInstructorProfiles } from '@/lib/public/instructor-profile';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/** ADM-02: one Business, opened from the list. Staff only, past their second step. */
export async function openBusiness(input: unknown): Promise<Result<AdminBusiness>> {
  const parsed = businessIdSchema.safeParse(input);
  if (!parsed.success) return err('NOT_FOUND');
  await requirePortal('admin');
  const business = await adminBusiness(parsed.data.businessId);
  return business ? ok(business) : err('NOT_FOUND');
}

/**
 * ADM-02: suspending or reactivating a Business. The database decides who may (a super admin
 * past their second step) and writes the audit row; its public pages are read fresh either way.
 */
async function setSuspended(businessId: string, suspended: boolean, reason?: string): Promise<Result<null>> {
  await requirePortal('admin');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_set_business_suspended', {
    p_business_id: businessId,
    p_suspended: suspended,
    ...(reason === undefined ? {} : { p_reason: reason }),
  });
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (context.reason === 'already_suspended') return err(code, 'It is already suspended.');
    if (context.reason === 'not_suspended') return err(code, 'It is not suspended.');
    return err(code);
  }

  // Its profiles, school page, place pages and sitemap entries go, or come back, at once (D-125).
  expireAllInstructorProfiles();
  revalidatePath('/admin/businesses');
  return ok(null);
}

export async function suspendBusiness(input: unknown): Promise<Result<null>> {
  const parsed = suspendBusinessSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  return setSuspended(parsed.data.businessId, true, parsed.data.reason);
}

export async function reactivateBusiness(input: unknown): Promise<Result<null>> {
  const parsed = businessIdSchema.safeParse(input);
  if (!parsed.success) return err('NOT_FOUND');
  return setSuspended(parsed.data.businessId, false);
}
