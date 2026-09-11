import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireSession } from '@/lib/auth/session';
import { NewPasswordForm } from './new-password-form';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

export default function PasswordPage() {
  return (
    <div className="flex flex-col gap-6 pt-6">
      <h1 className="text-h1 text-black">Choose a new password</h1>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Gate />
      </Suspense>
    </div>
  );
}

async function Gate() {
  await requireSession();
  return <NewPasswordForm />;
}
