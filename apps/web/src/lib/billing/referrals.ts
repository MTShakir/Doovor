import 'server-only';
import { referralLink } from '@repo/core/referral';
import { formatDateWithYear } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { getAppUrl } from '@/lib/app-url';
import { requireAccess } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const resultSchema = z.object({
  code: z.string(),
  months_earned: z.number().int(),
  months_applied: z.number().int(),
  joined: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      type: z.string(),
      at: z.string(),
      months: z.number().int(),
      applied: z.boolean(),
    }),
  ),
});

export interface ReferralJoiner {
  id: string;
  name: string;
  /** "Instructor" or "School", as the Business is set up. */
  kind: string;
  /** "Thu 24 Sep 2026", in London. */
  joined: string;
  months: number;
  applied: boolean;
}

export interface Referrals {
  code: string;
  /** The whole link, ready to share. */
  link: string;
  monthsEarned: number;
  monthsApplied: number;
  joined: ReferralJoiner[];
}

/**
 * The owner's referral code, who has come from it and what that has earned (D-205). Null for
 * anybody who does not own a Business: the reward is a month of what the Business pays, so it is
 * the same people who may see the plan (D-123).
 */
export async function myReferrals(): Promise<Referrals | null> {
  const { access } = await requireAccess();
  const membership = access.memberships.find((one) => one.role === 'owner');
  if (!membership) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('my_referrals', { p_business_id: membership.businessId });
  if (error) throw new Error(`Could not read your referrals: ${error.message}`);

  const parsed = resultSchema.parse(data);
  return {
    code: parsed.code,
    link: referralLink(getAppUrl(), parsed.code),
    monthsEarned: parsed.months_earned,
    monthsApplied: parsed.months_applied,
    joined: parsed.joined.map((one) => ({
      id: one.id,
      name: one.name,
      kind: one.type === 'school' ? 'School' : 'Instructor',
      joined: formatDateWithYear(new Date(one.at)),
      months: one.months,
      applied: one.applied,
    })),
  };
}
