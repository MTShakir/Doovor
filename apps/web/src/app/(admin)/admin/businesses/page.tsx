import { adminSearchSchema } from '@repo/core/schemas/admin';
import { PageHeader } from '@repo/ui/app-shell';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AdminSearch, AdminSearchSkeleton, foundWords } from '@/components/admin/admin-search';
import { findBusinesses } from '@/lib/admin/businesses';
import { requirePortal } from '@/lib/auth/session';
import { BusinessesScreen } from './businesses-screen';

export const metadata: Metadata = { title: 'Businesses' };

interface BusinessesPageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

/** ADM-02: find a Business, see who works there, and suspend or reactivate it. */
export default function AdminBusinessesPage({ searchParams }: BusinessesPageProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Businesses" subtitle="Find a Business, see who works there, and suspend or reactivate it." />
      <div className="flex flex-col gap-4 px-4 md:px-8 lg:max-w-4xl">
        <Suspense fallback={<AdminSearchSkeleton />}>
          <Businesses searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Businesses({ searchParams }: BusinessesPageProps) {
  const { session, access } = await requirePortal('admin');
  const { q } = await searchParams;
  const typed = adminSearchSchema.safeParse(typeof q === 'string' ? q : '');
  const query = typed.success ? typed.data : '';
  const rows = await findBusinesses(query);

  return (
    <>
      <AdminSearch action="/admin/businesses" label="Search Businesses" hint="A name, postcode, email or mobile." query={query} />
      <p className="text-small text-grey-700" aria-live="polite">
        {foundWords(rows.length, query, 'Business', 'Businesses')}
      </p>
      <BusinessesScreen rows={rows} query={query} viewer={{ canManage: access.staffRole === 'super_admin', userId: session.userId }} />
    </>
  );
}
