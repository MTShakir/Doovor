import { PageHeader } from '@repo/ui/app-shell';
import { SkeletonRow } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { deletionRequests } from '@/lib/admin/deletions';
import { requirePortal } from '@/lib/auth/session';
import { DeletionsScreen } from './deletions-screen';

export const metadata: Metadata = { title: 'Leaving' };

/** AUTH-09, ADM-02: who has asked to delete their account, why, and how to reach them (D-175). */
export default function AdminDeletionsPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Leaving" subtitle="Who has asked to delete their account, and why. Seven days to put it right." />
      <div className="flex flex-col gap-4 px-4 md:px-8 lg:max-w-4xl">
        <Suspense fallback={<SkeletonRow />}>
          <Leaving />
        </Suspense>
      </div>
    </main>
  );
}

async function Leaving() {
  const { access } = await requirePortal('admin');
  const requests = await deletionRequests();
  return <DeletionsScreen requests={requests} canKeep={access.staffRole === 'super_admin'} />;
}
