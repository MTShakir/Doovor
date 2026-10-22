import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireSecondStepScreen } from '@/lib/auth/session';
import { VerifyPhoneForm } from './verify-phone-form';

export const metadata: Metadata = { title: 'Verify your mobile' };

/** AUTH-02: instructors verify their mobile with a text message code. */
export default function VerifyPhonePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">Verify your mobile</h1>
        <Suspense fallback={<Skeleton className="h-6 w-full" />}>
          <WhoUsesIt />
        </Suspense>
      </div>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <Gate />
      </Suspense>
    </div>
  );
}

/** Who reaches them on it, said to whoever is reading: a learner is reached by their instructor (D-352). */
async function WhoUsesIt() {
  const { access } = await requireSecondStepScreen();
  const teaches = access.memberships.length > 0;
  return (
    <p className="text-body text-grey-700">
      {teaches ? 'Learners and schools use it to reach you about lessons.' : 'Your instructor uses it to reach you about lessons.'} We
      will text you a 6-digit code.
    </p>
  );
}

async function Gate() {
  // An instructor verifies their mobile on the way in, before any second step they set up (AUTH-02).
  await requireSecondStepScreen();
  return <VerifyPhoneForm />;
}
