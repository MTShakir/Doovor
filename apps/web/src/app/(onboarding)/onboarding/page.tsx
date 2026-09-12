import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SkeletonRow } from '@repo/ui/skeleton';
import { requireOnboarding } from '@/lib/onboarding/session';
import { slugForStep } from '@/lib/onboarding/steps';
import { redirectTo } from '@/lib/redirect-to';

export const metadata: Metadata = { title: 'Set up your profile' };

/** Resume where they left off (AUTH-04). */
export default function OnboardingPage() {
  return (
    <Suspense fallback={<SkeletonRow />}>
      <Resume />
    </Suspense>
  );
}

async function Resume() {
  const session = await requireOnboarding();
  redirectTo(`/onboarding/${slugForStep(session.step)}`);
  return null;
}
