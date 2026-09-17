import { countOf } from '@repo/core/counts';
import { adminSearchSchema } from '@repo/core/schemas/admin';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Skeleton, SkeletonRow } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { findBusinesses } from '@/lib/admin/businesses';
import { requirePortal } from '@/lib/auth/session';
import { BusinessesScreen } from './businesses-screen';

export const metadata: Metadata = { title: 'Businesses' };

const LIMIT = 25;

interface BusinessesPageProps {
  searchParams: Promise<{ q?: string | string[] }>;
}

/** ADM-02: find a Business, see who works there, and suspend or reactivate it. */
export default function AdminBusinessesPage({ searchParams }: BusinessesPageProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Businesses" subtitle="Find a Business, see who works there, and suspend or reactivate it." />
      <div className="flex flex-col gap-4 px-4 md:px-8 lg:max-w-4xl">
        <Suspense fallback={<BusinessesSkeleton />}>
          <Businesses searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Businesses({ searchParams }: BusinessesPageProps) {
  const { access } = await requirePortal('admin');
  const { q } = await searchParams;
  const typed = adminSearchSchema.safeParse(typeof q === 'string' ? q : '');
  const query = typed.success ? typed.data : '';
  const rows = await findBusinesses(query);

  return (
    <>
      {/* A plain form, so a search is an address staff can go back to or share. */}
      <form role="search" action="/admin/businesses" method="get" className="flex items-end gap-2">
        <Field label="Search Businesses" hint="A name, postcode, email or mobile." className="flex-1">
          <Input name="q" type="search" defaultValue={query} maxLength={100} autoComplete="off" />
        </Field>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>
      <p className="text-small text-grey-700" aria-live="polite">
        {query === ''
          ? 'The newest Businesses'
          : rows.length === LIMIT
            ? `The newest ${String(LIMIT)} found. Type more to narrow it down.`
            : `${countOf(rows.length, 'Business', 'Businesses')} found`}
      </p>
      <BusinessesScreen rows={rows} query={query} canSuspend={access.staffRole === 'super_admin'} />
    </>
  );
}

function BusinessesSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-20 w-full" />
      <Card padding="none">
        {Array.from({ length: 4 }, (_, index) => (
          <SkeletonRow key={index} />
        ))}
      </Card>
    </div>
  );
}
