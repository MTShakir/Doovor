'use client';

import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { removeMyDetails } from '@/lib/capture/actions';

/** One press removes every waiting list place and lesson request kept for the address (D-117). */
export function RemoveDetails({ token }: { token: string }) {
  const [pending, startTransition] = useTransition();
  const [outcome, setOutcome] = useState<{ ok: true } | { ok: false; message: string } | null>(null);

  if (outcome?.ok) {
    return (
      <FormAlert tone="success">Your details are removed. We will not email you about waiting lists or lesson requests again.</FormAlert>
    );
  }

  return (
    <ClientForm
      pending={pending}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await removeMyDetails({ token });
          setOutcome(result.ok ? { ok: true } : { ok: false, message: result.message });
        });
      }}
    >
      {outcome ? <FormAlert>{outcome.message}</FormAlert> : null}
      <SubmitButton size="lg" width="full" pending={pending}>
        Remove my details
      </SubmitButton>
    </ClientForm>
  );
}
