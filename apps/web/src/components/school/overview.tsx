import { formatPence } from '@repo/core/money';
import type { MoneyPeriod } from '@repo/core/money-periods';
import { utilisationPercent, utilisationWords } from '@repo/core/utilisation';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { ListDivider } from '@repo/ui/list-row';
import { ProgressBar } from '@repo/ui/progress';
import { Skeleton } from '@repo/ui/skeleton';
import { Users } from 'lucide-react';
import { Figure } from '@/components/figure';
import type { InstructorWeek, SchoolOverview } from '@/lib/school/overview';

function lessonsWord(count: number): string {
  return count === 1 ? 'lesson' : 'lessons';
}

function percentText(percent: number | null): string {
  return percent === null ? 'None open' : `${String(percent)}%`;
}

/** SCH-01: the school's figures, as its owner or a manager may see them. */
export function OverviewFigures({ overview, today }: { overview: SchoolOverview; today: string }) {
  const { lessons, revenueMonth, unpaid, utilisation, newLearnersMonth, week, month } = overview;
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-3" aria-label="The school at a glance">
      <Figure label="Lessons today" value={String(lessons.today)} detail={today} />
      <Figure label="Lessons this week" value={String(lessons.thisWeek)} detail={week.range} />
      {revenueMonth ? (
        <Figure
          label={`Revenue in ${month.label}`}
          value={formatPence(revenueMonth.totalPence)}
          detail={`Lessons ${formatPence(revenueMonth.lessonsPence)}, packages ${formatPence(revenueMonth.packagesPence)}${
            revenueMonth.refundsPence > 0 ? `, less ${formatPence(revenueMonth.refundsPence)} refunded` : ''
          }`}
        />
      ) : null}
      <Figure
        label="Unpaid"
        value={formatPence(unpaid.totalPence)}
        detail={unpaid.count === 0 ? 'Nothing owed' : `${String(unpaid.count)} ${lessonsWord(unpaid.count)} and fees owed`}
      />
      {/* Short labels keep the numbers in a row level with each other on a phone. */}
      <Figure
        label="Utilisation"
        value={percentText(utilisationPercent(utilisation.bookedMinutes, utilisation.openMinutes))}
        detail={
          utilisation.openMinutes > 0
            ? `${utilisationWords(utilisation.bookedMinutes, utilisation.openMinutes)} this week`
            : utilisationWords(utilisation.bookedMinutes, utilisation.openMinutes)
        }
      />
      <Figure label="New learners" value={String(newLearnersMonth)} detail={`Joined in ${month.label}`} />
    </dl>
  );
}

/** SCH-01: how full each instructor's week is, by name. */
export function InstructorWeeks({
  instructors,
  week,
  idPrefix = 'instructor-weeks',
}: {
  instructors: InstructorWeek[];
  week: MoneyPeriod;
  /** Keeps the heading's id unique where the card appears more than once, as on the design page. */
  idPrefix?: string;
}) {
  return (
    <Card padding="none" role="region" aria-labelledby={`${idPrefix}-title`}>
      <div className="flex flex-col gap-1 px-4 pt-4 pb-2">
        <CardTitle id={`${idPrefix}-title`}>Instructors this week</CardTitle>
        <CardDescription>Lessons against the hours each is open, {week.range}.</CardDescription>
      </div>
      {instructors.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No instructors yet"
          description="Once your instructors have joined, you will see how full each of their weeks is."
        />
      ) : (
        <ul className="pb-2">
          {instructors.map((one, index) => {
            const percent = utilisationPercent(one.bookedMinutes, one.openMinutes);
            const words = utilisationWords(one.bookedMinutes, one.openMinutes);
            return (
              <li key={one.instructorId}>
                {index > 0 ? <ListDivider /> : null}
                <div className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-body font-medium text-ink">{one.name}</span>
                    <span className="shrink-0 text-body font-semibold text-black tabular-nums">{percentText(percent)}</span>
                  </div>
                  <ProgressBar value={percent ?? 0} label={`${one.name}, ${words}`} />
                  <span className="text-small text-grey-700">{words}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** While the figures load: the same shapes, so nothing jumps when they arrive. */
export function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-24 rounded-card" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-card" />
    </div>
  );
}
