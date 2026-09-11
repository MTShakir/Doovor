import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Loading placeholder (PRD 7.1: skeleton loaders, no blank screens). */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  // grey-200: grey-100 is too faint on white to read as "loading". Decorative, so no contrast rule.
  return <div aria-hidden className={cn('animate-pulse rounded-input bg-grey-200', className)} {...props} />;
}

/** A list row shaped skeleton, for lists of lessons or learners. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div className={cn('flex min-h-14 items-center gap-3 px-4 py-2', className)} aria-hidden>
      <Skeleton className="size-10 rounded-full" />
      <div className="flex flex-1 flex-col gap-2">
        <Skeleton className="h-4 w-2/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    </div>
  );
}

/** Announces loading to screen readers while skeletons are shown. */
export function LoadingRegion({ label = 'Loading', children }: { label?: string; children: React.ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
