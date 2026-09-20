import { moneyPeriod } from '@repo/core/money-periods';
import type { LocalDate } from '@repo/core/time';

/**
 * The stretches of days Today's figures cover (MNY-01, D-177), and how they are named. Kept apart
 * from the reading of them, because the screen that draws them runs in the browser too.
 */
export type StatsSpan = 'week' | 'month';

export const statsSpans: readonly StatsSpan[] = ['week', 'month'];

export const spanLabels: Record<StatsSpan, string> = { week: 'This week', month: 'This month so far' };

export function statsSpanFrom(value: string | undefined): StatsSpan {
  return value === 'month' ? 'month' : 'week';
}

/** The days a span covers: the whole week, or this month up to today. */
export function statsDays(span: StatsSpan, today: LocalDate): { from: LocalDate; to: LocalDate } {
  const period = moneyPeriod(span, today);
  return span === 'week' ? { from: period.from, to: period.to } : { from: period.from, to: today };
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
