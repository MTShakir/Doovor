'use server';

import { parsePostgresError } from '@repo/core/errors';
import { memberPaySchema } from '@repo/core/member-pay';
import { err, ok, type Result } from '@repo/core/result';
import { requirePortal } from '@/lib/auth/session';
import { fieldErrors } from '@/lib/forms';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * M9-21, D-291: what the school pays an instructor teaching under it, from a Monday on. The owner,
 * or a manager allowed to see revenue, says it; the database checks.
 */
export async function saveMemberPay(input: unknown): Promise<Result<null>> {
  const parsed = memberPaySchema.safeParse(input);
  if (!parsed.success) return err('VALIDATION_FAILED', undefined, fieldErrors(parsed.error));
  const { access } = await requirePortal('school');
  if (!access.memberships.some((one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'))) {
    return err('NOT_ALLOWED');
  }

  const { membershipId, basis, hourlyPence, sharePercent, fromMonday } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc('set_member_pay', {
    p_membership_id: membershipId,
    p_basis: basis ?? undefined,
    p_hourly_pence: hourlyPence ?? undefined,
    p_share_percent: sharePercent ?? undefined,
    p_from: fromMonday ?? undefined,
  });
  if (error) {
    const { code, context } = parsePostgresError(error);
    if (context.field === 'from') return err('VALIDATION_FAILED', undefined, { from: 'Choose a week from the last year, or next week' });
    return err(code);
  }
  return ok(null);
}
