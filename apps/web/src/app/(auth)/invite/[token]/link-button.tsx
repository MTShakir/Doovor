'use client';

import { Button } from '@repo/ui/button';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { track } from '@/lib/analytics/track';
import { acceptLinkInvitation } from './actions';

/** An instructor already signed in links the business they run to the school that asked (D-282). */
export function LinkButton({ token, business, school }: { token: string; business: string; school: string }) {
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
            const result = await acceptLinkInvitation(token);
            if (result.ok) track('invite_accepted', { as: 'instructor' });
            else setError(result.message);
          });
        }}
      >
        Link {business} to {school}
      </Button>
    </div>
  );
}
