import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireSession } from '@/lib/auth/session';
import { VerifyPhoneForm } from './verify-phone-form';

export const metadata: Metadata = { title: 'Verify your mobile' };

/** AUTH-02: instructors verify their mobile with a text message code. */
export default function VerifyPhonePage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">Verify your mobile</h1>
        <p className="text-body text-grey-700">Learners and schools use it to reach you about lessons. We will text you a 6-digit code.</p>
      </div>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <Gate />
      </Suspense>
    </div>
  );
}

async function Gate() {
  await requireSession();
  return <VerifyPhoneForm />;
}
