'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import type { FlagOverrides } from '@repo/config/flags';
import { magicLinkSchema, otpCodeSchema, signInSchema, ukMobileSchema } from '@repo/core/schemas/auth';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { OtpInput } from '@repo/ui/otp-input';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import type { z } from 'zod';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { OAuthButtons } from '@/components/oauth-buttons';
import { PasswordInput } from '@/components/password-input';
import { sendMagicLink, sendSignInCode, signInWithPassword, verifySignInCode } from '../actions';

type Mode = 'password' | 'link' | 'phone';

export function SignInForm({ flags }: { flags: FlagOverrides }) {
  const params = useSearchParams();
  const next = params.get('next');
  const linkError = params.get('error') === 'link';
  const [mode, setMode] = useState<Mode>('password');

  return (
    <div className="flex flex-col gap-5">
      {linkError ? <FormAlert>That link has expired or was already used. Sign in again.</FormAlert> : null}
      <OAuthButtons next={next ?? '/'} flags={flags} />
      {mode === 'password' ? <PasswordForm next={next} /> : null}
      {mode === 'link' ? <MagicLinkForm /> : null}
      {mode === 'phone' ? <PhoneForm next={next} /> : null}
      <div className="flex flex-col items-start gap-1">
        {mode !== 'password' ? (
          <Button variant="tertiary" className="px-0" onClick={() => { setMode('password'); }}>
            Use your password instead
          </Button>
        ) : null}
        {mode !== 'link' ? (
          <Button variant="tertiary" className="px-0" onClick={() => { setMode('link'); }}>
            Email me a sign-in link instead
          </Button>
        ) : null}
        {mode !== 'phone' ? (
          <Button variant="tertiary" className="px-0" onClick={() => { setMode('phone'); }}>
            Use a text message code instead
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function PasswordForm({ next }: { next: string | null }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  // No default values: the fields keep anything typed before hydration (ClientForm).
  const form = useForm<z.input<typeof signInSchema>>({ resolver: zodResolver(signInSchema) });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await signInWithPassword(values, next);
      if (!result.ok) setFormError(result.message);
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="Email" error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
      </Field>
      <Field label="Password" error={form.formState.errors.password?.message}>
        <PasswordInput autoComplete="current-password" {...form.register('password')} />
      </Field>
      <Link href="/forgot-password" className="self-start text-small font-semibold text-blue underline underline-offset-4">
        Forgot your password?
      </Link>
      <SubmitButton width="full" size="lg" pending={pending}>
        Sign in
      </SubmitButton>
    </ClientForm>
  );
}

function MagicLinkForm() {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<z.input<typeof magicLinkSchema>>({ resolver: zodResolver(magicLinkSchema) });

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    startTransition(async () => {
      const result = await sendMagicLink(values);
      if (!result.ok) setFormError(result.message);
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="Email" hint="We will email you a link that signs you in." error={form.formState.errors.email?.message}>
        <Input type="email" autoComplete="email" inputMode="email" {...form.register('email')} />
      </Field>
      <SubmitButton width="full" size="lg" pending={pending}>
        Email me a link
      </SubmitButton>
    </ClientForm>
  );
}

function PhoneForm({ next }: { next: string | null }) {
  const [pending, startTransition] = useTransition();
  const [phone, setPhone] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sendCode = () => {
    setError(null);
    const parsed = ukMobileSchema.safeParse(phone);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a UK mobile number');
      return;
    }
    startTransition(async () => {
      const result = await sendSignInCode(phone);
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
      const result = await verifySignInCode({ phone: sentTo, code: value }, next);
      if (!result.ok) setError(result.message);
    });
  };

  if (!sentTo) {
    return (
      <ClientForm
        pending={pending}
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          sendCode();
        }}
      >
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Field label="Mobile number" hint="Works if you have verified your number with us.">
          <Input
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); }}
            placeholder="07700 900123"
          />
        </Field>
        <SubmitButton width="full" size="lg" pending={pending}>
          Text me a code
        </SubmitButton>
      </ClientForm>
    );
  }

  return (
    <ClientForm
      pending={pending}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        verify(code);
      }}
    >
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Field label="Code" hint="If that number has an account, we have texted it a 6-digit code.">
        <OtpInput value={code} onChange={setCode} onComplete={verify} />
      </Field>
      <SubmitButton width="full" size="lg" pending={pending}>
        Sign in
      </SubmitButton>
      <Button variant="tertiary" className="self-start px-0" onClick={() => { setSentTo(null); setCode(''); }}>
        Use a different number
      </Button>
    </ClientForm>
  );
}
