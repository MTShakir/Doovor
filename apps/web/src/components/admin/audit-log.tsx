import { auditCategories } from '@repo/core/audit';
import { encodeAuditCursor, type AuditCursor, type AuditLogSearch } from '@repo/core/schemas/admin';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { EmptyState } from '@repo/ui/empty-state';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { Skeleton, SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft, ChevronRight, ScrollText } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type { AuditEntry } from '@/lib/admin/audit';

/** Where somebody stood when they did it. */
const roleWords: Readonly<Record<string, string>> = {
  super_admin: 'Super admin',
  support_admin: 'Support admin',
  owner: 'Owner',
  manager: 'Manager',
  instructor: 'Instructor',
  user: 'Own account',
};

/** The audit log's address for these filters, from a page's start or the newest entry (ADM-07). */
export function auditLogHref(filters: AuditLogSearch, before?: AuditCursor): Route {
  const params = new URLSearchParams();
  if (filters.kind !== undefined) params.set('kind', filters.kind);
  if (filters.person !== '') params.set('person', filters.person);
  if (filters.business !== '') params.set('business', filters.business);
  if (filters.from !== undefined) params.set('from', filters.from);
  if (filters.to !== undefined) params.set('to', filters.to);
  if (before !== undefined) params.set('before', encodeAuditCursor(before));
  const query = params.toString();
  return query === '' ? '/admin/audit-log' : `/admin/audit-log?${query}`;
}

/** ADM-07: a plain form, so a search of the log is an address staff can go back to or share. */
export function AuditFiltersForm({ filters }: { filters: AuditLogSearch }) {
  const kinds = [
    { value: '', label: 'Every kind' },
    ...auditCategories.map((category) => ({ value: category.key, label: category.label })),
  ];
  const filtered =
    filters.kind !== undefined || filters.person !== '' || filters.business !== '' || filters.from !== undefined || filters.to !== undefined;
  return (
    <form role="search" aria-label="Audit log" action="/admin/audit-log" method="get" className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      <Field label="Kind" hint="What sort of thing happened.">
        <Select name="kind" options={kinds} defaultValue={filters.kind ?? ''} />
      </Field>
      <Field label="Person" hint="Who did it, or whom it was about.">
        <Input name="person" type="search" defaultValue={filters.person} maxLength={100} autoComplete="off" />
      </Field>
      <Field label="Business" hint="Part of its name.">
        <Input name="business" type="search" defaultValue={filters.business} maxLength={100} autoComplete="off" />
      </Field>
      <Field label="From" hint="A day in London.">
        <Input name="from" type="date" defaultValue={filters.from ?? ''} />
      </Field>
      <Field label="To" hint="Included.">
        <Input name="to" type="date" defaultValue={filters.to ?? ''} />
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit" variant="secondary" width="full">
          Show
        </Button>
        {filtered ? (
          <Button asChild variant="tertiary" width="full">
            <Link href="/admin/audit-log">Clear filters</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Changes({ entry }: { entry: AuditEntry }) {
  if (entry.before === null && entry.after === null) return null;
  return (
    <details className="mt-1">
      <summary className="inline-flex min-h-12 cursor-pointer items-center text-small text-ink underline underline-offset-4">What changed</summary>
      <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-2">
        {entry.before === null ? null : (
          <div className="min-w-0">
            <p className="text-caption font-semibold text-grey-700">Before</p>
            <pre className="rounded-input bg-grey-100 p-2 text-caption whitespace-pre-wrap wrap-anywhere text-ink">{JSON.stringify(entry.before, null, 2)}</pre>
          </div>
        )}
        {entry.after === null ? null : (
          <div className="min-w-0">
            <p className="text-caption font-semibold text-grey-700">After</p>
            <pre className="rounded-input bg-grey-100 p-2 text-caption whitespace-pre-wrap wrap-anywhere text-ink">{JSON.stringify(entry.after, null, 2)}</pre>
          </div>
        )}
      </div>
    </details>
  );
}

/** ADM-07, NFR-SEC-06: what happened, when, who did it and as what, and whom or which Business it was about. */
export function AuditEntries({ entries }: { entries: AuditEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState icon={ScrollText} title="Nothing recorded" description="Nothing in the audit log matches these filters." />;
  }
  return (
    // Relative, so the words kept for screen readers scroll with the table instead of widening the page.
    <Card padding="none" className="relative overflow-x-auto">
      <table className="w-full min-w-[56rem] text-left">
        <caption className="sr-only">The audit log, newest first</caption>
        <thead>
          <tr className="border-b border-grey-200 text-small text-grey-700">
            <th scope="col" className="px-4 py-3 font-semibold">
              When
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              What happened
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Who
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              About
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">
              Business
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-grey-200 align-top last:border-b-0">
              <td className="px-4 py-3 text-small whitespace-nowrap text-ink tabular-nums">
                <time dateTime={entry.occurredAt}>{entry.when}</time>
              </td>
              <th scope="row" className="px-4 py-3 text-left font-normal">
                <span className="block text-body font-medium text-ink">{entry.what}</span>
                <span className="block text-caption text-grey-700">{entry.action}</span>
                <Changes entry={entry} />
              </th>
              <td className="px-4 py-3 text-small text-ink">
                <span className="block break-words">{entry.who}</span>
                {entry.role === 'system' ? null : <span className="block text-caption text-grey-700">{roleWords[entry.role] ?? entry.role}</span>}
              </td>
              <td className="px-4 py-3 text-small break-words text-ink">{entry.about ?? ''}</td>
              <td className="px-4 py-3 text-small text-ink">{entry.business ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

/** Back to the newest entries, and on to older ones, keeping the filters (ADM-07). */
export function AuditPager({ filters, older }: { filters: AuditLogSearch; older: AuditCursor | null }) {
  if (filters.before === undefined && older === null) return null;
  return (
    <nav aria-label="Audit log pages" className="flex flex-wrap gap-2">
      {filters.before === undefined ? null : (
        <Button asChild variant="secondary">
          <Link href={auditLogHref(filters)}>
            <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
            Newest entries
          </Link>
        </Button>
      )}
      {older === null ? null : (
        <Button asChild variant="secondary" className="ml-auto">
          <Link href={auditLogHref(filters, older)}>
            Older entries
            <ChevronRight size={20} strokeWidth={1.5} aria-hidden />
          </Link>
        </Button>
      )}
    </nav>
  );
}

/** While the log is read: the filters and a few rows, so nothing jumps when they arrive. */
export function AuditLogSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-44 w-full" />
      <Card padding="none">
        {Array.from({ length: 6 }, (_, index) => (
          <SkeletonRow key={index} />
        ))}
      </Card>
    </div>
  );
}
