import 'server-only';
import { isPlanKey, type PlanKey } from '@repo/config/plans';
import { requireAccess } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface BrandColour {
  businessId: string;
  /** What is stored, or null where nothing has been picked. */
  colour: string | null;
  plan: PlanKey;
}

/**
 * The colour a Business has picked for its booking page, and the plan that decides whether it may
 * (D-210). Null for anybody who does not own a Business: the page is the Business's.
 */
export async function brandColour(): Promise<BrandColour | null> {
  const { access } = await requireAccess();
  const membership = access.memberships.find((one) => one.role === 'owner');
  if (!membership) return null;

  const supabase = await createSupabaseServerClient();
  const [{ data: business }, { data: billing }] = await Promise.all([
    supabase.from('businesses').select('id, brand_colour').eq('id', membership.businessId).maybeSingle(),
    supabase.rpc('business_billing', { p_business_id: membership.businessId }).maybeSingle(),
  ]);
  if (!business) return null;

  return {
    businessId: business.id,
    colour: business.brand_colour,
    plan: isPlanKey(billing?.plan) ? billing.plan : 'free',
  };
}
