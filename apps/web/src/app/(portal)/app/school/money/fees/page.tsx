import type { Metadata } from 'next';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import Link from 'next/link';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { icons } from '@/lib/icons';
import { schoolFees } from '@/lib/school/fees';
import { FeesScreen } from './fees-screen';

export const metadata: Metadata = { title: 'Fees' };

/** SCH-09, MNY-06, D-287: what the school's linked instructors pay it, and what they owe. */
export default function SchoolFeesPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Fees" subtitle="What your linked instructors pay you." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Fees />
        </Suspense>
      </div>
    </main>
  );
}

async function Fees() {
  const { access } = await requirePortal('school');
  const school = access.memberships.find((one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'));
  if (!school) return null;

  const linked = await schoolFees(school.businessId);
  if (linked.length === 0) {
    return (
      <Card className="flex flex-col gap-4">
        <EmptyState
          icon={icons.school}
          title="Nobody linked yet"
          description="Instructors who run their own business and link it to your school pay you a fee. Invite one from Instructors."
        />
        <div>
          <Button variant="secondary" asChild>
            <Link href="/app/school/instructors">Instructors</Link>
          </Button>
        </div>
      </Card>
    );
  }
  return <FeesScreen linked={linked} />;
}
