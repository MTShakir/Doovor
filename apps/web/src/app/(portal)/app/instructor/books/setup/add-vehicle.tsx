'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { vehicleInputSchema, type Vehicle, type VehicleInput } from '@repo/core/schemas/books';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { addVehicle } from '../actions';

/** MNY-03, D-199: a car to keep costs or miles against, and what it actually is. */
export function AddVehicle() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<VehicleInput, unknown, Vehicle>({
    resolver: zodResolver(vehicleInputSchema),
    defaultValues: { make: '', model: '', year: '', registration: '' },
  });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    setError(null);
    startTransition(async () => {
      const result = await addVehicle(form.getValues());
      if (!result.ok) {
        const fields = Object.entries(result.fields ?? {});
        // A problem with one field belongs beside that field. Saying it again above the form
        // would be the same sentence twice.
        if (fields.length === 0) setError(result.message);
        for (const [field, message] of fields) {
          form.setError(field as keyof VehicleInput, { message });
        }
        return;
      }
      setOpen(false);
      form.reset();
      toast('Car added');
    });
  });

  return (
    <>
      <Button
        variant="secondary"
        width="full"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Plus className="size-5" aria-hidden />
        Add a car
      </Button>
      <Sheet
        open={open}
        onOpenChange={() => { setOpen(false); }}
        title="Add a car"
        description="The car you teach in. Only the make is needed; the rest helps your accountant."
      >
        <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Make" hint="Toyota, Vauxhall, Ford." error={errors.make?.message}>
              <Input autoComplete="off" {...form.register('make')} />
            </Field>
            <Field label="Model (optional)" hint="Yaris, Corsa." error={errors.model?.message}>
              <Input autoComplete="off" {...form.register('model')} />
            </Field>
          </div>
          <Field label="Year (optional)" hint="The year it was built, like 2020." error={errors.year?.message}>
            <Input inputMode="numeric" autoComplete="off" {...form.register('year')} />
          </Field>
          <Field
            label="Registration (optional)"
            hint="Like AB12 CDE. Older plates are fine too."
            error={errors.registration?.message}
          >
            <Input autoComplete="off" autoCapitalize="characters" {...form.register('registration')} />
          </Field>
          <SubmitButton width="full" size="lg" pending={pending}>
            Add it
          </SubmitButton>
        </ClientForm>
      </Sheet>
    </>
  );
}
