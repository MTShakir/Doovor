import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireSession } from '@/lib/auth/session';
import { NewPasswordForm } from './new-password-form';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

interface PasswordPageProps {
  /** `?claimed=1`: an account made for them, just claimed, whose sign-up password was not kept (D-331). */
  searchParams: Promise<{ claimed?: string }>;
}

export default function PasswordPage({ searchParams }: PasswordPageProps) {
  return (
    <div className="flex flex-col gap-6 pt-6">
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Gate searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Gate({ searchParams }: PasswordPageProps) {
  await requireSession();
  const claimed = (await searchParams).claimed === '1';
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">{claimed ? 'Choose your password' : 'Choose a new password'}</h1>
        {claimed ? (
          <p className="text-body text-ink">
            Your instructor or school set up your account for you, so it had no password of yours. Choose the one you will sign in with.
          </p>
        ) : null}
      </div>
      <NewPasswordForm />
    </>
  );
}
