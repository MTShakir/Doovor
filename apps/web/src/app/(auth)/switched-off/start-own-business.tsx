'use client';

import { Button } from '@repo/ui/button';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { startOwnBusiness } from './actions';

/** One tap to a Business of their own, for somebody a school switched off (D-332). */
export function StartOwnBusiness() {
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
            const result = await startOwnBusiness();
            if (!result.ok) setProblem(result.message);
          });
        }}
      >
        Set up my own business
      </Button>
    </div>
  );
}
