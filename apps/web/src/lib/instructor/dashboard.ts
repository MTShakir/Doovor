import 'server-only';
import { periodInstants } from '@repo/core/money-periods';
import { formatCalendarDate, todayInZone } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { spanLabels, statsDays, type InstructorStats, type StatsSpan } from '@/lib/instructor/spans';
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
