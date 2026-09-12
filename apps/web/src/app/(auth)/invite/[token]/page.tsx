import type { Metadata } from 'next';
import { Button } from '@repo/ui/button';
import { Skeleton } from '@repo/ui/skeleton';
import Link from 'next/link';
import { Suspense } from 'react';
import { FormAlert } from '@/components/form-alert';
import { getAccess } from '@/lib/auth/session';
import { redirectTo } from '@/lib/redirect-to';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AcceptButton } from './accept-button';

export const metadata: Metadata = { title: 'Your invitation' };

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Invitation params={params} />
    </Suspense>
  );
}

/** AUTH-07: what an invitation link opens, signed in or not. */
async function Invitation({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc('invitation_details', { p_token: token }).maybeSingle();

  if (!data) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-black">This link does not work</h1>
        <p className="text-body text-grey-700">
          Ask your instructor to send you a new one. Links stop working once they have been used.
        </p>
        <Button asChild width="responsive">
          <Link href="/">Go to the home page</Link>
        </Button>
      </div>
    );
  }

  const who = data.instructor_name;

  if (data.expired) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-black">This link has expired</h1>
        <p className="text-body text-grey-700">Ask {who} to send you a new one. They take a few seconds to make.</p>
      </div>
    );
  }

  const access = await getAccess();
  if (access?.access.isLearner) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h1 text-black">{who} would like to teach you</h1>
        <p className="text-body text-grey-700">Accept and you will be able to book lessons with them.</p>
        <AcceptButton token={token} name={who} />
      </div>
    );
  }
  if (access) {
    // Signed in as somebody who is not a learner: an invitation is not theirs to accept.
    redirectTo('/');
  }

  // Signed out. The proxy has kept the token for after the account exists, so this only has
  // to pre-fill what the invitation already knows.
  const query = new URLSearchParams({ role: 'learner' });
  if (data.full_name) query.set('name', data.full_name);
  if (data.email) query.set('email', data.email);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h1 text-black">{who} would like to teach you</h1>
      <p className="text-body text-grey-700">
        Create your account and you will land linked to {who}, ready to book your first lesson.
      </p>
      {query.has('name') || query.has('email') ? (
        <FormAlert tone="success">Your details are already filled in. It takes a minute.</FormAlert>
      ) : null}
      <Button asChild width="responsive" size="lg">
        <Link href={`/sign-up?${query.toString()}`}>Create my account</Link>
      </Button>
      <p className="text-body text-ink">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-semibold text-blue underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
