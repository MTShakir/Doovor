'use client';

import { formatUkMobile } from '@repo/core/phone';
import { otpCodeSchema, ukMobileSchema } from '@repo/core/schemas/auth';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { OtpInput } from '@repo/ui/otp-input';
import type { Route } from 'next';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { safeNextPath } from '@/lib/auth/portals';
import { confirmPhoneVerification, startPhoneVerification } from '../actions';

export function VerifyPhoneForm() {
  const next = safeNextPath(useSearchParams().get('next'), '/');
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = () => {
    setError(null);
    const parsed = ukMobileSchema.safeParse(phone);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a UK mobile number');
      return;
    }
    startTransition(async () => {
      const result = await startPhoneVerification(phone);
      if (result.ok) setSentTo(result.data.phone);
      else setError(result.message);
    });
  };

  const verify = (value: string) => {
    setError(null);
    if (!sentTo || !otpCodeSchema.safeParse(value).success) {
      setError('Enter the 6-digit code');
      return;
    }
    startTransition(async () => {
      const result = await confirmPhoneVerification({ phone: sentTo, code: value }, next);
      if (!result.ok) setError(result.message);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {sentTo ? (
        <ClientForm
          pending={pending}
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            verify(code);
          }}
        >
          <Field label="Code" hint={`Enter the code we sent to ${formatUkMobile(sentTo)}.`}>
            <OtpInput value={code} onChange={setCode} onComplete={verify} />
          </Field>
          <SubmitButton width="full" size="lg" pending={pending}>
            Verify number
          </SubmitButton>
          <Button variant="tertiary" className="self-start px-0" onClick={() => { setSentTo(null); setCode(''); }}>
            Use a different number
          </Button>
        </ClientForm>
      ) : (
        <ClientForm
          pending={pending}
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            send();
          }}
        >
          <Field label="Mobile number">
            <Input
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              placeholder="07700 900123"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); }}
            />
          </Field>
          <SubmitButton width="full" size="lg" pending={pending}>
            Text me a code
          </SubmitButton>
        </ClientForm>
      )}
      <Button asChild variant="tertiary" className="self-start px-0">
        <Link href={next as Route}>Do this later</Link>
      </Button>
    </div>
  );
}
