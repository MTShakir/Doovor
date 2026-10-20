import { PageHeader } from '@repo/ui/app-shell';
import { Card } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Lock } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { payWeek, weekFrom } from '@/lib/school/pay';
import { PayScreen } from './pay-screen';

export const metadata: Metadata = { title: 'Instructor pay' };

interface PayProps {
  searchParams: Promise<{ week?: string | string[] }>;
}

/** MNY-06, SCH-05, D-291: what the school's own instructors taught each week, and their pay. */
export default function SchoolPayPage({ searchParams }: PayProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Instructor pay" subtitle="What each instructor teaching under the school taught, and is paid." />
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
  const { access } = await requirePortal('school');
  const school = access.memberships.find((one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'));
  if (!school) return null;

  const week = await payWeek(school.businessId, weekStart);
  if (week === null) {
    return (
      <Card>
        <EmptyState icon={Lock} title="Pay is the owner's to see" description="The owner can let a manager see revenue, and with it what instructors are paid." />
      </Card>
    );
  }
  return <PayScreen week={week} />;
}
