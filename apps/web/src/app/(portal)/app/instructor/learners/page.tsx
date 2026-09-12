import type { Metadata } from 'next';
import { PageHeader } from '@repo/ui/app-shell';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { requirePortal } from '@/lib/auth/session';
import { InviteForm } from './invite-form';

export const metadata: Metadata = { title: 'Learners' };

export default function LearnersPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Learners" subtitle="The people you teach." />
      <div className="flex max-w-2xl flex-col gap-5 px-4 md:px-8">
        <Suspense fallback={<SkeletonRow />}>
          <Invite />
        </Suspense>
      </div>
    </main>
  );
}

/** AUTH-07. The list of learners themselves arrives with the rest of M2. */
async function Invite() {
  await requirePortal('instructor');

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <CardTitle>Invite a learner</CardTitle>
        <CardDescription>
          Send them a link. They sign up on their phone and land already linked to you.
        </CardDescription>
      </div>
      <InviteForm />
    </Card>
  );
}
