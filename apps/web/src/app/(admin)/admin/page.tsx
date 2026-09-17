import { PageHeader } from '@repo/ui/app-shell';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DashboardFigures, DashboardSkeleton, WaitingOnStaff } from '@/components/admin/dashboard';
import { platformDashboard } from '@/lib/admin/dashboard';
import { requirePortal } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Dashboard' };

/** ADM-01: how the platform is doing, and what is waiting on its staff. */
export default function AdminDashboardPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Dashboard" subtitle="How the platform is doing, and what is waiting on a person." />
      <div className="flex flex-col gap-6 px-4 md:px-8 lg:max-w-6xl">
        <Suspense fallback={<DashboardSkeleton />}>
          <Dashboard />
        </Suspense>
      </div>
    </main>
  );
}

async function Dashboard() {
  await requirePortal('admin');
  const dashboard = await platformDashboard();
  return (
    <>
      <WaitingOnStaff dashboard={dashboard} />
      <DashboardFigures dashboard={dashboard} />
    </>
  );
}
