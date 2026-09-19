'use client';

import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Textarea } from '@repo/ui/input';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { track } from '@/lib/analytics/track';
import { decideVerification } from './actions';

/**
 * Approve, or reject with a reason (ADM-03). The reason is shown to the instructor, so it is
 * required: "no" on its own tells them nothing.
 */
export function DecisionForm({ profileId, name }: { profileId: string; name: string }) {
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const decide = (approved: boolean) => {
    setError(undefined);
    startTransition(async () => {
      const result = await decideVerification({ profileId, approved, reason });
      if (result.ok) {
        if (approved) track('instructor_verified');
        toast(approved ? `${name} is verified` : `${name} was not approved`);
        setRejecting(false);
        setReason('');
        return;
      }
      setError(result.fields?.reason ?? result.message);
    });
  };

  if (!rejecting) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button pending={pending} onClick={() => { decide(true); }}>
          Approve
        </Button>
        <Button variant="secondary" onClick={() => { setRejecting(true); }}>
          Reject
        </Button>
        {error ? (
          <p role="alert" className="text-small font-medium text-red">
            {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Field label="Why not?" hint="The instructor is shown this." error={error}>
        <Textarea rows={3} value={reason} onChange={(event) => { setReason(event.target.value); }} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button variant="destructive" pending={pending} onClick={() => { decide(false); }}>
          Reject
        </Button>
        <Button variant="tertiary" onClick={() => { setRejecting(false); setError(undefined); }}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
