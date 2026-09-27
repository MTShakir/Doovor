import { Skeleton } from '@repo/ui/skeleton';
import { ChevronLeft } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { requireAccess } from '@/lib/auth/session';
import { businessNameLabel, ownBusiness } from '@/lib/auth/own-business';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AccountNameForm } from './name-form';

export const metadata: Metadata = { title: 'Your name', robots: { index: false } };

export default function AccountNamePage() {
  return (
    <div className="flex flex-col gap-6 pt-6">
      <Link
        href="/account"
        className="-ml-3 flex h-12 w-fit items-center gap-1 rounded-full px-3 text-body font-medium text-ink hover:bg-grey-100"
      >
        <ChevronLeft size={20} strokeWidth={1.5} aria-hidden />
        Account and security
      </Link>
      <h1 className="text-h1 text-black">Your name</h1>
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Form />
      </Suspense>
    </div>
  );
}

/** AUTH-09, D-217: who the account belongs to, and what their own Business is called. */
async function Form() {
  const { session, access } = await requireAccess();
  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase.from('users').select('full_name').eq('id', session.userId).single();
  const mine = ownBusiness(access);
  return (
    <AccountNameForm
      name={profile?.full_name ?? ''}
      // Absent for an instructor at a school, and for a learner: neither owns a name to change.
      businessName={mine?.businessName}
      businessLabel={mine === null ? undefined : businessNameLabel(mine)}
      teaches={access.memberships.some((one) => one.instructorProfileId !== null)}
    />
  );
}
