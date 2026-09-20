import 'server-only';
import type { PlanKey } from '@repo/config/plans';
import { periodInstants } from '@repo/core/money-periods';
import type { StatsRange } from '@repo/core/stats-range';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const whole = z.number().int();
const planKey = z.enum(['free', 'pro', 'school']);

// The function answers JSON, so it is read the way any input is.
const incomeSchema = z.object({
  fees: z.object({ pence: whole, payments: whole, on_pence: whole }),
  by_business: z.array(
    z.object({ id: z.uuid(), name: z.string(), type: z.enum(['independent', 'school']), plan: planKey, pence: whole, payments: whole }),
  ),
  plans: z.array(z.object({ plan: planKey, businesses: whole })),
});

export interface PayerRow {
  id: string;
  name: string;
  kind: 'independent' | 'school';
  plan: PlanKey;
  /** What the platform kept from their payments in the range. */
  pence: number;
  payments: number;
}

export interface PlatformIncome {
  fees: {
    /** What the platform kept. */
    pence: number;
    /** How many payments carried a fee. */
    payments: number;
    /** What those payments moved, so the fee can be read as a share of it. */
    onPence: number;
  };
  byBusiness: PayerRow[];
  /** Businesses in good standing on each plan, now rather than over the range. */
  plans: { plan: PlanKey; businesses: number }[];
}

/**
 * What the platform itself earned over a range (ADM-01, ADM-10, D-174): the fees kept from card
 * payments, who paid them, and which plans Businesses are on. Plan subscriptions are not charged
 * yet, so the money here is fees alone until plan billing arrives.
 */
export async function platformIncome(range: StatsRange): Promise<PlatformIncome> {
  const { from, to } = periodInstants(range);
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('platform_income', { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) throw new Error(`Could not read what the platform earned: ${error.message}`);
  const income = incomeSchema.parse(data);

  return {
    fees: { pence: income.fees.pence, payments: income.fees.payments, onPence: income.fees.on_pence },
    byBusiness: income.by_business.map((row) => ({
      id: row.id,
      name: row.name,
      kind: row.type,
      plan: row.plan,
      pence: row.pence,
      payments: row.payments,
    })),
    plans: income.plans,
  };
}
