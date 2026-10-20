'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { officeEnquirySchema, schoolEnquirySchema } from '@repo/core/schemas/school';
import type { Result } from '@repo/core/result';
import type { z } from '@repo/core/zod';
import { Checkbox } from '@repo/ui/checkbox';
import { Field } from '@repo/ui/field';
import { Input, Textarea } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { useState, useTransition } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';

type Values = z.input<typeof schoolEnquirySchema>;
type FieldName = 'fullName' | 'email' | 'phone' | 'postcode' | 'transmission' | 'note' | 'agreed';
const fieldNames: readonly FieldName[] = ['fullName', 'email', 'phone', 'postcode', 'transmission', 'note', 'agreed'];

const gearboxes = [
  { value: 'manual', label: 'Manual' },
  { value: 'automatic', label: 'Automatic' },
];

/**
 * Somebody asking a school for lessons (M9-15, D-288): on the school's page, in their own words,
 * or typed in by the office for somebody who rang. What they agree to is shown beside the box,
 * and kept with what they give.
 */
export function EnquiryForm({
  mode,
  consentWords,
  onSave,
  onSaved,
  idPrefix = '',
}: {
  mode: 'public' | 'office';
  consentWords: string;
  onSave: (values: Values & { company?: string }) => Promise<Result<null>>;
  onSaved: () => void;
  idPrefix?: string;
}) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  // A box a person never sees, which only a script fills in.
  const [company, setCompany] = useState('');
  const office = mode === 'office';
  const form = useForm<Values, unknown, z.output<typeof schoolEnquirySchema>>({
    resolver: zodResolver(office ? officeEnquirySchema : schoolEnquirySchema),
    defaultValues: { fullName: '', email: '', phone: '', postcode: '', transmission: '', note: '', agreed: false },
  });
  const { errors } = form.formState;

  // Checked here first, then sent as typed: the server reads it again itself.
  const onSubmit = form.handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const result = await onSave({ ...form.getValues(), ...(office ? {} : { company }) });
      if (result.ok) {
        form.reset();
        onSaved();
        return;
      }
      const fields = (result.fields ?? {}) as Partial<Record<FieldName, string>>;
      const named = fieldNames.filter((name) => fields[name] !== undefined);
      for (const name of named) form.setError(name, { message: fields[name] });
      if (named.length === 0) setFormError(result.message);
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label={office ? 'Their name' : 'Your name'} error={errors.fullName?.message}>
        <Input id={`${idPrefix}enquiry-name`} autoComplete={office ? 'off' : 'name'} {...form.register('fullName')} />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Email" error={errors.email?.message}>
          <Input id={`${idPrefix}enquiry-email`} type="email" autoComplete={office ? 'off' : 'email'} spellCheck={false} {...form.register('email')} />
        </Field>
        <Field label="Mobile" hint="An email, a mobile or both." error={errors.phone?.message}>
          <Input id={`${idPrefix}enquiry-phone`} type="tel" autoComplete={office ? 'off' : 'tel'} {...form.register('phone')} />
        </Field>
        <Field label="Postcode" hint="Where lessons would start." error={errors.postcode?.message}>
          <Input id={`${idPrefix}enquiry-postcode`} autoComplete={office ? 'off' : 'postal-code'} {...form.register('postcode')} />
        </Field>
        <Field label="Which gearbox?" error={errors.transmission?.message}>
          <Select id={`${idPrefix}enquiry-gearbox`} options={gearboxes} placeholder="Either is fine" {...form.register('transmission')} />
        </Field>
      </div>
      <Field label="When suits" hint="Days and times, and anything else worth knowing." error={errors.note?.message}>
        <Textarea id={`${idPrefix}enquiry-note`} maxLength={500} {...form.register('note')} />
      </Field>
      {office ? null : (
        <div aria-hidden="true" className="sr-only">
          <label htmlFor={`${idPrefix}enquiry-company`}>Company</label>
          <input
            id={`${idPrefix}enquiry-company`}
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(event) => { setCompany(event.target.value); }}
          />
        </div>
      )}
      <Controller
        control={form.control}
        name="agreed"
        render={({ field }) => (
          <div className="flex flex-col gap-1">
            <Checkbox
              id={`${idPrefix}enquiry-agreed`}
              label={consentWords}
              checked={field.value}
              onCheckedChange={(value) => { field.onChange(value === true); }}
              aria-invalid={errors.agreed ? true : undefined}
            />
            {errors.agreed?.message ? <p className="text-small font-medium text-red">{errors.agreed.message}</p> : null}
          </div>
        )}
      />
      <SubmitButton width="responsive" pending={pending}>
        {office ? 'Add them' : 'Ask about lessons'}
      </SubmitButton>
    </ClientForm>
  );
}
