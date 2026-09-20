import { Button } from '@repo/ui/button';
import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireSession } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { signOut } from '../actions';
import { MfaForm } from './mfa-form';

export const metadata: Metadata = { title: 'Two-step verification' };

/** AUTH-08: TOTP enrolment and challenge. Required for staff and school owners. */
export default function MfaPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Gate />
      </Suspense>
      {/*
        The way out (AUTH-08, D-186). Signing in has already left a session behind, so without
        this the screen comes back after every restart and there is no way to reach sign in from
        it. Outside the boundary above, because somebody stuck here should not wait for it.
      */}
      <form action={signOut.bind(null, 'local')} className="flex flex-col gap-2 border-t border-grey-200 pt-6">
        <Button type="submit" variant="tertiary" width="full" size="lg">
          Start again
        </Button>
        <p className="text-small text-grey-700">
          Signed in as somebody else, or cannot reach your authenticator app? This signs you out and takes you back to sign in.
        </p>
      </form>
    </div>
  );
}

async function Gate() {
  await requireSession();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.mfa.listFactors();
  // listFactors().totp only ever contains verified factors.
  return <MfaForm verifiedFactorId={data?.totp[0]?.id ?? null} />;
}
