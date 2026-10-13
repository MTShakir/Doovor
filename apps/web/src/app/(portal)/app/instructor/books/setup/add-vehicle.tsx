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
import { useForm, useWatch } from 'react-hook-form';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { addVehicle } from '../actions';

const dualControlsAnswers = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
] as const;

/**
 * MNY-03, D-199: a car to keep costs or miles against, and what it actually is.
 *
 * D-256: and whether it has dual controls, asked rather than assumed, because HMRC's mileage rate
 * is not for a car with them, and the answer settles how the car is claimed.
 */
export function AddVehicle() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const form = useForm<VehicleInput, unknown, Vehicle>({
    resolver: zodResolver(vehicleInputSchema),
    defaultValues: { make: '', model: '', year: '', registration: '' },
  });
  const { errors } = form.formState;
  const answered = useWatch({ control: form.control, name: 'dualControls' });

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
          <fieldset
            className="flex flex-col gap-2"
            aria-describedby={errors.dualControls ? 'dual-controls-hint dual-controls-error' : 'dual-controls-hint'}
            aria-invalid={errors.dualControls ? true : undefined}
          >
            <legend className="text-small font-semibold text-ink">Does it have dual controls?</legend>
            <p id="dual-controls-hint" className="text-small text-grey-700">
              HMRC does not allow the mileage rate for a car with dual controls, so you claim what it actually costs
              to run instead.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {dualControlsAnswers.map((answer) => (
                <label
                  key={answer.value}
                  className={[
                    'flex min-h-12 cursor-pointer items-center gap-3 rounded-card border-2 px-4 py-3',
                    'transition-colors duration-200 ease-out focus-within:outline-2 focus-within:outline-offset-2',
                    'focus-within:outline-black',
                    answered === answer.value ? 'border-black bg-quiet' : 'border-grey-200 hover:bg-quiet',
                  ].join(' ')}
                >
                  <input type="radio" value={answer.value} className="size-5 accent-black" {...form.register('dualControls')} />
                  <span className="text-body font-semibold text-ink">{answer.label}</span>
                </label>
              ))}
            </div>
            {errors.dualControls?.message ? (
              <p id="dual-controls-error" role="alert" className="text-small font-medium text-red">
                {errors.dualControls.message}
              </p>
            ) : null}
          </fieldset>
          <SubmitButton width="full" size="lg" pending={pending}>
            Add it
          </SubmitButton>
        </ClientForm>
      </Sheet>
    </>
  );
}
