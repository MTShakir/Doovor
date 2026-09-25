import { PageHeader } from '@repo/ui/app-shell';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { UserRoundPlus } from 'lucide-react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { ReferScreen } from '@/components/refer-screen';
import { myReferrals } from '@/lib/billing/referrals';
import { requirePortal } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Refer an instructor' };

/** D-205: the link, who has come from it, and what that has earned. */
export default function SchoolReferPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Refer an instructor" subtitle="A month of the paid plan for every one who joins from your link." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Refer />
        </Suspense>
      </div>
    </main>
  );
}

async function Refer() {
  // Who has joined and when, which a prerendered shell cannot know.
  await connection();
  await requirePortal('school');
  const referrals = await myReferrals();
  if (!referrals) {
    return (
      <EmptyState
        icon={UserRoundPlus}
        title="The owner looks after this"
        description="The link belongs to the business, so whoever owns it shares it. Ask them for theirs."
      />
    );
  }
  return <ReferScreen referrals={referrals} />;
}
