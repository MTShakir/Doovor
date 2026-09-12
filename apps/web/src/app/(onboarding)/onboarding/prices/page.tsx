import type { Metadata } from 'next';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { requireOnboarding } from '@/lib/onboarding/session';
import { canOpenStep, slugForStep, stepBySlug } from '@/lib/onboarding/steps';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { StepSkip } from '../step-actions';
import { StepShell } from '../step-shell';
import { PricesForm } from './prices-form';

const step = stepBySlug('prices');

export const metadata: Metadata = { title: step?.title ?? 'Your prices' };

export default function PricesStepPage() {
  return (
    <Suspense fallback={<SkeletonRow />}>
      <PricesStep />
    </Suspense>
  );
}

async function PricesStep() {
  const session = await requireOnboarding();
  if (!step) throw new Error('Unknown onboarding step');
  if (!canOpenStep(step.step, session.step)) redirectTo(`/onboarding/${slugForStep(session.step)}`);

  const supabase = await createSupabaseServerClient();
  const [{ data: hourly }, { data: block }] = await Promise.all([
    supabase
      .from('lesson_prices')
      .select('price_pence')
      .eq('business_id', session.businessId)
      .eq('duration_minutes', 60)
      .is('instructor_id', null)
      .maybeSingle(),
    supabase
      .from('packages')
      .select('price_pence')
      .eq('business_id', session.businessId)
      .eq('minutes', 600)
      .maybeSingle(),
  ]);

  return (
    <StepShell step={step}>
      <PricesForm hourlyPrice={hourly?.price_pence ?? null} packagePrice={block?.price_pence ?? null} />
      <StepSkip />
    </StepShell>
  );
}
