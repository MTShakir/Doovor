'use server';

import { parsePostgresError } from '@repo/core/errors';
import { err, ok, type Result } from '@repo/core/result';
import { postcodeAreaSchema } from '@repo/core/schemas/admin';
import { revalidatePath } from 'next/cache';
import { requirePortal } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const refusals: Record<string, string> = {
  below_rule: 'It does not meet the switch-on rule yet.',
  already_open: 'It is already open.',
  not_open: 'It is not open.',
};

/**
 * ADM-04: opening or closing the learner marketplace in a postcode area. The database decides who
 * may (a super admin past their second step) and whether the area meets the switch-on rule, audits
 * it, and asks for the people waiting to be told; the job runner sends those emails (D-127).
 */
async function setOpen(input: unknown, open: boolean): Promise<Result<null>> {
  const parsed = postcodeAreaSchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED');
  await requirePortal('admin');
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('admin_set_marketplace_region', { p_area: parsed.data.area, p_open: open });
  if (error) {
    const { code, context } = parsePostgresError(error);
    return err(code, typeof context.reason === 'string' ? refusals[context.reason] : undefined);
  }
  revalidatePath('/admin/regions');
  return ok(null);
}

export async function openRegion(input: unknown): Promise<Result<null>> {
  return setOpen(input, true);
}

export async function closeRegion(input: unknown): Promise<Result<null>> {
  return setOpen(input, false);
}
