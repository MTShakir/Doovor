import 'server-only';
import { moneyPeriod, type MoneyPeriod } from '@repo/core/money-periods';
import { formatCalendarDate, todayInZone } from '@repo/core/time';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const count = z.number().int();

// The function answers JSON, so it is read the way any input is.
const overviewSchema = z.object({
  lessons: z.object({ today: count, this_week: count }),
  revenue_month: z
    .object({ lessons_pence: count, packages_pence: count, refunds_pence: count, total_pence: count })
    .nullable(),
  unpaid: z.object({ total_pence: count, count }),
  utilisation: z.object({
    open_minutes: count,
    booked_minutes: count,
    instructors: z.array(
      z.object({ instructor_id: z.string(), name: z.string(), open_minutes: count, booked_minutes: count }),
    ),
  }),
  new_learners_month: count,
});

export interface InstructorWeek {
  instructorId: string;
  name: string;
  openMinutes: number;
  bookedMinutes: number;
}

export interface SchoolOverview {
  week: MoneyPeriod;
  month: MoneyPeriod;
  lessons: { today: number; thisWeek: number };
  /** Null for somebody not allowed to see the school's revenue (PRD 6.2). */
  revenueMonth: { lessonsPence: number; packagesPence: number; refundsPence: number; totalPence: number } | null;
  unpaid: { totalPence: number; count: number };
  utilisation: { openMinutes: number; bookedMinutes: number; instructors: InstructorWeek[] };
  newLearnersMonth: number;
}

/** "Mon 26 Oct to Sun 1 Nov": on a screen about this week, the year goes without saying. */
function withoutYear(period: MoneyPeriod): MoneyPeriod {
  return { ...period, range: `${formatCalendarDate(period.from, { year: false })} to ${formatCalendarDate(period.to, { year: false })}` };
}

/**
 * A school's overview (SCH-01, M5-12). The database works the figures out and decides what the
 * person asking may see; this names the week and month they cover, in London, for the words.
 * Throws when the figures cannot be read, rather than passing for a quiet week.
 */
export async function schoolOverview(businessId: string, now = new Date()): Promise<SchoolOverview> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('school_overview', { p_business_id: businessId });
  if (error) throw new Error(`Could not read the school overview: ${error.message}`);
  const facts = overviewSchema.parse(data);
  const today = todayInZone(now);

  return {
    week: withoutYear(moneyPeriod('week', today)),
    month: withoutYear(moneyPeriod('month', today)),
    lessons: { today: facts.lessons.today, thisWeek: facts.lessons.this_week },
    revenueMonth:
      facts.revenue_month === null
        ? null
        : {
            lessonsPence: facts.revenue_month.lessons_pence,
            packagesPence: facts.revenue_month.packages_pence,
            refundsPence: facts.revenue_month.refunds_pence,
            totalPence: facts.revenue_month.total_pence,
          },
    unpaid: { totalPence: facts.unpaid.total_pence, count: facts.unpaid.count },
    utilisation: {
      openMinutes: facts.utilisation.open_minutes,
      bookedMinutes: facts.utilisation.booked_minutes,
      instructors: facts.utilisation.instructors.map((one) => ({
        instructorId: one.instructor_id,
        name: one.name,
        openMinutes: one.open_minutes,
        bookedMinutes: one.booked_minutes,
      })),
    },
    newLearnersMonth: facts.new_learners_month,
  };
}
