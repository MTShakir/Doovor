import { PageHeader } from '@repo/ui/app-shell';
import { Card } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Wallet } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PayWeekView } from '@/components/school/pay-week';
import { requirePortal } from '@/lib/auth/session';
import { payWeek, weekFrom } from '@/lib/school/pay';

export const metadata: Metadata = { title: 'Your pay' };

interface PayProps {
  searchParams: Promise<{ week?: string | string[] }>;
}

/** MNY-06, D-291: what an instructor teaching under a school taught each week, and is paid. */
export default function InstructorPayPage({ searchParams }: PayProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Your pay" subtitle="What you taught for your school each week, and your pay." />
      <div className="flex flex-col gap-4 px-4 md:max-w-3xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Pay searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Pay({ searchParams }: PayProps) {
  const weekStart = weekFrom((await searchParams).week);
  const { access, session } = await requirePortal('instructor');
  const school = access.memberships.find((one) => one.businessType === 'school' && one.role === 'instructor');
  const week = school ? await payWeek(school.businessId, weekStart, session.userId) : null;
  if (!school || week === null) {
    return (
      <Card>
        <EmptyState icon={Wallet} title="No pay to show" description="Instructors teaching under a school see their pay here." />
      </Card>
    );
  }
  return <PayWeekView week={week} base="/app/instructor/pay" csvHref={`/app/instructor/pay/download?week=${week.weekStart}`} />;
}
