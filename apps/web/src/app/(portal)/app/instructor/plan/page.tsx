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
import { proSubscription } from '@/lib/billing/subscription';
import { requirePortal } from '@/lib/auth/session';
import { GoPro, ProSubscriptionCard, WaitingForStripe } from './go-pro';

export const metadata: Metadata = { title: 'Your plan' };

/** D-203, D-204: what this Business is on, and when it runs to. */
export default function InstructorPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ subscribed?: string | string[] }>;
}) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <BackLink href="/app/instructor/more">More</BackLink>
      <PageHeader title="Your plan" subtitle="What you are on, and until when." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Plan searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Plan({ searchParams }: { searchParams: Promise<{ subscribed?: string | string[] }> }) {
  // How many days are left is counted from now, which a prerendered shell cannot know.
  await connection();
  await requirePortal('instructor');
  const [plan, subscription, params] = await Promise.all([businessPlan(), proSubscription(), searchParams]);
  if (!plan) {
    return (
      <EmptyState
        icon={Layers}
        title="Your school looks after this"
        description="The plan is the Business's, so whoever owns it sees it. Ask them if you need to know what it is on."
      />
    );
  }
  // Back from the card page. The plan is granted by the webhook and not by this redirect, so a
  // moment can pass where the card has gone through and the row has not caught up. Offering them
  // the button again would have somebody subscribe twice (D-231).
  const justPaid = params.subscribed === '1' || (Array.isArray(params.subscribed) && params.subscribed.includes('1'));

  // Null for a school owner, who pays per instructor instead (D-231), and for anybody whose
  // plan is not theirs to change.
  const subscribe =
    subscription === null ? undefined : subscription.live ? (
      <ProSubscriptionCard subscription={subscription} />
    ) : justPaid ? (
      <WaitingForStripe />
    ) : (
      <GoPro subscription={subscription} alreadyPro={plan.plan !== 'free'} runsTo={plan.runsTo} />
    );

  return <PlanScreen plan={plan} subscribe={subscribe} subscribed={subscription?.live ?? false} />;
}
