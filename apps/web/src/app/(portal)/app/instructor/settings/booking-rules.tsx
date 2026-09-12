'use client';

import { lateFeePercents, type BookingRules } from '@repo/core/booking-rules';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { Switch } from '@repo/ui/switch';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { saveBookingRules, saveInstructorRules } from './actions';

const fees = lateFeePercents.map((percent) => ({
  value: String(percent),
  label: percent === 0 ? 'Nothing' : `${String(percent)} per cent of the lesson`,
}));

/** PRD 11.1: what a learner may book, and when (DIA-05, DIA-06, BOK-06). */
export function BookingRulesForm({ rules, canSetBusinessRules }: { rules: BookingRules; canSetBusinessRules: boolean }) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [values, setValues] = useState({
    bufferMinutes: String(rules.bufferMinutes),
    instantBook: rules.instantBook,
    noticeHours: String(rules.noticeHours),
    horizonWeeks: String(rules.horizonWeeks),
    cancellationWindowHours: String(rules.cancellationWindowHours),
    lateFeePercent: String(rules.lateFeePercent),
    requestExpiryHours: String(rules.requestExpiryHours),
  });

  const change = (patch: Partial<typeof values>) => { setValues((current) => ({ ...current, ...patch })); };

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const mine = await saveInstructorRules({
        bufferMinutes: values.bufferMinutes,
        instantBook: values.instantBook,
      });
      if (!mine.ok) {
        setErrors(mine.fields ?? {});
        if (!mine.fields) setFormError(mine.message);
        return;
      }
      if (canSetBusinessRules) {
        const business = await saveBookingRules({
          noticeHours: values.noticeHours,
          horizonWeeks: values.horizonWeeks,
          cancellationWindowHours: values.cancellationWindowHours,
          lateFeePercent: values.lateFeePercent,
          requestExpiryHours: values.requestExpiryHours,
        });
        if (!business.ok) {
          setErrors(business.fields ?? {});
          if (!business.fields) setFormError(business.message);
          return;
        }
      }
      toast('Booking rules saved');
    });
  };

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Switch
        label="Confirm bookings straight away"
        description="Off means a learner asks, and you answer."
        checked={values.instantBook}
        onCheckedChange={(instantBook) => { change({ instantBook }); }}
      />
      <div className="grid gap-3 md:grid-cols-2">
        <Field label="Gap between lessons" hint="Minutes, up to 60. Your travel time." error={errors.bufferMinutes}>
          <Input
            inputMode="numeric"
            value={values.bufferMinutes}
            onChange={(event) => { change({ bufferMinutes: event.target.value }); }}
          />
        </Field>
        {canSetBusinessRules ? (
          <>
            <Field label="Least notice" hint="Hours, up to 72." error={errors.noticeHours}>
              <Input
                inputMode="numeric"
                value={values.noticeHours}
                onChange={(event) => { change({ noticeHours: event.target.value }); }}
              />
            </Field>
            <Field label="How far ahead learners can book" hint="Weeks, 1 to 26." error={errors.horizonWeeks}>
              <Input
                inputMode="numeric"
                value={values.horizonWeeks}
                onChange={(event) => { change({ horizonWeeks: event.target.value }); }}
              />
            </Field>
            <Field label="Free cancellation up to" hint="Hours before, up to 72." error={errors.cancellationWindowHours}>
              <Input
                inputMode="numeric"
                value={values.cancellationWindowHours}
                onChange={(event) => { change({ cancellationWindowHours: event.target.value }); }}
              />
            </Field>
            <Field label="Charged for a late cancellation" error={errors.lateFeePercent}>
              <Select
                options={fees}
                value={values.lateFeePercent}
                onChange={(event) => { change({ lateFeePercent: event.target.value }); }}
              />
            </Field>
            <Field label="A request expires after" hint="Hours, 1 to 48." error={errors.requestExpiryHours}>
              <Input
                inputMode="numeric"
                value={values.requestExpiryHours}
                onChange={(event) => { change({ requestExpiryHours: event.target.value }); }}
              />
            </Field>
          </>
        ) : null}
      </div>
      {canSetBusinessRules ? null : (
        <p className="text-small text-grey-700">Your school sets the notice, the horizon and the cancellation rules.</p>
      )}
      <SubmitButton variant="secondary" width="responsive" pending={pending}>
        Save booking rules
      </SubmitButton>
    </ClientForm>
  );
}
