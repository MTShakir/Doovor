import { PageHeader } from '@repo/ui/app-shell';
import { SkeletonRow } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { learnerHealth } from '@/lib/learner/health';
import { learnerDriving } from '@/lib/learner/setup';
import { AboutYouForm, DrivingForm, MedicationForm } from './about-you-form';

export const metadata: Metadata = { title: 'About you', robots: { index: false } };

/** LRN-02, D-180: what a learner chooses to tell us, so lessons can suit them. */
export default function AboutYouPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="About you" subtitle="What you tell us here helps your instructor plan your lessons." />
      <div className="flex flex-col gap-4 px-4 md:max-w-2xl md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <AboutYou />
        </Suspense>
      </div>
    </main>
  );
}

async function AboutYou() {
  const { session } = await requirePortal('learner');
  const [held, driving] = await Promise.all([learnerHealth(session.userId), learnerDriving(session.userId)]);
  return (
    <>
      <DrivingForm driving={driving} />
      <AboutYouForm held={held} />
      <MedicationForm held={held} />
    </>
  );
}
