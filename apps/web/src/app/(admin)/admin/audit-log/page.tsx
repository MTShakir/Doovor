import { auditLogSearchSchema } from '@repo/core/schemas/admin';
import { PageHeader } from '@repo/ui/app-shell';
import type { Metadata, Route } from 'next';
import { Suspense } from 'react';
import { AuditEntries, AuditFiltersForm, AuditLogSkeleton, AuditPager } from '@/components/admin/audit-log';
import { auditLog } from '@/lib/admin/audit';
import { requirePortal } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Audit log' };

interface AuditLogPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** ADM-07, NFR-SEC-06: who did what and when, for platform staff to look back through. */
export default function AdminAuditLogPage({ searchParams }: AuditLogPageProps) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Audit log" subtitle="Who did what, when, and to whom, newest first." />
      <div className="flex flex-col gap-4 px-4 md:px-8 lg:max-w-6xl">
        <Suspense fallback={<AuditLogSkeleton />}>
          <AuditLog searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function AuditLog({ searchParams }: AuditLogPageProps) {
  await requirePortal('admin');
  const filters = auditLogSearchSchema.parse(await searchParams);
  const { entries, older } = await auditLog(filters);

  // The file covers the filters, wherever the reader has paged back to.
  const asked = new URLSearchParams();
  if (filters.kind !== undefined) asked.set('kind', filters.kind);
  if (filters.person !== '') asked.set('person', filters.person);
  if (filters.business !== '') asked.set('business', filters.business);
  if (filters.from !== undefined) asked.set('from', filters.from);
  if (filters.to !== undefined) asked.set('to', filters.to);
  const query = asked.toString();

  return (
    <>
      <AuditFiltersForm filters={filters} downloadHref={`/admin/audit-log/log.json${query === '' ? '' : `?${query}`}` as Route} />
      <AuditEntries entries={entries} />
      <AuditPager filters={filters} older={older} />
    </>
  );
}
