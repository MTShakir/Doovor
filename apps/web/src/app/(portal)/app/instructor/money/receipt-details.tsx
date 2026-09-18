'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { receiptDetailsSchema, type ReceiptDetails, type ReceiptDetailsInput } from '@repo/core/schemas/receipt-details';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { saveReceiptDetails } from './receipt-details-actions';

export interface ReceiptDetailsValues {
  line1: string;
  line2: string;
  town: string;
  postcode: string;
  vatNumber: string;
}

const names = ['line1', 'line2', 'town', 'postcode', 'vatNumber'] as const;

/**
 * PAY-08, M3-20: the owner says what goes on the Business's receipts: its address, and its VAT
 * number if it is registered, which is what makes receipts show the VAT in each price.
 */
export function ReceiptDetailsForm({ initial }: { initial: ReceiptDetailsValues }) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<ReceiptDetailsInput, unknown, ReceiptDetails>({ resolver: zodResolver(receiptDetailsSchema), defaultValues: initial });
  const { errors } = form.formState;

  // Checked here for the messages, and sent as typed: the server reads it the same way again.
  const onSubmit = form.handleSubmit(() => {
    setFormError(null);
    startTransition(async () => {
      const result = await saveReceiptDetails(form.getValues());
      if (!result.ok) {
        setFormError(result.message);
        for (const name of names) {
          const message = result.fields?.[name];
          if (message) form.setError(name, { message });
        }
        return;
      }
      toast(result.data.vatRegistered ? 'Receipt details saved, with VAT' : 'Receipt details saved');
    });
  });

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field label="Address line 1" error={errors.line1?.message}>
        <Input autoComplete="address-line1" {...form.register('line1')} />
      </Field>
      <Field label="Address line 2 (optional)" error={errors.line2?.message}>
        <Input autoComplete="address-line2" {...form.register('line2')} />
      </Field>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2">
        <Field label="Town or city" error={errors.town?.message}>
          <Input autoComplete="address-level2" {...form.register('town')} />
        </Field>
        <Field label="Postcode" error={errors.postcode?.message}>
          <Input autoComplete="postal-code" {...form.register('postcode')} />
        </Field>
      </div>
      <Field label="VAT number" hint="Only if you are registered for VAT. Receipts then show the VAT in each price." error={errors.vatNumber?.message}>
        <Input autoComplete="off" {...form.register('vatNumber')} />
      </Field>
      <SubmitButton width="responsive" pending={pending}>
        Save receipt details
      </SubmitButton>
    </ClientForm>
  );
}
