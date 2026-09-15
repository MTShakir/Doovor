import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { ForgetKeptScreens } from '@/components/pwa/forget-kept-screens';
import { SignInForm } from './sign-in-form';

export const metadata: Metadata = { title: 'Sign in' };

export default function SignInPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Signed out, or about to sign in: whatever a last person kept for no signal goes. */}
      <ForgetKeptScreens />
      <h1 className="text-h1 text-black">Sign in</h1>
      <Suspense fallback={<Skeleton className="h-80 w-full" />}>
        <SignInForm />
      </Suspense>
      <p className="text-body text-ink">
        New here?{' '}
        <Link href="/start" className="font-semibold text-blue underline underline-offset-4">
          Create an account
        </Link>
      </p>
    </div>
  );
}
