import type { Metadata } from 'next';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { getGeoProvider } from '@/lib/geo/provider';
import { requireOnboarding } from '@/lib/onboarding/session';
import { canOpenStep, slugForStep, stepBySlug } from '@/lib/onboarding/steps';
import { redirectTo } from '@/lib/redirect-to';
import { StepSkip } from '../step-actions';
import { StepShell } from '../step-shell';
import { AreaForm } from './area-form';

const step = stepBySlug('area');

export const metadata: Metadata = { title: step?.title ?? 'Your area' };

export default function AreaStepPage() {
  return (
    <Suspense fallback={<SkeletonRow />}>
      <AreaStep />
    </Suspense>
  );
}

async function AreaStep() {
  const session = await requireOnboarding();
  if (!step) throw new Error('Unknown onboarding step');
  if (!canOpenStep(step.step, session.step)) redirectTo(`/onboarding/${slugForStep(session.step)}`);

  // A postcode saved earlier is in the cache, so the circle is drawn on the first paint.
  const geo = await getGeoProvider();
  const found = session.basePostcode ? await geo.lookup(session.basePostcode) : null;
  const centre = found?.ok ? { latitude: found.place.latitude, longitude: found.place.longitude } : null;

  return (
    <StepShell step={step}>
      <AreaForm postcode={session.basePostcode} radiusMiles={session.radiusMiles} centre={centre} />
      <StepSkip />
    </StepShell>
  );
}
