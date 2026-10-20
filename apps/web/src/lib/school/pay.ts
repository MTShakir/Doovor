import 'server-only';
import { csvPence, toCsv } from '@repo/core/csv-write';
import { mondayOfWeek, payWords, type PayBasis } from '@repo/core/member-pay';
import { addDaysToLocalDate, formatCalendarDate, formatDateTime, formatLessonLength, formatMinutes, isValidLocalDate, todayInZone } from '@repo/core/time';
import { z } from '@repo/core/zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

// The function answers JSON, so it is read the way any input is.
const statementSchema = z.object({
  weekStart: z.string(),
  members: z.array(
    z.object({
      membershipId: z.string(),
      instructorId: z.string(),
      name: z.string(),
      active: z.boolean(),
      basis: z.enum(['hourly', 'share']).nullable(),
      hourlyPence: z.number().nullable(),
      sharePercent: z.number().nullable(),
      nowBasis: z.enum(['hourly', 'share']).nullable(),
      nowHourlyPence: z.number().nullable(),
      nowSharePercent: z.number().nullable(),
      lessons: z.array(
        z.object({
          bookingId: z.string(),
          startsAt: z.string(),
          minutes: z.number(),
          pricePence: z.number(),
          payPence: z.number().nullable(),
          learnerName: z.string(),
          status: z.string(),
        }),
      ),
      minutes: z.number(),
      pricePence: z.number(),
      payPence: z.number().nullable(),
    }),
  ),
});

/** A lesson on a statement, written out here: a client component may not read dates while prerendering. */
export interface PayLesson {
  bookingId: string;
  startsAt: string;
  /** "Tue 13 Oct, 10:00". */
  when: string;
  /** "1h", "1.5h". */
  length: string;
  minutes: number;
  learnerName: string;
  noShow: boolean;
  pricePence: number;
  payPence: number | null;
}

/** One instructor's week (M9-22, D-291). */
export interface MemberWeek {
  membershipId: string;
  name: string;
  active: boolean;
  basis: PayBasis | null;
  hourlyPence: number | null;
  sharePercent: number | null;
  /** "£18 an hour", "60% of each lesson" or "No pay set", that week. */
  payWords: string;
  /** What they are paid now, for changing it, and in words when it is not what the week says. */
  now: { basis: PayBasis | null; hourlyPence: number | null; sharePercent: number | null; words: string | null };
  lessons: PayLesson[];
  /** "2 hours 30 minutes", or "Nothing taught". */
  taught: string;
  minutes: number;
  pricePence: number;
  payPence: number | null;
}

export interface PayWeek {
  /** The Monday the week starts on. */
  weekStart: string;
  /** "Mon 12 Oct to Sun 18 Oct". */
  label: string;
  previous: string;
  next: string;
  members: MemberWeek[];
}

/** The week asked for in the address, or this one. */
export function weekFrom(value: string | string[] | undefined): string {
  const asked = typeof value === 'string' && isValidLocalDate(value) ? value : todayInZone();
  return mondayOfWeek(asked);
}

/**
 * A week of lessons taught under a school, with each instructor's pay (M9-22, D-291): everybody's
 * for the owner or a manager allowed to see revenue, or one instructor's own. Null when the person
 * asking may not see it; the database decides.
 */
export async function payWeek(schoolId: string, weekStart: string, userId?: string): Promise<PayWeek | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc('member_pay_statement', {
    p_business_id: schoolId,
    p_week_start: weekStart,
    ...(userId === undefined ? {} : { p_user_id: userId }),
  });
  if (error) return null;
  const parsed = statementSchema.safeParse(data);
  if (!parsed.success) return null;
  const sunday = addDaysToLocalDate(weekStart, 6);
  return {
    weekStart,
    label: `${formatCalendarDate(weekStart, { year: false })} to ${formatCalendarDate(sunday, { year: false })}`,
    previous: addDaysToLocalDate(weekStart, -7),
    next: addDaysToLocalDate(weekStart, 7),
    members: parsed.data.members.map((member) => ({
      membershipId: member.membershipId,
      name: member.name,
      active: member.active,
      basis: member.basis,
      hourlyPence: member.hourlyPence,
      sharePercent: member.sharePercent,
      payWords: payWords(member.basis, member.hourlyPence, member.sharePercent),
      now: (() => {
        const words = payWords(member.nowBasis, member.nowHourlyPence, member.nowSharePercent);
        return {
          basis: member.nowBasis,
          hourlyPence: member.nowHourlyPence,
          sharePercent: member.nowSharePercent,
          words: words === payWords(member.basis, member.hourlyPence, member.sharePercent) ? null : words,
        };
      })(),
      lessons: member.lessons.map((lesson) => ({
        bookingId: lesson.bookingId,
        startsAt: lesson.startsAt,
        when: formatDateTime(new Date(lesson.startsAt)),
        length: formatLessonLength(lesson.minutes),
        minutes: lesson.minutes,
        learnerName: lesson.learnerName,
        noShow: lesson.status === 'no_show',
        pricePence: lesson.pricePence,
        payPence: lesson.payPence,
      })),
      taught: member.minutes === 0 ? 'Nothing taught' : formatMinutes(member.minutes),
      minutes: member.minutes,
      pricePence: member.pricePence,
      payPence: member.payPence,
    })),
  };
}

/** The week as a CSV file a spreadsheet or payroll will read: a line for each lesson, and each instructor's total. */
export function payCsv(week: PayWeek): string {
  const rows: (string | number | null)[][] = [
    ['Instructor', 'Date', 'Learner', 'Minutes', 'No-show', 'Lesson price', 'Pay'],
  ];
  for (const member of week.members) {
    for (const lesson of member.lessons) {
      rows.push([
        member.name,
        lesson.when,
        lesson.learnerName,
        lesson.minutes,
        lesson.noShow ? 'Yes' : '',
        csvPence(lesson.pricePence),
        lesson.payPence === null ? '' : csvPence(lesson.payPence),
      ]);
    }
    rows.push([`${member.name}, total`, week.label, '', member.minutes, '', csvPence(member.pricePence), member.payPence === null ? '' : csvPence(member.payPence)]);
  }
  return toCsv(rows);
}

/** "pay-week-2026-10-12.csv". */
export function payFileName(weekStart: string): string {
  return `pay-week-${weekStart}.csv`;
}
