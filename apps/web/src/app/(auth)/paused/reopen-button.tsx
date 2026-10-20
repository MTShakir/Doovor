'use client';

import { Button } from '@repo/ui/button';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { reopenOwnBusiness } from './actions';

/** One tap to open a paused business again (D-292). */
export function ReopenButton({ businessId, name }: { businessId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-3">
      {problem ? <FormAlert>{problem}</FormAlert> : null}
      <Button
        width="responsive"
        size="lg"
        pending={pending}
        onClick={() => {
          setProblem(null);
          startTransition(async () => {
            const result = await reopenOwnBusiness(businessId);
            if (!result.ok) setProblem(result.message);
          });
        }}
      >
        Open {name} again
      </Button>
    </div>
  );
}
