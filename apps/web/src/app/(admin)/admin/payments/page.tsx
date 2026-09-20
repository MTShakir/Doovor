import { rangeFromParams } from '@repo/core/stats-range';
import { todayInZone } from '@repo/core/time';
import { PageHeader } from '@repo/ui/app-shell';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { DateRangePicker } from '@/components/admin/date-range';
import { IncomeSkeleton, PlatformIncomeScreen } from '@/components/admin/income';
import { platformIncome } from '@/lib/admin/income';
import { requirePortal } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Payments' };

interface PaymentsProps {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>;
}

/** ADM-01, ADM-10: what schools and instructors have paid the platform over the days chosen. */
export default function AdminPaymentsPage({ searchParams }: PaymentsProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Payments" subtitle="What schools and instructors have paid the platform." />
      <div className="flex flex-col gap-6 px-4 md:px-8 lg:max-w-5xl">
        <Suspense fallback={<IncomeSkeleton />}>
          <Income searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Income({ searchParams }: PaymentsProps) {
  await requirePortal('admin');
  const today = todayInZone();
  const range = rangeFromParams(await searchParams, today);
  const income = await platformIncome(range);

  return (
    <>
      <DateRangePicker today={today} chosen={range} base="/admin/payments" />
      <PlatformIncomeScreen income={income} label={range.label} />
    </>
  );
}
