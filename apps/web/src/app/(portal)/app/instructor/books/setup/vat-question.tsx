'use client';

import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Switch } from '@repo/ui/switch';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { setVatRegistration } from '../actions';

/**
 * MNY-02: whether this instructor charges VAT, and their number if they do (D-198).
 *
 * Asked rather than worked out. An empty VAT number could mean "not registered" or "have not
 * filled it in yet", and the year's figures are different depending which, so the books ask.
 */
export function VatQuestion({ registered, number }: { registered: boolean; number: string }) {
  const [on, setOn] = useState(registered);
  const [value, setValue] = useState(number);
  const [error, setError] = useState<string | null>(null);
  const [numberError, setNumberError] = useState<string | undefined>(undefined);
  const [pending, startTransition] = useTransition();

  const save = (wanted: boolean, vatNumber: string) => {
    setError(null);
    setNumberError(undefined);
    startTransition(async () => {
      const result = await setVatRegistration({ registered: wanted, number: vatNumber });
      if (!result.ok) {
        // A bad number is something to fix, so the switch stays on and the field stays open with
        // the reason beside it. Anything else puts the switch back where it was.
        if (result.fields?.number) {
          setNumberError(result.fields.number);
          return;
        }
        setOn(registered);
        setError(result.message);
        return;
      }
      toast(wanted ? 'Your figures now allow for VAT' : 'Your figures no longer allow for VAT');
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Switch
        label="I am registered for VAT"
        description={on ? 'Your turnover and expenses leave the VAT out.' : 'Your figures are simply what you were paid and what you paid.'}
        checked={on}
        disabled={pending}
        onCheckedChange={(wanted) => {
          setOn(wanted);
          // Turning it off needs no number. Turning it on waits until one is given.
          if (!wanted) save(false, '');
        }}
      />
      {on ? (
        <div className="flex flex-col gap-3">
          <Field label="Your VAT number" hint="Nine digits, or twelve for a branch. GB in front is optional." error={numberError}>
            <Input
              value={value}
              inputMode="numeric"
              autoComplete="off"
              onChange={(event) => { setValue(event.target.value); }}
            />
          </Field>
          <Button
            width="full"
            pending={pending}
            onClick={() => { save(true, value); }}
          >
            Save VAT details
          </Button>
        </div>
      ) : null}
    </div>
  );
}
