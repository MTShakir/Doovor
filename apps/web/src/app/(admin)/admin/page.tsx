import { rangeFromParams } from '@repo/core/stats-range';
import { todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import type { Metadata, Route } from 'next';
import { Suspense } from 'react';
import { DashboardFigures, DashboardSkeleton, WaitingOnStaff } from '@/components/admin/dashboard';
import { DateRangePicker } from '@/components/admin/date-range';
import { PlatformHighlights } from '@/components/admin/highlights';
import { platformDashboard } from '@/lib/admin/dashboard';
import { arrivalsCount, arrivalsStep, platformHighlights } from '@/lib/admin/highlights';
import { requirePortal } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Dashboard' };

interface DashboardProps {
  searchParams: Promise<{ range?: string; from?: string; to?: string; joined?: string }>;
}

/** ADM-01: how the platform is doing over the days staff choose, and what is waiting on its people. */
export default function AdminDashboardPage({ searchParams }: DashboardProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Dashboard" subtitle="How the platform is doing, and what is waiting on a person." />
      <div className="flex flex-col gap-6 px-4 md:px-8 lg:max-w-6xl">
        <Suspense fallback={<DashboardSkeleton />}>
          <Dashboard searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Dashboard({ searchParams }: DashboardProps) {
  await requirePortal('admin');
  const today = todayInZone();
  const params = await searchParams;
  const range = rangeFromParams(params, today);
  const shown = arrivalsCount(params.joined);
  const [dashboard, highlights] = await Promise.all([platformDashboard(range), platformHighlights(range, shown)]);

  // More arrivals, over the same days: the days are kept, the count goes up.
  const asked = new URLSearchParams();
  if (range.key === 'custom') {
    asked.set('from', range.from);
    asked.set('to', range.to);
  } else if (range.key !== 'last_30_days') {
    asked.set('range', range.key);
  }
  asked.set('joined', String(shown + arrivalsStep));

  return (
    <>
      {/* What waits on a person comes first: it is about now, and the dates below it are not. */}
      <WaitingOnStaff dashboard={dashboard} />
      <DateRangePicker today={today} chosen={range} base="/admin" />
      <DashboardFigures dashboard={dashboard} />
      <PlatformHighlights highlights={highlights} shown={shown} moreHref={`/admin?${asked.toString()}` as Route} />
    </>
  );
}
