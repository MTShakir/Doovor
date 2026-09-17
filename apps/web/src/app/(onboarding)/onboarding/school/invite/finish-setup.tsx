'use client';

import { Button } from '@repo/ui/button';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { finishSchoolSetup } from '../actions';

/** Leaves setup for the school's portal. More instructors can be invited from there. */
export function FinishSetup() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 border-t border-grey-200 pt-6">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button
        variant="secondary"
        width="full"
        size="lg"
        pending={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            // Finishing redirects, so this only resolves when something went wrong.
            const result = await finishSchoolSetup();
            if (!result.ok) setError(result.message);
          });
        }}
      >
        Go to my school
      </Button>
      <p className="text-center text-small text-grey-700">You can invite more instructors at any time.</p>
    </div>
  );
}
