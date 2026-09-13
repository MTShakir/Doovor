import type { IntendedRole } from '@repo/core/schemas/auth';
import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { SignUpForm } from './sign-up-form';

export const metadata: Metadata = { title: 'Create an account' };

function roleFromParam(value: string | undefined): IntendedRole | null {
  return value === 'learner' || value === 'instructor' || value === 'school' ? value : null;
}

type SignUpParams = Promise<{ role?: string; name?: string; email?: string }>;

/** Query values come from whoever made the link, so they are trimmed and capped. */
function clean(value: string | undefined): string {
  return (value ?? '').trim().slice(0, 120);
}

export default function SignUpPage({ searchParams }: { searchParams: SignUpParams }) {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<Skeleton className="h-[28rem] w-full" />}>
        <RoleForm searchParams={searchParams} />
      </Suspense>
      <p className="text-body text-ink">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-semibold text-blue underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}

/** The role comes from the first screen (AUTH-03). Without one, start there. */
async function RoleForm({ searchParams }: { searchParams: SignUpParams }) {
  const params = await searchParams;
  const role = roleFromParam(params.role);
  if (!role) redirect('/start');
  // An invitation already knows the learner's name and email, so they do not retype them
  // on a phone (AUTH-07).
  const prefill = { fullName: clean(params.name), email: clean(params.email) };
  return <SignUpForm key={role} role={role} prefill={prefill} />;
}
