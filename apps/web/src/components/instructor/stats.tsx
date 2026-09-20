import { countOf } from '@repo/core/counts';
import { formatPence } from '@repo/core/money';
import { formatMinutes } from '@repo/core/time';
import { BarChart, type Bar, type BarChartLegend } from '@repo/ui/bar-chart';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import type { Route } from 'next';
import Link from 'next/link';
import { Figure } from '@/components/figure';
import { statsSpans, type EarningsDay, type InstructorStats, type StatsSpan } from '@/lib/instructor/spans';

const legend: BarChartLegend[] = [
  { key: 'card', label: 'Card', fill: 'bg-black' },
  { key: 'cash', label: 'Cash', fill: 'bg-green' },
  { key: 'bank', label: 'Bank', fill: 'bg-blue' },
  { key: 'credit', label: 'Credit', fill: 'bg-yellow' },
];

const tabs: Record<StatsSpan, string> = { week: 'This week', month: 'This month so far' };

/** What a day holds, in words, for whoever cannot see the bars. */
function dayInWords(day: EarningsDay): string {
  if (day.totalPence === 0) return `${day.when}: nothing`;
  const parts = [
    day.cardPence > 0 ? `${formatPence(day.cardPence)} card` : null,
    day.cashPence > 0 ? `${formatPence(day.cashPence)} cash` : null,
    day.bankPence > 0 ? `${formatPence(day.bankPence)} bank` : null,
    day.creditPence > 0 ? `${formatPence(day.creditPence)} credit` : null,
  ].filter((part) => part !== null);
  return `${day.when}: ${formatPence(day.totalPence)}, ${parts.join(', ')}`;
}

/** A month has too many bars to name every one, so it names one a week. */
function barsFrom(stats: InstructorStats): Bar[] {
  return stats.days.map((day, index) => ({
    id: day.date,
    label: stats.span === 'week' ? day.when.slice(0, 3) : index % 7 === 0 ? day.date.slice(-2).replace(/^0/, '') : '',
    description: dayInWords(day),
    slices: [
      { key: 'card', value: day.cardPence },
      { key: 'cash', value: day.cashPence },
      { key: 'bank', value: day.bankPence },
      { key: 'credit', value: day.creditPence },
    ],
  }));
}

/**
 * How the week or the month is going (MNY-01, D-177): what was earned, drawn day by day and split
 * by how it was paid, with the hours booked and the learners taught under it.
 */
export function InstructorStatsCard({ stats }: { stats: InstructorStats }) {
  return (
    <Card className="flex flex-col gap-4" role="region" aria-labelledby="stats-title">
      <div className="flex flex-col gap-1">
        <CardTitle id="stats-title">How it is going</CardTitle>
        <CardDescription>Your own lessons: what they earned, and by how they were paid.</CardDescription>
      </div>

      <nav aria-label="Weeks and months" className="grid grid-cols-2 gap-2">
        {statsSpans.map((span) => (
          <Link
            key={span}
            href={(span === 'week' ? '/app/instructor' : `/app/instructor?stats=${span}`) as Route}
            scroll={false}
            aria-current={span === stats.span ? 'page' : undefined}
            className={`flex h-12 items-center justify-center rounded-full px-2 text-center text-small font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black md:text-body ${
              span === stats.span ? 'bg-black text-white' : 'bg-grey-100 text-black hover:bg-grey-200'
            }`}
          >
            {tabs[span]}
          </Link>
        ))}
      </nav>

      <div className="flex flex-col gap-1">
        <p className="text-h2 text-black tabular-nums">{formatPence(stats.earnedPence)}</p>
        <p className="text-small text-grey-700">{stats.label}</p>
      </div>

      <BarChart bars={barsFrom(stats)} legend={legend} label={`What you earned each day, ${stats.label.toLowerCase()}`} />

      <dl className="grid grid-cols-2 gap-3" aria-label="Lessons and learners">
        <Figure label="Hours booked" value={formatMinutes(stats.minutes)} detail="Lessons that are on, paid for or not" />
        <Figure label="Active learners" value={String(stats.learners)} detail={countOf(stats.learners, 'learner taught', 'learners taught')} />
      </dl>
    </Card>
  );
}
