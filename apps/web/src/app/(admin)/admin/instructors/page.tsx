import { adminSearchSchema } from '@repo/core/schemas/admin';
import { PageHeader } from '@repo/ui/app-shell';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminSearch, AdminSearchSkeleton, foundWords } from '@/components/admin/admin-search';
import { findInstructors } from '@/lib/admin/people';
import { requirePortal } from '@/lib/auth/session';
import { InstructorsScreen } from './instructors-screen';

export const metadata: Metadata = { title: 'Instructors' };

interface InstructorsPageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

/** ADM-02: find an instructor, and suspend their account or reset their two-step verification. */
export default function AdminInstructorsPage({ searchParams }: InstructorsPageProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Instructors" subtitle="Find an instructor, see where they teach, and look after their account." />
      <div className="flex flex-col gap-4 px-4 md:px-8 lg:max-w-4xl">
        <Suspense fallback={<AdminSearchSkeleton />}>
          <Instructors searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Instructors({ searchParams }: InstructorsPageProps) {
  const { session, access } = await requirePortal('admin');
  const { q } = await searchParams;
  const typed = adminSearchSchema.safeParse(typeof q === 'string' ? q : '');
  const query = typed.success ? typed.data : '';
  const rows = await findInstructors(query);

  return (
    <>
      <AdminSearch action="/admin/instructors" label="Search instructors" hint="A name, email, mobile or badge number." query={query} />
      <p className="text-small text-grey-700" aria-live="polite">
        {foundWords(rows.length, query, 'instructor', 'instructors')}
      </p>
      <InstructorsScreen rows={rows} query={query} viewer={{ canManage: access.staffRole === 'super_admin', userId: session.userId }} />
    </>
  );
}
