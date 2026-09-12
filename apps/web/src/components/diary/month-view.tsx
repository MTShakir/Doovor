'use client';

import { MonthCalendar } from '@repo/ui/month-calendar';
import { useRouter } from 'next/navigation';
import type { Route } from 'next';

export interface MonthViewProps {
  /** First day of the month shown. */
  month: string;
  today: string;
  /** Days with at least one lesson on them. */
  busy: string[];
}

/**
 * The month at a glance (DIA-03, M1-21). A day with lessons on it is marked, and choosing
 * one opens that day, which is where the detail lives.
 */
export function MonthView({ month, today, busy }: MonthViewProps) {
  const router = useRouter();

  return (
    <MonthCalendar
      month={month}
      today={today}
      selected={null}
      marked={new Set(busy)}
      onMonthChange={(next) => { router.push(`/app/instructor/diary?view=month&date=${next}` as Route); }}
      onSelect={(date) => { router.push(`/app/instructor/diary?view=day&date=${date}` as Route); }}
      className="max-w-md"
    />
  );
}
