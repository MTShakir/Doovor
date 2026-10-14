import { Skeleton } from '@repo/ui/skeleton';
import { ChevronLeft } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';

/**
 * The top of a whole pass gallery (PUB-06, D-268): the way back to the profile it opened from,
 * named after it as every back link is, and whose passes these are.
 */
export function GalleryHeader({
  name,
  profileHref,
  shown,
  total,
}: {
  name: string;
  profileHref: string;
  /** How many the page shows, which is all of them unless the wall is longer than a page. */
  shown: number;
  total: number;
}) {
  const count = total === 1 ? '1 photo' : `${String(total)} photos`;
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={profileHref as Route}
        className="inline-flex min-h-12 items-center gap-1 self-start text-body font-semibold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      >
        <ChevronLeft className="size-5 shrink-0" aria-hidden />
        {name}
      </Link>
      <div className="flex flex-col gap-1">
        <h1 className="text-h1 text-balance text-black">Learners who passed with {name}</h1>
        <p className="text-body text-grey-700">
          {shown < total ? `The newest ${String(shown)} of ${count}` : count} from the day, newest first, shared with their
          permission.
        </p>
      </div>
    </div>
  );
}

/**
 * At least a screen tall, as the profile's is: a short one leaves the footer in view, to be pushed
 * away when the photos land (D-132).
 */
export function GallerySkeleton() {
  return (
    <div className="flex min-h-dvh flex-col gap-6" aria-hidden>
      <Skeleton className="h-6 w-32" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="aspect-[3/4] w-full" />
        <Skeleton className="aspect-[3/4] w-full" />
        <Skeleton className="aspect-[3/4] w-full" />
      </div>
    </div>
  );
}
