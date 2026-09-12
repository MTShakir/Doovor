import type { Metadata } from 'next';
import { defaultWorkingDays, defaultWorkingHours } from '@repo/core/schemas/onboarding';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { requireOnboarding } from '@/lib/onboarding/session';
import { canOpenStep, slugForStep, stepBySlug } from '@/lib/onboarding/steps';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StepSkip } from '../step-actions';
import { StepShell } from '../step-shell';
import { HoursForm } from './hours-form';

const step = stepBySlug('hours');

export const metadata: Metadata = { title: step?.title ?? 'Your hours' };

export default function HoursStepPage() {
  return (
    <Suspense fallback={<SkeletonRow />}>
      <HoursStep />
    </Suspense>
  );
}

async function HoursStep() {
  const session = await requireOnboarding();
  if (!step) throw new Error('Unknown onboarding step');
  if (!canOpenStep(step.step, session.step)) redirectTo(`/onboarding/${slugForStep(session.step)}`);

  const supabase = await createSupabaseServerClient();
  const { data: hours } = await supabase
    .from('working_hours')
    .select('weekday, start_time, end_time')
    .eq('instructor_id', session.profileId)
    .order('weekday');

  // Times come back as 09:00:00; the field wants 09:00.
  const first = hours?.[0];
  const days = hours?.length ? hours.map((row) => row.weekday) : defaultWorkingDays;
  const startTime = first ? first.start_time.slice(0, 5) : defaultWorkingHours.startTime;
  const endTime = first ? first.end_time.slice(0, 5) : defaultWorkingHours.endTime;

  return (
    <StepShell step={step}>
      <HoursForm days={days} startTime={startTime} endTime={endTime} />
      <StepSkip />
    </StepShell>
  );
}
