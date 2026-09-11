import { Skeleton } from '@repo/ui/skeleton';
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { requireSession } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MfaForm } from './mfa-form';

export const metadata: Metadata = { title: 'Two-step verification' };

/** AUTH-08: TOTP enrolment and challenge. Required for staff and school owners. */
export default function MfaPage() {
  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Gate />
      </Suspense>
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
