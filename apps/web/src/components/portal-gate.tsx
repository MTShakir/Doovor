import { LoadingRegion, Skeleton, SkeletonRow } from '@repo/ui/skeleton';
import { Suspense, type ReactNode } from 'react';
import type { Portal } from '@/lib/navigation';
import { requirePortal } from '@/lib/auth/session';
import { ViewAsBanner } from './view-as-banner';

async function Gate({ portal, children }: { portal: Portal; children: ReactNode }) {
  const { session } = await requirePortal(portal);
  if (session.viewingAs === null) return children;
  // Staff viewing as somebody see it on every screen, with the way back (ADM-06, D-129).
  return (
    <>
      <ViewAsBanner name={session.viewingAs.name} endsAt={session.viewingAs.endsAt} />
      {children}
    </>
  );
}

/**
 * Said to a screen reader as loading, by a status region. A label on a plain div is not
 * announced at all, and is an error an accessibility scan catches whenever it lands while this
 * is still on screen.
 */
function PortalSkeleton() {
  return (
    <LoadingRegion>
      <div className="flex flex-col gap-4 px-4 pt-6 md:px-8 md:pt-8">
        <Skeleton className="h-8 w-40" />
        <SkeletonRow className="px-0" />
        <SkeletonRow className="px-0" />
        <SkeletonRow className="px-0" />
      </div>
    </LoadingRegion>
  );
}

/**
 * Portal content streams in behind a skeleton while the session, role and TOTP checks run,
 * so the navigation shell renders instantly (D-029, PRD 7.1).
 */
export function PortalGate({ portal, children }: { portal: Portal; children: ReactNode }) {
  return (
    <Suspense fallback={<PortalSkeleton />}>
      <Gate portal={portal}>{children}</Gate>
    </Suspense>
  );
}
