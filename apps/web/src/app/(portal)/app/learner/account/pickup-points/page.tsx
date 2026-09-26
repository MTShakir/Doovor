import { PageHeader } from '@repo/ui/app-shell';
import { SkeletonRow } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BackLink } from '@/components/back-link';
import { PickupPoints } from '@/components/learners/pickup-points';
import { requirePortal } from '@/lib/auth/session';
import { myPickupPoints } from '@/lib/pickup/list';
import { addMyPickup, removeMyPickup, updateMyPickup } from './actions';

export const metadata: Metadata = { title: 'Pickup points', robots: { index: false } };

/** COV-04, D-182: where a learner's lessons start, kept by the learner themselves. */
export default function LearnerPickupPointsPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <BackLink href="/app/learner/account">Account</BackLink>
      <PageHeader title="Pickup points" subtitle="Where your lessons start. The one you tick is the one your instructor uses." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Places />
        </Suspense>
      </div>
    </main>
  );
}

async function Places() {
  const { session } = await requirePortal('learner');
  const pickups = await myPickupPoints(session.userId);
  return (
    <PickupPoints
      learnerId={session.userId}
      pickups={pickups}
      actions={{ add: addMyPickup, update: updateMyPickup, remove: removeMyPickup }}
      addedByOthers="added by your school"
      empty="None saved yet. Add where you want your lessons to start."
      note="Your instructor sees this, so they know where to collect you."
    />
  );
}
