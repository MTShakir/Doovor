import type { Metadata } from 'next';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { requireOnboarding } from '@/lib/onboarding/session';
import { canOpenStep, slugForStep, stepBySlug } from '@/lib/onboarding/steps';
import { redirectTo } from '@/lib/redirect-to';
import { signedBadgeUrl } from '@/lib/storage/images';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StepSkip } from '../step-actions';
import { StepShell } from '../step-shell';
import { BadgeForm } from './badge-form';

const step = stepBySlug('badge');

export const metadata: Metadata = { title: step?.title ?? 'Your badge' };

export default function BadgeStepPage() {
  return (
    <Suspense fallback={<SkeletonRow />}>
      <BadgeStep />
    </Suspense>
  );
}

async function BadgeStep() {
  const session = await requireOnboarding();
  if (!step) throw new Error('Unknown onboarding step');
  if (!canOpenStep(step.step, session.step)) redirectTo(`/onboarding/${slugForStep(session.step)}`);

  // The badge bucket is private, so an existing photo is shown through a short-lived address.
  const supabase = await createSupabaseServerClient();
  const badgePreview = await signedBadgeUrl(supabase, session.badgePath);

  return (
    <StepShell step={step} businessType={session.businessType}>
      <BadgeForm
        profileId={session.profileId}
        qualification={session.qualification}
        badgeNumber={session.badgeNumber}
        badgeExpiry={session.badgeExpiry}
        badgePreview={badgePreview}
        hasBadgePhoto={session.badgePath !== null}
      />
      <StepSkip />
    </StepShell>
  );
}
