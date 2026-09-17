import { brand } from '@repo/config/brand';
import { Button } from '@repo/ui/button';
import { Skeleton } from '@repo/ui/skeleton';
import { Ban } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { availablePortals, landingPath } from '@/lib/auth/portals';
import { requireAccess } from '@/lib/auth/session';
import { redirectTo } from '@/lib/redirect-to';
import { signOut } from '../actions';

export const metadata: Metadata = { title: 'Suspended' };

/** ADM-02: somebody whose Business platform staff have suspended, told so plainly. */
export default function SuspendedPage() {
  return (
    <div className="flex flex-col gap-6">
      <span className="flex size-16 items-center justify-center rounded-full bg-grey-100 text-black">
        <Ban size={32} strokeWidth={1.5} aria-hidden />
      </span>
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <Explanation />
      </Suspense>
      <form action={signOut.bind(null, 'local')}>
        <Button type="submit" variant="secondary" width="full" size="lg">
          Sign out
        </Button>
      </form>
    </div>
  );
}

async function Explanation() {
  const { access } = await requireAccess();
  // Nothing is suspended, or there is a portal to use after all: go there instead.
  if (access.suspendedBusinesses.length === 0 || availablePortals(access).length > 0) redirectTo(landingPath(access));
  const one = access.suspendedBusinesses.length === 1;
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-h1 text-black">
        {access.suspendedBusinesses.join(' and ')} {one ? 'is' : 'are'} suspended
      </h1>
      <p className="text-body text-ink">
        While {one ? 'it is' : 'they are'}, nobody can book or pay for lessons with {one ? 'it' : 'them'}, and {one ? 'its portal is' : 'their portals are'} closed.
      </p>
      <p className="text-body text-ink">
        To talk to us about it, email{' '}
        <a href={`mailto:${brand.supportEmail}`} className="font-semibold text-blue underline underline-offset-4">
          {brand.supportEmail}
        </a>
        .
      </p>
    </div>
  );
}
