'use client';

import { Button } from '@repo/ui/button';
import { useState, useTransition } from 'react';
import { track } from '@/lib/analytics/track';
import { FormAlert } from '@/components/form-alert';
import { acceptInvitation } from './actions';

/** The learner already has an account, so accepting is one tap (AUTH-07). */
export function AcceptButton({ token, name }: { token: string; name: string }) {
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
            const result = await acceptInvitation(token);
            if (result.ok) track('invite_accepted', { as: 'learner' });
            else setError(result.message);
          });
        }}
      >
        Yes, {name} is my instructor
      </Button>
    </div>
  );
}
