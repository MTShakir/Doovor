import { rangeFromParams } from '@repo/core/stats-range';
import { todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DashboardFigures, DashboardSkeleton, WaitingOnStaff } from '@/components/admin/dashboard';
import { DateRangePicker } from '@/components/admin/date-range';
import { platformDashboard } from '@/lib/admin/dashboard';
import { requirePortal } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Dashboard' };

interface DashboardProps {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
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
  const range = rangeFromParams(await searchParams, today);
  const dashboard = await platformDashboard(range);
  return (
    <>
      <DateRangePicker today={today} chosen={range} base="/admin" />
      <WaitingOnStaff dashboard={dashboard} />
      <DashboardFigures dashboard={dashboard} />
    </>
  );
}
