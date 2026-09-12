import type { Metadata } from 'next';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { getAccess } from '@/lib/auth/session';
import { landingPath } from '@/lib/auth/portals';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AboutYouForm } from './about-you-form';

export const metadata: Metadata = { title: 'About you' };

export default function AboutYouPage() {
  return (
    <Suspense fallback={<SkeletonRow />}>
      <AboutYou />
    </Suspense>
  );
}

/** AUTH-06: asked once, before a learner reaches their own portal. */
async function AboutYou() {
  const result = await getAccess();
  if (!result) redirectTo('/sign-in?next=%2Fonboarding%2Fabout-you');
  if (!result.access.isLearner || result.access.learnerOnboarded) redirectTo(landingPath(result.access));

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
      <AboutYouForm initialName={user?.full_name ?? ''} />
    </div>
  );
}
