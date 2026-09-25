import {
  adminFeedbackSearchSchema,
  feedbackKindLabels,
  feedbackKinds,
  feedbackPageSize,
  type AdminFeedbackSearch,
} from '@repo/core/schemas/feedback';
import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Card } from '@repo/ui/card';
import { Skeleton, SkeletonRow } from '@repo/ui/skeleton';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { feedbackReports } from '@/lib/admin/feedback';
import { requirePortal } from '@/lib/auth/session';
import { FeedbackScreen } from './feedback-screen';

export const metadata: Metadata = { title: 'Feedback' };

/** The same list with one thing changed, so every filter is an address staff can share. */
function feedbackHref(filters: AdminFeedbackSearch, change: Partial<AdminFeedbackSearch>): Route {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.kind !== undefined) params.set('kind', next.kind);
  if (next.onlyNew) params.set('onlyNew', 'new');
  if (next.page > 1) params.set('page', String(next.page));
  const query = params.toString();
  return query === '' ? '/admin/feedback' : `/admin/feedback?${query}`;
}

/** D-202: what people have told us, filtered by what sort of thing it is. */
export default function AdminFeedbackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader title="Feedback" subtitle="What people have told us: requests, problems and everything else, newest first." />
      <div className="flex flex-col gap-4 px-4 md:px-8 lg:max-w-4xl">
        <Suspense fallback={<FeedbackSkeleton />}>
          <Feedback searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Feedback({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortal('admin');
  const filters = adminFeedbackSearchSchema.parse(await searchParams);
  const { reports, more, waiting } = await feedbackReports(filters);

  const kinds = [{ value: undefined, label: 'Everything' }, ...feedbackKinds.map((one) => ({ value: one, label: feedbackKindLabels[one] }))];

  return (
    <>
      {/* Plain links, so a filter is an address: no JavaScript, and the back button works. */}
      <nav aria-label="What sort of thing" className="flex flex-wrap gap-2">
        {kinds.map(({ value, label }) => (
          <Button
            key={label}
            asChild
            variant={filters.kind === value ? 'primary' : 'secondary'}
            aria-current={filters.kind === value ? 'page' : undefined}
          >
            <Link href={feedbackHref(filters, { kind: value, page: 1 })}>{label}</Link>
          </Button>
        ))}
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-grey-700">
          {waiting === 0 ? 'Nothing is waiting.' : waiting === 1 ? '1 report is waiting.' : `${String(waiting)} reports are waiting.`}
        </p>
        <Button asChild variant="tertiary">
          <Link href={feedbackHref(filters, { onlyNew: !filters.onlyNew, page: 1 })}>
            {filters.onlyNew ? 'Show everything' : 'Only what is waiting'}
          </Link>
        </Button>
      </div>

      <FeedbackScreen reports={reports} />

      {filters.page > 1 || more ? (
        <nav aria-label="Feedback pages" className="flex flex-wrap gap-2">
          {filters.page > 1 ? (
            <Button asChild variant="secondary">
              <Link href={feedbackHref(filters, { page: filters.page - 1 })}>
                <ChevronLeft className="size-5" aria-hidden />
                Newer
              </Link>
            </Button>
          ) : null}
          {more ? (
            <Button asChild variant="secondary" className="ml-auto">
              <Link href={feedbackHref(filters, { page: filters.page + 1 })}>
                Older
                <ChevronRight className="size-5" aria-hidden />
              </Link>
            </Button>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

/** While it is read: the filters and a few rows, so nothing jumps when they arrive. */
function FeedbackSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-12 w-full" />
      <Card padding="none">
        {Array.from({ length: Math.min(4, feedbackPageSize) }, (_, index) => (
          <SkeletonRow key={index} />
        ))}
      </Card>
    </div>
  );
}
