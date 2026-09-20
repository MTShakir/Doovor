'use client';

import { formatCalendarDate, type LocalDate } from '@repo/core/time';
import { Card } from '@repo/ui/card';
import { MonthCalendar } from '@repo/ui/month-calendar';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { BookLesson, type BookableLearner } from '@/app/(portal)/app/instructor/book-lesson';

export interface MonthDay {
  date: LocalDate;
  /** The day as the day view draws it, so a day chosen here reads the same way it does there. */
  lessons: ReactNode;
}

export interface MonthViewProps {
  /** First day of the month shown. */
  month: LocalDate;
  /** The day the diary is on, which is the one the month opens with under it. */
  opensOn: LocalDate;
  today: LocalDate;
  /** Every day of this month with at least one lesson on it. */
  days: MonthDay[];
  learners: BookableLearner[];
}

/**
 * The month at a glance (DIA-03, M1-21, D-184). A day with lessons on it is marked, and choosing
 * one lists that day under the month rather than leaving the month, so an instructor can look
 * down a week of days without losing their place. A day still to come can be booked from here.
 */
export function MonthView({ month, opensOn, today, days, learners }: MonthViewProps) {
  const router = useRouter();
  const headingId = useId();
  // Held with the month it belongs to: turning the month over puts the choice away with it.
  const [picked, setPicked] = useState<{ month: LocalDate; date: LocalDate } | null>(null);
  const selected = picked?.month === month ? picked.date : opensOn;
  const marked = useMemo(() => new Set(days.map((day) => day.date)), [days]);
  const chosen = days.find((day) => day.date === selected) ?? null;

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-6">
      <Card>
        <MonthCalendar
          month={month}
          today={today}
          selected={selected}
          marked={marked}
          onMonthChange={(next) => { router.push(`/app/instructor/diary?view=month&date=${next}` as Route); }}
          onSelect={(date) => { setPicked({ month, date }); }}
        />
      </Card>
      <section className="flex flex-col gap-3" aria-labelledby={headingId}>
        <h3 id={headingId} className="text-h3 text-black">
          {formatCalendarDate(selected, { year: false })}
        </h3>
        <div aria-live="polite">{chosen?.lessons ?? <p className="text-small text-grey-700">Nothing booked on this day.</p>}</div>
        {/* A lesson cannot be booked into a day that has been and gone. */}
        {selected >= today && learners.length > 0 ? (
          <BookLesson
            // The form starts on the day chosen, and starts again when another day is.
            key={selected}
            learners={learners}
            date={selected}
            label="Add a lesson on this day"
            variant="secondary"
          />
        ) : null}
      </section>
    </div>
  );
}
