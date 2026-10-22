'use client';

import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Textarea } from '@repo/ui/input';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { cancelDeletion, requestDeletion, revokeDevice } from './actions';

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

/**
 * Turning two-step verification off, for somebody whose role does not need it. Once on it is asked
 * for at every sign-in (D-351), so somebody who tried it must be able to stop (AUTH-08, D-362).
 * The code they signed in with is what lets them: the authenticator goes only from a session that
 * has passed it.
 */
export function TurnOffTwoStep({ factorId }: { factorId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <>
      {/* As Set up and Add and verify are beside it: a row has no room for a button and its words. */}
      <button
        type="button"
        className="inline-flex min-h-12 items-center text-small font-semibold text-blue underline underline-offset-4"
        onClick={() => { setOpen(true); }}
      >
        Turn off
      </button>
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Turn off two-step verification?"
        description="Signing in will ask for your password, or a link or code we send you, and not for a code from your app."
        footer={
          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              width="full"
              pending={pending}
              onClick={() => {
                setError(null);
                startTransition(async () => {
                  const { error: failed } = await getSupabaseBrowserClient().auth.mfa.unenroll({ factorId });
                  if (failed) {
                    setError('It could not be turned off. Sign out, sign in again with your code, and try once more.');
                    return;
                  }
                  setOpen(false);
                  toast('Two-step verification turned off');
                  router.refresh();
                });
              }}
            >
              Turn it off
            </Button>
            <Button variant="secondary" width="full" onClick={() => { setOpen(false); }}>
              Keep it on
            </Button>
          </div>
        }
      >
        {error ? <FormAlert>{error}</FormAlert> : <p className="text-body text-grey-700">You can set it up again whenever you like.</p>}
      </Sheet>
    </>
  );
}

/** What waiting for the account to go means, to whoever is reading (D-361, D-370). */
const waitingWords = {
  teaches: 'We will confirm by email. Your profile stays up until your account goes, seven days from now.',
  learns: 'We will confirm by email. Lessons already booked stay with your instructor until we finish.',
  neither: 'We will confirm by email, and it goes seven days from now.',
} as const;

/**
 * `warning`: what they would give up, said again where they confirm (D-353). `who`: whether they teach
 * at a Business, learn with one, or neither, as staff (D-361, D-370).
 */
export function DeleteAccount({ warning = null, who = 'learns' }: { warning?: string | null; who?: keyof typeof waitingWords }) {
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
        description={waitingWords[who]}
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
          {warning ? <FormAlert tone="warning">{warning}</FormAlert> : null}
          <Field label="Why are you leaving?" hint="You do not have to say. If you tell us, we may be able to put it right first.">
            <Textarea value={reason} onChange={(e) => { setReason(e.target.value); }} maxLength={500} />
          </Field>
        </div>
      </Sheet>
    </>
  );
}

/** While a deletion waits, it can be called off (AUTH-09, M6-12). */
export function KeepMyAccount() {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="secondary"
        width="responsive"
        pending={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await cancelDeletion();
            if (result.ok) toast('Your account is staying.');
            else setError(result.message);
          });
        }}
      >
        Keep my account after all
      </Button>
      {error === null ? null : <FormAlert>{error}</FormAlert>}
    </div>
  );
}
