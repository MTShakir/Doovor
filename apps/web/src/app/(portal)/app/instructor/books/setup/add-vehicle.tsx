'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { vehicleInputSchema, type VehicleInput } from '@repo/core/schemas/books';
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

/** MNY-03: a car to keep costs or miles against. */
export function AddVehicle() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<VehicleInput>({ resolver: zodResolver(vehicleInputSchema), defaultValues: { name: '' } });
  const { errors } = form.formState;

  const onSubmit = form.handleSubmit(() => {
    setError(null);
    startTransition(async () => {
      const result = await addVehicle(form.getValues());
      if (!result.ok) {
        setError(result.message);
        if (result.fields?.name) form.setError('name', { message: result.fields.name });
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
        description="Whatever you call it. A registration works well."
      >
        <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="What do you call it?" hint="For example LS06 ADI, or the Corsa." error={errors.name?.message}>
            <Input autoComplete="off" {...form.register('name')} />
          </Field>
          <SubmitButton width="full" size="lg" pending={pending}>
            Add it
          </SubmitButton>
        </ClientForm>
      </Sheet>
    </>
  );
}
