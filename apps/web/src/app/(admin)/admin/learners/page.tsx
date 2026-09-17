import { adminSearchSchema } from '@repo/core/schemas/admin';
import { PageHeader } from '@repo/ui/app-shell';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminSearch, AdminSearchSkeleton, foundWords } from '@/components/admin/admin-search';
import { findLearners } from '@/lib/admin/people';
import { requirePortal } from '@/lib/auth/session';
import { LearnersScreen } from './learners-screen';

export const metadata: Metadata = { title: 'Learners' };

interface LearnersPageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

/** ADM-02: find a learner, and suspend their account or reset their two-step verification. */
export default function AdminLearnersPage({ searchParams }: LearnersPageProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Learners" subtitle="Find a learner, see who they learn with, and look after their account." />
      <div className="flex flex-col gap-4 px-4 md:px-8 lg:max-w-4xl">
        <Suspense fallback={<AdminSearchSkeleton />}>
          <Learners searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Learners({ searchParams }: LearnersPageProps) {
  const { session, access } = await requirePortal('admin');
  const { q } = await searchParams;
  const typed = adminSearchSchema.safeParse(typeof q === 'string' ? q : '');
  const query = typed.success ? typed.data : '';
  const rows = await findLearners(query);

  return (
    <>
      <AdminSearch action="/admin/learners" label="Search learners" hint="A name, email or mobile." query={query} />
      <p className="text-small text-grey-700" aria-live="polite">
        {foundWords(rows.length, query, 'learner', 'learners')}
      </p>
      <LearnersScreen rows={rows} query={query} viewer={{ canManage: access.staffRole === 'super_admin', userId: session.userId }} />
    </>
  );
}
