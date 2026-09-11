'use client';

import { otpCodeSchema } from '@repo/core/schemas/auth';
import { Field } from '@repo/ui/field';
import { OtpInput } from '@repo/ui/otp-input';
import { Skeleton } from '@repo/ui/skeleton';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { safeNextPath } from '@/lib/auth/portals';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';

interface Enrolment {
  factorId: string;
  qrCode: string;
  secret: string;
}

let enrolling: Promise<Enrolment | null> | null = null;

/**
 * One enrolment at a time. Strict Mode runs effects twice in development, and two parallel
 * enrolments clash on the factor name, so both runs share the request already in flight.
 */
function enrolAuthenticator(): Promise<Enrolment | null> {
  enrolling ??= (async () => {
    const supabase = getSupabaseBrowserClient();
    // Clear abandoned enrolments so a retry never fails on a duplicate.
    const { data: factors } = await supabase.auth.mfa.listFactors();
    for (const factor of factors?.all ?? []) {
      if (factor.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app' });
    return error ? null : { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
  })()
    .catch(() => null)
    .finally(() => {
      enrolling = null;
    });
  return enrolling;
}

export function MfaForm({ verifiedFactorId }: { verifiedFactorId: string | null }) {
  const next = safeNextPath(useSearchParams().get('next'), '/');
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Start enrolment for people without a verified authenticator.
  useEffect(() => {
    if (verifiedFactorId) return;
    const effect = { cancelled: false };
    void enrolAuthenticator().then((started) => {
      if (effect.cancelled) return;
      if (started) setEnrolment(started);
      else setError('We could not start set-up. Refresh the page to try again.');
    });
    return () => {
      effect.cancelled = true;
    };
  }, [verifiedFactorId]);

  const factorId = verifiedFactorId ?? enrolment?.factorId ?? null;

  const verify = (value: string) => {
    setError(null);
    if (!factorId || !otpCodeSchema.safeParse(value).success) {
      setError('Enter the 6-digit code from your app');
      return;
    }
    startTransition(async () => {
      const { error: verifyError } = await getSupabaseBrowserClient().auth.mfa.challengeAndVerify({ factorId, code: value });
      if (verifyError) {
        setError('That code did not work. Check your app and try again.');
        setCode('');
        return;
      }
      // Full navigation: the session changed, so drop router-cache entries rendered at aal1.
      window.location.replace(next);
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-h1 text-black">{verifiedFactorId ? 'Enter your code' : 'Set up two-step verification'}</h1>
        <p className="text-body text-grey-700">
          {verifiedFactorId
            ? 'Open your authenticator app and enter the 6-digit code.'
            : 'Your role needs a second step when you sign in. Scan the code with an authenticator app such as Google Authenticator or 1Password.'}
        </p>
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      {!verifiedFactorId ? (
        enrolment ? (
          <div className="flex flex-col items-start gap-3">
            {/* Supabase returns the QR code as a data URL SVG; next/image adds nothing here. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrolment.qrCode} alt="QR code for your authenticator app" width={192} height={192} className="rounded-card border border-grey-200 p-2" />
            <p className="text-small text-grey-700">Cannot scan it? Enter this key in the app instead.</p>
            {/* Groups of four are easier to copy by hand; authenticator apps ignore the spaces. */}
            <p className="rounded-input bg-grey-100 px-4 py-3 font-mono text-body tracking-wide text-ink">
              {enrolment.secret.match(/.{1,4}/g)?.join(' ')}
            </p>
          </div>
        ) : (
          <Skeleton className="size-48" />
        )
      ) : null}
      <ClientForm
        pending={pending}
        className="flex flex-col gap-6"
        onSubmit={(event) => {
          event.preventDefault();
          verify(code);
        }}
      >
        <Field label="Code">
          <OtpInput value={code} onChange={setCode} onComplete={verify} />
        </Field>
        <SubmitButton width="full" size="lg" pending={pending}>
          {verifiedFactorId ? 'Continue' : 'Turn on two-step verification'}
        </SubmitButton>
      </ClientForm>
    </div>
  );
}
