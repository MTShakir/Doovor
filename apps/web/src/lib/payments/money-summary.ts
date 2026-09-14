import 'server-only';
import { moneyPeriod, periodInstants, type MoneyPeriod, type MoneyPeriodKey } from '@repo/core/money-periods';
import { todayInZone } from '@repo/core/time';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const pence = z.number().int();

// The function answers JSON, so it is read the way any input is.
const summarySchema = z.object({
  whole_business: z.boolean(),
  paid: z.object({ total_pence: pence, card_pence: pence, cash_pence: pence, bank_pence: pence, count: pence }),
  credit_sold: z.object({ total_pence: pence, minutes: pence, count: pence }).nullable(),
  refunds: z.object({ total_pence: pence, count: pence }),
  unpaid: z.object({ total_pence: pence, count: pence }),
});

export interface MoneySummary {
  period: MoneyPeriod;
  /** False for an instructor who does not run the Business, who sees their own lessons only. */
  wholeBusiness: boolean;
  paid: { totalPence: number; cardPence: number; cashPence: number; bankPence: number; count: number };
  /** Packages sold, for the people who run the Business. */
  creditSold: { totalPence: number; minutes: number; count: number } | null;
  refunds: { totalPence: number; count: number };
  unpaid: { totalPence: number; count: number };
}

/**
 * The money dashboard for one period (MNY-01, M3-21). The period is worked out in London from
 * today, and the database decides what the person asking may see.
 */
export async function moneySummary(businessId: string, key: MoneyPeriodKey, now = new Date()): Promise<MoneySummary | null> {
  const period = moneyPeriod(key, todayInZone(now));
  const { from, to } = periodInstants(period);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('money_summary', {
    p_business_id: businessId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error) return null;

  const parsed = summarySchema.safeParse(data);
  if (!parsed.success) return null;
  const facts = parsed.data;

  return {
    period,
    wholeBusiness: facts.whole_business,
    paid: {
      totalPence: facts.paid.total_pence,
      cardPence: facts.paid.card_pence,
      cashPence: facts.paid.cash_pence,
      bankPence: facts.paid.bank_pence,
      count: facts.paid.count,
    },
    creditSold:
      facts.credit_sold === null
        ? null
        : { totalPence: facts.credit_sold.total_pence, minutes: facts.credit_sold.minutes, count: facts.credit_sold.count },
    refunds: { totalPence: facts.refunds.total_pence, count: facts.refunds.count },
    unpaid: { totalPence: facts.unpaid.total_pence, count: facts.unpaid.count },
  };
}
