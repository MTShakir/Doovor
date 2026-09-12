'use client';

import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { ListRow } from '@repo/ui/list-row';
import { Select } from '@repo/ui/select';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { removeException, saveException } from './actions';

export interface ExceptionRow {
  id: string;
  kind: 'open' | 'blocked';
  /** Already formatted by the server, which knows the zone rules (R-14). */
  when: string;
  reason: string | null;
}

const kinds = [
  { value: 'blocked', label: 'Time off' },
  { value: 'open', label: 'Extra hours' },
];

/** DIA-02: one-off open slots and time off. Overlaps are settled by the database (M1-17). */
export function Exceptions({ rows, today }: { rows: ExceptionRow[]; today: string }) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [kind, setKind] = useState<'open' | 'blocked'>('blocked');
  const [date, setDate] = useState(today);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [reason, setReason] = useState('');

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = await saveException({ kind, date, startTime, endTime, reason });
      if (result.ok) {
        toast(kind === 'blocked' ? 'Time off added' : 'Extra hours added');
        setReason('');
        return;
      }
      setErrors(result.fields ?? {});
      if (!result.fields) setFormError(result.message);
    });
  };

  const drop = (id: string) => {
    startTransition(async () => {
      const result = await removeException(id);
      if (result.ok) toast('Removed');
      else setFormError(result.message);
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {rows.length > 0 ? (
        <ul className="divide-y divide-grey-200 rounded-card border border-grey-200">
          {rows.map((row) => (
            <li key={row.id}>
              <ListRow
                title={row.when}
                subtitle={row.reason}
                leading={<StatusPill status={row.kind === 'blocked' ? 'cancelled' : 'confirmed'}>{row.kind === 'blocked' ? 'Time off' : 'Extra hours'}</StatusPill>}
                trailing={
                  <Button
                    variant="tertiary"
                    size="icon"
                    aria-label={`Remove ${row.when}`}
                    onClick={() => { drop(row.id); }}
                  >
                    <Trash2 className="size-5" aria-hidden />
                  </Button>
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-small text-grey-700">Nothing coming up. Add time off or extra hours below.</p>
      )}

      <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-3">
        {formError ? <FormAlert>{formError}</FormAlert> : null}
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="What is it?">
            <Select
              options={kinds}
              value={kind}
              onChange={(event) => { setKind(event.target.value === 'open' ? 'open' : 'blocked'); }}
            />
          </Field>
          <Field label="Date" error={errors.date}>
            <Input type="date" value={date} onChange={(event) => { setDate(event.target.value); }} />
          </Field>
          <Field label="From" error={errors.startTime}>
            <Input type="time" value={startTime} onChange={(event) => { setStartTime(event.target.value); }} />
          </Field>
          <Field label="To" error={errors.endTime}>
            <Input type="time" value={endTime} onChange={(event) => { setEndTime(event.target.value); }} />
          </Field>
        </div>
        <Field label="Reason" hint="Only you see this." error={errors.reason}>
          <Input
            placeholder="Holiday, car service, appointment"
            value={reason}
            onChange={(event) => { setReason(event.target.value); }}
          />
        </Field>
        <SubmitButton variant="secondary" width="responsive" pending={pending}>
          Add to diary
        </SubmitButton>
      </ClientForm>
    </div>
  );
}
