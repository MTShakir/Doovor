import type { Metadata } from 'next';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { requireOnboarding } from '@/lib/onboarding/session';
import { stepBySlug } from '@/lib/onboarding/steps';
import { NameForm } from './name-form';
import { StepShell } from '../step-shell';

const step = stepBySlug('name');

export const metadata: Metadata = { title: 'Your name and photo' };

export default function NameStepPage() {
  return (
    <Suspense fallback={<SkeletonRow />}>
      <NameStep />
    </Suspense>
  );
}

async function NameStep() {
  const session = await requireOnboarding();
  if (!step) throw new Error('Unknown onboarding step');
  return (
    <StepShell step={step} businessType={session.businessType}>
      <NameForm profileId={session.profileId} initialName={session.displayName} initialPhotoPath={session.photoPath} />
    </StepShell>
  );
}
