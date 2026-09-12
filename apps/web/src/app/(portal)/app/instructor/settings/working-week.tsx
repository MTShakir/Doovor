'use client';

import { weekdays } from '@repo/core/schemas/onboarding';
import { Input } from '@repo/ui/input';
import { Switch } from '@repo/ui/switch';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { saveWorkingWeek } from './actions';

export interface WorkingDayValue {
  weekday: number;
  working: boolean;
  startTime: string;
  endTime: string;
}

/** DIA-01: the week, a day at a time, which is what onboarding could not do. */
export function WorkingWeek({ days: initial }: { days: WorkingDayValue[] }) {
  const [pending, startTransition] = useTransition();
  const [days, setDays] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const change = (weekday: number, patch: Partial<WorkingDayValue>) => {
    setDays((current) => current.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));
  };

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await saveWorkingWeek({ days });
      if (result.ok) toast('Hours saved');
      else setError(result.fields ? 'Check the times you have entered.' : result.message);
    });
  };

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {error ? <FormAlert>{error}</FormAlert> : null}
      <ul className="flex flex-col gap-3">
        {days.map((day) => {
          const name = weekdays.find((item) => item.value === day.weekday)?.long ?? 'Day';
          return (
            <li key={day.weekday} className="flex flex-wrap items-center gap-3">
              <div className="w-40 shrink-0">
                <Switch
                  label={name}
                  checked={day.working}
                  onCheckedChange={(working) => { change(day.weekday, { working }); }}
                />
              </div>
              {day.working ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="time"
                    aria-label={`${name} from`}
                    className="w-32"
                    value={day.startTime}
                    onChange={(event) => { change(day.weekday, { startTime: event.target.value }); }}
                  />
                  <span className="text-small text-grey-700">to</span>
                  <Input
                    type="time"
                    aria-label={`${name} to`}
                    className="w-32"
                    value={day.endTime}
                    onChange={(event) => { change(day.weekday, { endTime: event.target.value }); }}
                  />
                </div>
              ) : (
                <span className="text-small text-grey-700">Not working</span>
              )}
            </li>
          );
        })}
      </ul>
      <SubmitButton variant="secondary" width="responsive" pending={pending}>
        Save hours
      </SubmitButton>
    </ClientForm>
  );
}
