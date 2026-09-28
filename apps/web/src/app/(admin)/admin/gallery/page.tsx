import { PageHeader } from '@repo/ui/app-shell';
import { Button } from '@repo/ui/button';
import { Skeleton } from '@repo/ui/skeleton';
import { z } from '@repo/core/zod';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Metadata, Route } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { adminGallery } from '@/lib/admin/gallery';
import { requirePortal } from '@/lib/auth/session';
import { GalleryScreen } from './gallery-screen';

export const metadata: Metadata = { title: 'Galleries' };

const searchSchema = z.object({
  business: z.uuid().optional(),
  onlyUnchecked: z
    .union([z.literal('unchecked').transform(() => true), z.undefined().transform(() => false)])
    .catch(false),
  page: z.coerce.number().int().min(1).catch(1),
});

type GallerySearch = z.output<typeof searchSchema>;

/** The same list with one thing changed, so every filter is an address staff can share. */
function galleryHref(filters: GallerySearch, change: Partial<GallerySearch>): Route {
  const next = { ...filters, ...change };
  const params = new URLSearchParams();
  if (next.business !== undefined) params.set('business', next.business);
  if (next.onlyUnchecked) params.set('onlyUnchecked', 'unchecked');
  if (next.page > 1) params.set('page', String(next.page));
  const query = params.toString();
  return query === '' ? '/admin/gallery' : `/admin/gallery?${query}`;
}

/** D-218: the pass photos every Business is showing, and the tick on the ones we have checked. */
export default function AdminGalleryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="flex flex-col gap-4 pb-8">
      <PageHeader
        title="Galleries"
        subtitle="Pass photos on public profiles, newest first. Tick the ones you have checked; take down anything that should not be there."
      />
      <div className="flex flex-col gap-4 px-4 md:px-8 lg:max-w-5xl">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <Photos searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function Photos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requirePortal('admin');
  const filters = searchSchema.parse(await searchParams);
  const { photos, more, unchecked } = await adminGallery({
    businessId: filters.business,
    onlyUnchecked: filters.onlyUnchecked,
    page: filters.page,
  });

  return (
    <>
      {/* Plain links, so a filter is an address: no JavaScript, and the back button works. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-grey-700">
          {unchecked === 0
            ? 'Everything has been looked at.'
            : unchecked === 1
              ? '1 photo has not been looked at.'
              : `${String(unchecked)} photos have not been looked at.`}
        </p>
        <Button asChild variant="tertiary">
          <Link href={galleryHref(filters, { onlyUnchecked: !filters.onlyUnchecked, page: 1 })}>
            {filters.onlyUnchecked ? 'Show everything' : 'Only what is unchecked'}
          </Link>
        </Button>
      </div>

      {filters.business === undefined ? null : (
        <p className="text-small text-grey-700">
          One Business only.{' '}
          <Link href={galleryHref(filters, { business: undefined, page: 1 })} className="font-semibold text-black underline underline-offset-4">
            Show every Business
          </Link>
        </p>
      )}

      <GalleryScreen photos={photos} />

      {filters.page > 1 || more ? (
        <nav aria-label="Gallery pages" className="flex flex-wrap gap-2">
          {filters.page > 1 ? (
            <Button asChild variant="secondary">
              <Link href={galleryHref(filters, { page: filters.page - 1 })}>
                <ChevronLeft className="size-5" aria-hidden />
                Newer
              </Link>
            </Button>
          ) : null}
          {more ? (
            <Button asChild variant="secondary" className="ml-auto">
              <Link href={galleryHref(filters, { page: filters.page + 1 })}>
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
