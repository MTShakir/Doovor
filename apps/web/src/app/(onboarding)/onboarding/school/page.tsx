import type { Metadata } from 'next';
import { SkeletonRow } from '@repo/ui/skeleton';
import { Suspense } from 'react';
import { requireSchoolSetup } from '@/lib/onboarding/school-session';
import { SchoolDetailsForm } from './school-details-form';
import { SchoolStep } from './school-step';

export const metadata: Metadata = { title: 'Set up your school' };

/** AUTH-05, PRD 10.5 step 1: the school's name, logo, main postcode and size. */
export default function SchoolDetailsPage() {
  return (
    <Suspense fallback={<SkeletonRow />}>
      <SchoolDetails />
    </Suspense>
  );
}

async function SchoolDetails() {
  const session = await requireSchoolSetup('/onboarding/school');
  return (
    <SchoolStep current={1} title="Tell us about your school">
      <SchoolDetailsForm
        businessId={session.businessId}
        initialName={session.name}
        initialLogoPath={session.logoPath}
        initialPostcode={session.basePostcode}
        initialExpectedInstructors={session.expectedInstructors}
      />
    </SchoolStep>
  );
}
