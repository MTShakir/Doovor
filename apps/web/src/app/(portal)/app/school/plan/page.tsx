import { PageHeader } from '@repo/ui/app-shell';
import { EmptyState } from '@repo/ui/empty-state';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Layers } from 'lucide-react';
import type { Metadata } from 'next';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { BackLink } from '@/components/back-link';
import { PlanScreen } from '@/components/plan-screen';
import { businessPlan } from '@/lib/billing/plan';
import { requirePortal } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Your plan' };

/** D-203, D-204: what this Business is on, and when it runs to. */
export default function SchoolPlanPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <BackLink href="/app/school/more">More</BackLink>
      <PageHeader title="Your plan" subtitle="What you are on, and until when." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Plan />
        </Suspense>
      </div>
    </main>
  );
}

async function Plan() {
  // How many days are left is counted from now, which a prerendered shell cannot know.
  await connection();
  await requirePortal('school');
  const plan = await businessPlan();
  if (!plan) {
    return (
      <EmptyState
        icon={Layers}
        title="The owner looks after this"
        description="The plan is the Business's, so whoever owns it sees it. Ask them if you need to know what it is on."
      />
    );
  }
  return <PlanScreen plan={plan} />;
}
