import { Button } from '@repo/ui/button';
import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirectTo } from '@/lib/redirect-to';
import { Suspense } from 'react';
import { RoleCards } from '@/components/role-cards';
import { availablePortals, landingPath } from '@/lib/auth/portals';
import { getAccess } from '@/lib/auth/session';
import { SignedInRoleChoice } from './signed-in-role-choice';

export const metadata: Metadata = { title: 'Get started' };

/** AUTH-03: role choice is the first screen. */
export default function StartPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">Get started</h1>
        <p className="text-body text-grey-700">What brings you here?</p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <RoleChoice />
      </Suspense>
      <p className="text-body text-ink">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-semibold text-blue underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}

async function RoleChoice() {
  const result = await getAccess();
  if (result && availablePortals(result.access).length > 0) redirectTo(landingPath(result.access));
  if (result) return <SignedInRoleChoice />;

  // Signed out: carry the choice into sign-up. Works without JavaScript.
  return (
    <form action="/sign-up" method="get" className="flex flex-col gap-6">
      <RoleCards />
      <Button type="submit" width="full" size="lg">
        Continue
      </Button>
    </form>
  );
}
