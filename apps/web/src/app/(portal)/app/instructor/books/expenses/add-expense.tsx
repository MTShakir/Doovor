'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { allExpenseCategories, type ExpenseCategory } from '@repo/core/expenses';
import { expenseInputSchema, type Expense, type ExpenseInput } from '@repo/core/schemas/books';
import { receiptImage } from '@repo/core/images';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { prepareReceipt, type ImageProblem } from '@/lib/images/prepare';
import { uploadReceipt } from '@/lib/storage/images';
import { getSupabaseBrowserClient } from '@/lib/supabase/browser';
import { recordExpense } from '../actions';

const photoProblem: Record<ImageProblem, string> = {
  WRONG_TYPE: 'Choose a JPEG, PNG, GIF or WebP picture.',
  TOO_BIG: 'That picture is too large. Choose one under 15MB.',
  UNREADABLE: 'We could not read that picture. Try another one.',
};

export interface VehicleChoice {
  id: string;
  name: string;
  /** True when the car is claimed by the mile, so its running costs cannot be claimed here. */
  byMile: boolean;
}

/**
 * MNY-02: what went out, on the day it went out, with the receipt photographed.
 *
 * The category comes first because it decides the rest: a cost of running a car asks which car,
 * and a car claimed by the mile is not offered, because claiming both counts the same money twice.
 */
export function AddExpense({
  businessId,
  today,
  vatRegistered,
  vehicles,
}: {
  businessId: string;
  today: string;
  vatRegistered: boolean;
  vehicles: VehicleChoice[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | undefined>(undefined);
  const [receiptPath, setReceiptPath] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [pending, startTransition] = useTransition();
  const form = useForm<ExpenseInput, unknown, Expense>({
    resolver: zodResolver(expenseInputSchema),
    defaultValues: { category: 'fuel', spentOn: today, amount: '', vat: '', note: '' },
  });
  const { errors } = form.formState;

  const categories = allExpenseCategories();
  // Kept beside the form rather than read out of it: what is chosen decides which hint and which
  // cars are shown, and react-hook-form's watch cannot be memoized safely.
  const [category, setCategory] = useState<ExpenseCategory>('fuel');
  const categoryField = form.register('category');
  const chosen = categories.find((one) => one.key === category);
  const wantsCar = chosen?.vehicleRunning === true;
  const offered = wantsCar ? vehicles.filter((one) => !one.byMile) : vehicles;

  const choosePhoto = (file: File) => {
    setPhotoError(undefined);
    setWorking(true);
    void (async () => {
      const prepared = await prepareReceipt(file);
      if (!prepared.ok) {
        setPhotoError(photoProblem[prepared.problem]);
        setWorking(false);
        return;
      }
      const path = await uploadReceipt(getSupabaseBrowserClient(), businessId, prepared.blob);
      if (!path) {
        setPhotoError('We could not upload that picture. Try again.');
        setWorking(false);
        return;
      }
      setReceiptPath(path);
      setWorking(false);
    })();
  };

  const onSubmit = form.handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await recordExpense({ ...form.getValues(), receiptPath, vehicleId: values.vehicleId ?? null });
      if (!result.ok) {
        setError(result.message);
        for (const [field, message] of Object.entries(result.fields ?? {})) {
          form.setError(field as keyof ExpenseInput, { message });
        }
        return;
      }
      setOpen(false);
      setReceiptPath(null);
      form.reset();
      setCategory('fuel');
      toast('Expense recorded');
    });
  });

  return (
    <>
      <Button
        width="full"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Plus className="size-5" aria-hidden />
        Add an expense
      </Button>
      <Sheet
        open={open}
        onOpenChange={() => { setOpen(false); }}
        title="Add an expense"
        description="What it was for, what it cost, and the day the money went out."
      >
        <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="What was it for?" hint={chosen?.hint}>
            <Select
              options={categories.map((one) => ({ value: one.key, label: one.label }))}
              {...categoryField}
              onChange={(event) => {
                void categoryField.onChange(event);
                setCategory(event.target.value as ExpenseCategory);
              }}
            />
          </Field>
          {chosen?.care ? <FormAlert tone="warning">{chosen.care}</FormAlert> : null}
          <Field label="What did it cost?" hint="In pounds, like 42.50." error={errors.amount?.message}>
            <Input inputMode="decimal" autoComplete="off" {...form.register('amount')} />
          </Field>
          {vatRegistered ? (
            <Field label="VAT inside that (optional)" hint="Leave blank if there was none to reclaim." error={errors.vat?.message}>
              <Input inputMode="decimal" autoComplete="off" {...form.register('vat')} />
            </Field>
          ) : null}
          <Field label="When did the money go out?" error={errors.spentOn?.message}>
            <Input type="date" max={today} {...form.register('spentOn')} />
          </Field>
          {offered.length > 0 ? (
            <Field
              label={wantsCar ? 'Which car?' : 'Which car? (optional)'}
              hint={wantsCar && offered.length < vehicles.length ? 'Cars you claim by the mile are not listed.' : undefined}
            >
              <Select
                placeholder="Not about a car"
                options={offered.map((one) => ({ value: one.id, label: one.name }))}
                {...form.register('vehicleId')}
              />
            </Field>
          ) : null}
          <Field label="Note (optional)">
            <Input autoComplete="off" {...form.register('note')} />
          </Field>
          <Field label="Receipt (optional)" error={photoError} hint={receiptPath ? 'Receipt added.' : 'A photo of the receipt, kept with the expense.'}>
            <input
              type="file"
              accept={receiptImage.acceptedTypes.join(',')}
              className="text-small text-ink file:mr-3 file:min-h-12 file:rounded-full file:border-0 file:bg-grey-100 file:px-4 file:font-semibold file:text-black"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) choosePhoto(file);
              }}
            />
          </Field>
          <SubmitButton width="full" size="lg" pending={pending} disabled={working}>
            Record it
          </SubmitButton>
        </ClientForm>
      </Sheet>
    </>
  );
}
