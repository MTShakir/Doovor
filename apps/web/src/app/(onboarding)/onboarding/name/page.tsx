import type { Metadata } from 'next';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { requireOnboarding } from '@/lib/onboarding/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { stepBySlug } from '@/lib/onboarding/steps';
import { NameForm } from './name-form';
import { StepShell } from '../step-shell';

const step = stepBySlug('name');

export const metadata: Metadata = { title: 'Your name and business' };

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
  // Somebody running their own business is asked what it is called; at a school it is not theirs.
  const businessName = session.businessType === 'independent' ? await ownBusinessName(session.businessId) : undefined;
  return (
    <StepShell step={step} businessType={session.businessType}>
      <NameForm
        profileId={session.profileId}
        initialName={session.displayName}
        initialPhotoPath={session.photoPath}
        initialBusinessName={businessName}
      />
    </StepShell>
  );
}

/** What the Business is called today, which is the person's own name until they change it. */
async function ownBusinessName(businessId: string): Promise<string> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from('businesses').select('name').eq('id', businessId).maybeSingle();
  return data?.name ?? '';
}
