import 'server-only';
import { isPlanKey, plans, type PlanKey } from '@repo/config/plans';
import { formatDateWithYear } from '@repo/core/time';
import { requireAccess } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface BusinessPlan {
  businessId: string;
  businessName: string;
  plan: PlanKey;
  /** What the plan is called, as the pricing page calls it. */
  planLabel: string;
  /** A founding place, kept for good whatever happens to the plan afterwards (D-203). */
  founding: boolean;
  /** Started on a free trial rather than a founding place (D-204). */
  trial: boolean;
  /** "Thu 24 Dec 2026", or null where nothing runs out. */
  runsTo: string | null;
  /** Days until it runs out, negative once it has; null where nothing runs out. */
  daysLeft: number | null;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What a Business is on, for the owner who is on it (D-123, D-204). Null for anybody who does not
 * own one: the plan is what a Business pays the platform, and PRD 6.2 keeps that from managers.
 */
export async function businessPlan(now = new Date()): Promise<BusinessPlan | null> {
  const { access } = await requireAccess();
  const membership = access.memberships.find((one) => one.role === 'owner');
  if (!membership) return null;

  const supabase = await createSupabaseServerClient();
  const { data: business } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('id', membership.businessId)
    .maybeSingle();
  if (!business) return null;

  const { data } = await supabase.rpc('business_billing', { p_business_id: business.id }).maybeSingle();
  const plan: PlanKey = isPlanKey(data?.plan) ? data.plan : 'free';
  const expiresAt = data?.plan_expires_at ?? null;
  const expires = expiresAt === null ? null : new Date(expiresAt);

  return {
    businessId: business.id,
    businessName: business.name,
    plan,
    planLabel: plans[plan].label,
    founding: data?.founding_offer ?? false,
    trial: data?.trial_given ?? false,
    runsTo: expires === null ? null : formatDateWithYear(expires),
    daysLeft: expires === null ? null : Math.ceil((expires.getTime() - now.getTime()) / DAY_MS),
  };
}

/** What the paid plan adds, in the words the pricing page uses. */
export const paidPlanIncludes = [
  'Text message reminders for your learners',
  'Charging the saved card the day before a lesson',
  'Gap Fill offers when somebody cancels',
  'The waiting list, filled in for you',
  'Bookkeeping: expenses, mileage and your tax year',
  'Calendar sync, and your own booking colours',
] as const;
