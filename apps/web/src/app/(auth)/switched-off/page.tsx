import { Button } from '@repo/ui/button';
import { Skeleton } from '@repo/ui/skeleton';
import { UserX } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { availablePortals, landingPath } from '@/lib/auth/portals';
import { requireAccess } from '@/lib/auth/session';
import { redirectTo } from '@/lib/redirect-to';
import { signOut } from '../actions';
import { StartOwnBusiness } from './start-own-business';

export const metadata: Metadata = { title: 'Switched off' };

/**
 * SCH-02, D-332: somebody a school switched off, told so when they sign in, rather than shown the
 * start of a new account or made a Business they never asked for.
 */
export default function SwitchedOffPage() {
  return (
    <div className="flex flex-col gap-6">
      <span className="flex size-16 items-center justify-center rounded-full bg-white text-black">
        <UserX size={32} strokeWidth={1.5} aria-hidden />
      </span>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <SwitchedOff />
      </Suspense>
      <form action={signOut.bind(null, 'local')}>
        <Button type="submit" variant="secondary" width="full" size="lg">
          Sign out
        </Button>
      </form>
    </div>
  );
}

async function SwitchedOff() {
  const { access } = await requireAccess();
  // Switched back on, or a portal to use after all: go there instead.
  if (access.switchedOffBy.length === 0 || availablePortals(access).length > 0) redirectTo(landingPath(access));
  const schools = access.switchedOffBy.join(' and ');
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">{schools} switched you off</h1>
        <p className="text-body text-ink">
          While you are switched off, you cannot open {`${schools}'s`} diary or learners. If they switch you back on, you can sign in and
          carry on as before.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <h2 className="text-h3 text-black">Teaching for yourself?</h2>
        <p className="text-body text-ink">Set up a business of your own, with your own learners, prices and payments.</p>
        <StartOwnBusiness />
      </div>
    </div>
  );
}
