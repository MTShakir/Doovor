'use client';

import { learnerTransmissions } from '@repo/core/schemas/learner';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { addLearner } from './actions';

const empty = { fullName: '', phone: '', email: '', postcode: '', transmission: '' };

/** LRN-03: a learner the instructor already teaches, typed in by them. */
export function ManualLearnerForm({ onAdded }: { onAdded: () => void }) {
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  const set = (field: keyof typeof empty) => (event: { target: { value: string } }) => {
    setValues((current) => ({ ...current, [field]: event.target.value }));
  };

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await addLearner(values);
      if (!result.ok) {
        const { form, ...fields } = result.fields ?? {};
        setErrors(fields);
        setFormError(form ?? (result.fields ? null : result.message));
        return;
      }
      setValues(empty);
      toast(`${values.fullName.trim()} is on your list`);
      onAdded();
    });
  };

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="Their name" error={errors.fullName}>
        <Input autoComplete="off" value={values.fullName} onChange={set('fullName')} />
      </Field>
      <Field
        label="Their mobile number"
        hint="We need a number or an email, so they can claim their account later."
        error={errors.phone}
      >
        <Input type="tel" inputMode="tel" placeholder="07700 900123" value={values.phone} onChange={set('phone')} />
      </Field>
      <Field label="Their email" error={errors.email}>
        <Input type="email" inputMode="email" value={values.email} onChange={set('email')} />
      </Field>
      <Field label="Their postcode" hint="Optional. It fills in their usual pickup area." error={errors.postcode}>
        <Input
          autoCapitalize="characters"
          spellCheck={false}
          className="uppercase"
          value={values.postcode}
          onChange={set('postcode')}
        />
      </Field>
      <Field label="Which gearbox?" error={errors.transmission}>
        <Select
          options={[{ value: '', label: 'Not sure yet' }, ...learnerTransmissions]}
          value={values.transmission}
          onChange={set('transmission')}
        />
      </Field>
      <SubmitButton width="responsive" pending={pending}>
        Add them
      </SubmitButton>
    </ClientForm>
  );
}
