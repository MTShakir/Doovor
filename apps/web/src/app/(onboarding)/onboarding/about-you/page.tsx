import type { Metadata } from 'next';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { getAccess, requireAgreedTerms } from '@/lib/auth/session';
import { landingPath, safeNextPath } from '@/lib/auth/portals';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AboutYouForm } from './about-you-form';

export const metadata: Metadata = { title: 'About you' };

interface AboutYouProps {
  /** Where they were going when they were asked, to go on to once it is done (D-337). */
  searchParams: Promise<{ next?: string }>;
}

export default function AboutYouPage({ searchParams }: AboutYouProps) {
  return (
    <Suspense fallback={<SkeletonRow />}>
      <AboutYou searchParams={searchParams} />
    </Suspense>
  );
}

/** AUTH-06: asked once, before a learner reaches their own portal. */
async function AboutYou({ searchParams }: AboutYouProps) {
  const next = safeNextPath((await searchParams).next, '/app/learner');
  const here = `/onboarding/about-you?next=${encodeURIComponent(next)}`;
  const result = await getAccess();
  if (!result) redirectTo(`/sign-in?next=${encodeURIComponent(here)}`);
  await requireAgreedTerms(result, here);
  if (!result.access.isLearner) redirectTo(landingPath(result.access));
  if (result.access.learnerOnboarded) redirectTo(next);

  const supabase = await createSupabaseServerClient();
  const { data: user } = await supabase.from('users').select('full_name').eq('id', result.access.userId).maybeSingle();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">A few things about you</h1>
        <p className="text-body text-grey-700">
          This is the only form. It takes a minute, and your instructor sees only what they need.
        </p>
      </div>
      <AboutYouForm initialName={user?.full_name ?? ''} next={next} />
    </div>
  );
}
