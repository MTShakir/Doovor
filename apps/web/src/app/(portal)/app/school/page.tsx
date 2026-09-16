import { formatDate } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { InstructorWeeks, OverviewFigures, OverviewSkeleton } from '@/components/school/overview';
import { requirePortal } from '@/lib/auth/session';
import { schoolOverview } from '@/lib/school/overview';

export const metadata: Metadata = { title: 'Overview' };

/** SCH-01, PRD 10.5 step 5: how the school is doing, the first thing its owner sees. */
export default function SchoolOverviewPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Overview" subtitle="How the school is doing today, this week and this month." />
      <div className="flex flex-col gap-4 px-4 md:px-8 lg:max-w-5xl">
        <Suspense fallback={<OverviewSkeleton />}>
          <Overview />
        </Suspense>
      </div>
    </main>
  );
}

async function Overview() {
  const { access } = await requirePortal('school');
  const membership = access.memberships.find(
    (one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'),
  );
  if (!membership) return null;

  const now = new Date();
  const overview = await schoolOverview(membership.businessId, now);
  return (
    <>
      <OverviewFigures overview={overview} today={formatDate(now)} />
      <InstructorWeeks instructors={overview.utilisation.instructors} week={overview.week} />
    </>
  );
}
