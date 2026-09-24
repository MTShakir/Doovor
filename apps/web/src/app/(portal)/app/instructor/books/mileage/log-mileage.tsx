'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { mileageInputSchema, type Mileage, type MileageInput } from '@repo/core/schemas/books';
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
import { recordMileage } from '../actions';

/**
 * MNY-03: a trip, against the car that made it.
 *
 * Only the cars that can still be claimed by the mile are offered. The first trip against a car
 * settles it on the mileage rate, which is HMRC's rule and not one we can bend later.
 */
export function LogMileage({ today, vehicles }: { today: string; vehicles: { id: string; name: string }[] }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<MileageInput, unknown, Mileage>({
    resolver: zodResolver(mileageInputSchema),
    defaultValues: { vehicleId: vehicles[0]?.id ?? '', travelledOn: today, miles: '', note: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    setError(null);
    startTransition(async () => {
      const result = await recordMileage(form.getValues());
      if (!result.ok) {
        setError(result.message);
        for (const [field, message] of Object.entries(result.fields ?? {})) {
          form.setError(field as keyof MileageInput, { message });
        }
        return;
      }
      setOpen(false);
      form.reset();
      toast('Mileage logged');
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
        Log a trip
      </Button>
      <Sheet
        open={open}
        onOpenChange={() => { setOpen(false); }}
        title="Log a trip"
        description="How far you drove for work, and which car did it."
      >
        <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="Which car?" hint="The first trip settles this car on the mileage rate.">
            <Select options={vehicles.map((one) => ({ value: one.id, label: one.name }))} {...form.register('vehicleId')} />
          </Field>
          <Field label="How far?" hint="In miles, like 12 or 7.5." error={errors.miles?.message}>
            <Input inputMode="decimal" autoComplete="off" {...form.register('miles')} />
          </Field>
          <Field label="When?" error={errors.travelledOn?.message}>
            <Input type="date" max={today} {...form.register('travelledOn')} />
          </Field>
          <Field label="Note (optional)" hint="Where you went, if you want to remember.">
            <Input autoComplete="off" {...form.register('note')} />
          </Field>
          <SubmitButton width="full" size="lg" pending={pending}>
            Log it
          </SubmitButton>
        </ClientForm>
      </Sheet>
    </>
  );
}
