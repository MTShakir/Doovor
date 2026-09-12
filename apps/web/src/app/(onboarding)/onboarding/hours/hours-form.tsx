'use client';

import { onboardingHoursSchema, weekdays, type OnboardingHours } from '@repo/core/schemas/onboarding';
import { Chip } from '@repo/ui/chip';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { saveHours } from '../../actions';

type Weekday = OnboardingHours['days'][number];

interface HoursFormProps {
  days: number[];
  startTime: string;
  endTime: string;
}

export function HoursForm({ days, startTime, endTime }: HoursFormProps) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<number[]>(days);
  const [start, setStart] = useState(startTime);
  const [finish, setFinish] = useState(endTime);

  const toggle = (day: number) => {
    setChosen((current) => (current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()));
  };

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    const values = { days: chosen as Weekday[], startTime: start, endTime: finish };
    const parsed = onboardingHoursSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join('.') || 'form', issue.message])),
      );
      return;
    }
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      // Saving redirects, so this only resolves when something needs fixing.
      const result = await saveHours(values);
      if (!result.ok) {
        setErrors(result.fields ?? {});
        if (!result.fields) setFormError(result.message);
      }
    });
  };

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-5">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="text-small font-semibold text-ink">Which days do you teach?</legend>
        <div className="flex flex-wrap gap-2 py-1">
          {weekdays.map((day) => (
            <Chip
              key={day.value}
              selected={chosen.includes(day.value)}
              aria-label={day.long}
              onClick={() => { toggle(day.value); }}
            >
              {day.short}
            </Chip>
          ))}
        </div>
        {errors.days ? (
          <p role="alert" className="text-small font-medium text-red">
            {errors.days}
          </p>
        ) : null}
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Field label="From" error={errors.startTime}>
          <Input type="time" value={start} onChange={(event) => { setStart(event.target.value); }} />
        </Field>
        <Field label="To" error={errors.endTime}>
          <Input type="time" value={finish} onChange={(event) => { setFinish(event.target.value); }} />
        </Field>
      </div>
      <p className="text-small text-grey-700">
        These are your usual hours. Time off and extra slots are added from your diary.
      </p>
      <SubmitButton width="full" size="lg" pending={pending}>
        Finish
      </SubmitButton>
    </ClientForm>
  );
}
