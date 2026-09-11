'use client';

import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Textarea } from '@repo/ui/input';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { requestDeletion, revokeDevice } from './actions';

/** The visible label is "Sign out"; screen readers also hear which device, as a list has several. */
export function RevokeDeviceButton({ sessionId, device }: { sessionId: string; device: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="secondary"
      pending={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await revokeDevice(sessionId);
          toast(result.ok ? 'Device signed out' : result.message);
        });
      }}
    >
      Sign out<span className="sr-only"> {device}</span>
    </Button>
  );
}

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <Button variant="destructive" width="responsive" onClick={() => { setOpen(true); }}>
        Ask to delete my account
      </Button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Delete your account?"
        description="We will confirm by email. Lessons already booked stay with your instructor until we finish."
        footer={
          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              width="full"
              pending={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const result = await requestDeletion({ reason });
                  if (result.ok) {
                    setOpen(false);
                    toast('Request received. We will email you.');
                  } else {
                    setError(result.message);
                  }
                });
              }}
            >
              Ask to delete my account
            </Button>
            <Button variant="secondary" width="full" onClick={() => { setOpen(false); }}>
              Keep my account
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="Why are you leaving? (optional)">
            <Textarea value={reason} onChange={(e) => { setReason(e.target.value); }} maxLength={500} />
          </Field>
        </div>
      </Sheet>
    </>
  );
}
