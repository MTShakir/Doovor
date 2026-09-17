import { PageHeader } from '@repo/ui/app-shell';
import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SwitchOnRuleCard } from '@/components/admin/regions';
import { adminRegions } from '@/lib/admin/regions';
import { requirePortal } from '@/lib/auth/session';
import { RegionsScreen } from './regions-screen';

export const metadata: Metadata = { title: 'Regions' };

/** ADM-04, PRD 4.2: where the learner marketplace is open, and where it could open next. */
export default function AdminRegionsPage() {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Regions" subtitle="Where the learner marketplace is open, and where it could open next." />
      <div className="flex flex-col gap-4 px-4 md:px-8 lg:max-w-6xl">
        <Suspense fallback={<RegionsSkeleton />}>
          <Regions />
        </Suspense>
      </div>
    </main>
  );
}

async function Regions() {
  const { access } = await requirePortal('admin');
  const { rule, regions } = await adminRegions();
  return (
    <>
      <SwitchOnRuleCard rule={rule} />
      <RegionsScreen regions={regions} rule={rule} canSwitch={access.staffRole === 'super_admin'} />
    </>
  );
}

function RegionsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-24 rounded-card" />
      <Skeleton className="h-72 rounded-card" />
    </div>
  );
}
