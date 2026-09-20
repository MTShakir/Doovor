import 'server-only';
import { moneyPeriod, periodInstants } from '@repo/core/money-periods';
import { formatCalendarDate, todayInZone, type LocalDate } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const whole = z.number().int();

// The function answers JSON, so it is read the way any input is.
const statsSchema = z.object({
  days: z.array(
    z.object({ day: z.string(), card_pence: whole, cash_pence: whole, bank_pence: whole, credit_pence: whole }),
  ),
  earned_pence: whole,
  minutes: whole,
  learners: whole,
});

export type StatsSpan = 'week' | 'month';

export const statsSpans: readonly StatsSpan[] = ['week', 'month'];

export function statsSpanFrom(value: string | undefined): StatsSpan {
  return value === 'month' ? 'month' : 'week';
}

export interface EarningsDay {
  /** The day itself, for the bar's label. */
  date: LocalDate;
  /** "Mon 14 Sep 2026", read out with the bar. */
  when: string;
  cardPence: number;
  cashPence: number;
  bankPence: number;
  creditPence: number;
  totalPence: number;
}

export interface InstructorStats {
  span: StatsSpan;
  /** What the tab says: "This week" or "This month so far". */
  label: string;
  days: EarningsDay[];
  earnedPence: number;
  /** Every lesson that is on, paid for or not. */
  minutes: number;
  learners: number;
}

const spanLabels: Record<StatsSpan, string> = { week: 'This week', month: 'This month so far' };

/** The days a span covers: the whole week, or this month up to today. */
export function statsDays(span: StatsSpan, today: LocalDate): { from: LocalDate; to: LocalDate } {
  const period = moneyPeriod(span, today);
  return span === 'week' ? { from: period.from, to: period.to } : { from: period.from, to: today };
}

/**
 * How an instructor's week or month is going (MNY-01, D-177): what they earned each day, the hours
 * they are teaching and the learners they are seeing. Their own lessons, whichever Business they
 * teach for. Null when the figures cannot be read, so Today still opens.
 */
export async function instructorStats(span: StatsSpan, now = new Date()): Promise<InstructorStats | null> {
  const days = statsDays(span, todayInZone(now));
  const { from, to } = periodInstants(days);

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('instructor_dashboard', { p_from: from.toISOString(), p_to: to.toISOString() });
  if (error) return null;

  const parsed = statsSchema.safeParse(data);
  if (!parsed.success) return null;
  const facts = parsed.data;

  return {
    span,
    label: spanLabels[span],
    days: facts.days.map((row) => ({
      date: row.day,
      when: formatCalendarDate(row.day),
      cardPence: row.card_pence,
      cashPence: row.cash_pence,
      bankPence: row.bank_pence,
      creditPence: row.credit_pence,
      totalPence: row.card_pence + row.cash_pence + row.bank_pence + row.credit_pence,
    })),
    earnedPence: facts.earned_pence,
    minutes: facts.minutes,
    learners: facts.learners,
  };
}
