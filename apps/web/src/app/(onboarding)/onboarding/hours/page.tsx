import type { Metadata } from 'next';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { requireOnboarding } from '@/lib/onboarding/session';
import { canOpenStep, slugForStep, stepBySlug } from '@/lib/onboarding/steps';
import { redirectTo } from '@/lib/redirect-to';
import { StepActions } from '../step-actions';
import { StepShell } from '../step-shell';

const step = stepBySlug('hours');

export const metadata: Metadata = { title: step?.title ?? 'Set up your profile' };

export default function StepPage() {
  return (
    <Suspense fallback={<SkeletonRow />}>
      <Step />
    </Suspense>
  );
}

async function Step() {
  const session = await requireOnboarding();
  if (!step) throw new Error('Unknown onboarding step');
  if (!canOpenStep(step.step, session.step)) redirectTo(`/onboarding/${slugForStep(session.step)}`);
  return (
    <StepShell step={step}>
      <p className="text-body text-grey-700">This question arrives shortly. Set these later from your diary.</p>
      <StepActions />
    </StepShell>
  );
}
