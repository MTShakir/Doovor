import 'server-only';
import { formatDate } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const count = z.number().int();
const since = z.string().nullable();

// The function answers JSON, so it is read the way any input is.
const dashboardSchema = z.object({
  from: z.string(),
  signups: z.object({ learners: count, instructors: count, schools: count, undecided: count }),
  businesses: z.object({ active: count, independent: count, schools: count, suspended: count, teaching: count }),
  lessons: z.object({ booked: count, completed: count }),
  money: z.object({ gmv_pence: count, card_pence: count, fees_pence: count, payments: count, refunds_pence: count }),
  verification: z.object({ waiting: count, oldest: since }),
  disputes: z.object({ open: count, oldest: since }),
});

const SPAN_MS = 30 * 24 * 60 * 60 * 1000;

export interface PlatformDashboard {
  /** "Tue 18 Aug to Thu 17 Sep": the 30 days the figures cover, in London. */
  range: string;
  signups: { learners: number; instructors: number; schools: number; undecided: number; total: number };
  businesses: { active: number; independent: number; schools: number; suspended: number; teaching: number };
  lessons: { booked: number; completed: number };
  money: { gmvPence: number; cardPence: number; feesPence: number; payments: number; refundsPence: number };
  /** The day the oldest has waited since, or null when nothing waits. */
  verification: { waiting: number; oldestSince: string | null };
  disputes: { open: number; oldestSince: string | null };
}

function day(moment: string | null): string | null {
  return moment === null ? null : formatDate(new Date(moment));
}

/**
 * The platform dashboard (ADM-01, M5-17). The database works the figures out, and refuses anybody
 * who is not platform staff past their second step; this puts the days they cover into words.
 * Throws when the figures cannot be read, rather than passing for a quiet month.
 */
export async function platformDashboard(): Promise<PlatformDashboard> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('platform_dashboard');
  if (error) throw new Error(`Could not read the platform dashboard: ${error.message}`);
  const facts = dashboardSchema.parse(data);
  const from = new Date(facts.from);
  const { signups, businesses, lessons, money, verification, disputes } = facts;

  return {
    range: `${formatDate(from)} to ${formatDate(new Date(from.getTime() + SPAN_MS))}`,
    signups: { ...signups, total: signups.learners + signups.instructors + signups.schools + signups.undecided },
    businesses,
    lessons,
    money: {
      gmvPence: money.gmv_pence,
      cardPence: money.card_pence,
      feesPence: money.fees_pence,
      payments: money.payments,
      refundsPence: money.refunds_pence,
    },
    verification: { waiting: verification.waiting, oldestSince: day(verification.oldest) },
    disputes: { open: disputes.open, oldestSince: day(disputes.oldest) },
  };
}
