import { readTags } from '@repo/core/visits';
import { Button } from '@repo/ui/button';
import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirectTo } from '@/lib/redirect-to';
import { Suspense } from 'react';
import { RoleCards } from '@/components/role-cards';
import { readInvitation } from '@/lib/auth/invitation-cookie';
import { availablePortals, landingPath } from '@/lib/auth/portals';
import { getAccess } from '@/lib/auth/session';
import { SignedInRoleChoice } from './signed-in-role-choice';

export const metadata: Metadata = { title: 'Get started' };

type StartParams = Promise<{ utm_source?: string; utm_medium?: string; utm_campaign?: string }>;

/** AUTH-03: role choice is the first screen. */
export default function StartPage({ searchParams }: { searchParams: StartParams }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">Get started</h1>
        <p className="text-body text-grey-700">What brings you here?</p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <RoleChoice searchParams={searchParams} />
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

async function RoleChoice({ searchParams }: { searchParams: StartParams }) {
  const result = await getAccess();
  if (
    result &&
    (availablePortals(result.access).length > 0 ||
      result.access.suspendedBusinesses.length > 0 ||
      result.access.pausedBusinesses.length > 0 ||
      result.access.switchedOffBy.length > 0)
  ) {
    redirectTo(landingPath(result.access));
  }
  // Somebody invited came from whoever invited them, so they are not asked how they heard (D-413).
  if (result) return <SignedInRoleChoice askHowHeard={(await readInvitation()) === null} />;

  // Signed out: carry the choice into sign-up, with the tags of the link they came on (D-413).
  // Works without JavaScript.
  const params = await searchParams;
  const tags = readTags(
    new URLSearchParams({ utm_source: params.utm_source ?? '', utm_medium: params.utm_medium ?? '', utm_campaign: params.utm_campaign ?? '' }).toString(),
  );
  return (
    <form action="/sign-up" method="get" className="flex flex-col gap-6">
      {tags.source === null ? null : <input type="hidden" name="utm_source" value={tags.source} />}
      {tags.medium === null ? null : <input type="hidden" name="utm_medium" value={tags.medium} />}
      {tags.campaign === null ? null : <input type="hidden" name="utm_campaign" value={tags.campaign} />}
      <RoleCards />
      <Button type="submit" width="full" size="lg">
        Continue
      </Button>
    </form>
  );
}
