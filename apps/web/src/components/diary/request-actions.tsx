'use client';

import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Textarea } from '@repo/ui/input';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { decideRequest } from '@/app/(portal)/app/instructor/booking-actions';

/** BOK-06: a lesson somebody asked for, and the two answers to it. */
export function RequestActions({ bookingId, learnerName }: { bookingId: string; learnerName: string }) {
  const [pending, startTransition] = useTransition();
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const answer = (accept: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await decideRequest({ bookingId, accept, reason: accept ? '' : reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDeclining(false);
      setReason('');
      toast(accept ? `Lesson with ${learnerName} confirmed` : `Lesson with ${learnerName} declined`);
    });
  };

  return (
    <>
      <span className="flex shrink-0 items-center gap-2">
        <Button pending={pending} onClick={() => { answer(true); }}>
          Accept
        </Button>
        <Button variant="secondary" onClick={() => { setDeclining(true); }}>
          Decline
        </Button>
      </span>

      <Sheet
        open={declining}
        onOpenChange={setDeclining}
        title={`Decline ${learnerName}?`}
        description="They are told straight away, so a word about why helps."
        footer={
          <Button width="full" size="lg" pending={pending} onClick={() => { answer(false); }}>
            Decline the lesson
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="Why, in a word or two?" hint="Optional. They will see it.">
            <Textarea value={reason} onChange={(event) => { setReason(event.target.value); }} />
          </Field>
        </div>
      </Sheet>
    </>
  );
}
