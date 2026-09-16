import { PageHeader } from '@repo/ui/app-shell';
import { SkeletonRow } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { schoolTeam } from '@/lib/school/team';
import { TeamScreen } from './team-screen';

export const metadata: Metadata = { title: 'Instructors' };

/** SCH-02: invite, switch off, say what each may do, and open each instructor's diary. */
export default function SchoolInstructorsPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Instructors" subtitle="Everybody who teaches for the school, and the people who help run it." />
      <div className="flex flex-col gap-4 px-4 md:max-w-3xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Team />
        </Suspense>
      </div>
    </main>
  );
}

async function Team() {
  const { access } = await requirePortal('school');
  const membership = access.memberships.find(
    (one) => one.businessType === 'school' && (one.role === 'owner' || one.role === 'manager'),
  );
  if (!membership) return null;

  const team = await schoolTeam(membership.businessId);
  return <TeamScreen team={team} viewerIsOwner={membership.role === 'owner'} />;
}
