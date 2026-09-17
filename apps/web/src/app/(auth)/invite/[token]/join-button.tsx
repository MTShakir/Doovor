'use client';

import { Button } from '@repo/ui/button';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { acceptMemberInvitation } from './actions';

/** Somebody already signed in joins the school that invited them in one tap (AUTH-05). */
export function JoinButton({ token, school }: { token: string; school: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button
        width="responsive"
        size="lg"
        pending={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await acceptMemberInvitation(token);
            if (!result.ok) setError(result.message);
          });
        }}
      >
        Join {school}
      </Button>
    </div>
  );
}
