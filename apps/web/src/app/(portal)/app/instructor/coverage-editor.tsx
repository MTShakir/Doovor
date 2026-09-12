'use client';

import { Chip } from '@repo/ui/chip';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { addDistrict, removeDistrict } from './coverage-actions';

export interface District {
  outcode: string;
  rule: 'include' | 'exclude';
}

const rules = [
  { value: 'include', label: 'Also teach here' },
  { value: 'exclude', label: 'Do not teach here' },
];

/**
 * The exceptions to the circle (COV-02). Most instructors need none; the ones who do usually
 * have one or two, so this is a short list and a box, not a screen of its own.
 */
export function CoverageEditor({ districts }: { districts: District[] }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);
  const [outcode, setOutcode] = useState('');
  const [rule, setRule] = useState<'include' | 'exclude'>('include');

  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setError(undefined);
    startTransition(async () => {
      const result = await addDistrict({ outcode, rule });
      if (result.ok) setOutcode('');
      else setError(result.message);
    });
  };

  const drop = (district: string) => {
    startTransition(async () => {
      const result = await removeDistrict(district);
      if (!result.ok) setError(result.message);
    });
  };

  const included = districts.filter((district) => district.rule === 'include');
  const excluded = districts.filter((district) => district.rule === 'exclude');

  return (
    <div className="flex flex-col gap-4">
      {districts.length > 0 ? (
        <div className="flex flex-col gap-3">
          {[
            { title: 'Also teach in', list: included },
            { title: 'Do not teach in', list: excluded },
          ]
            .filter((group) => group.list.length > 0)
            .map((group) => (
              <div key={group.title} className="flex flex-col gap-2">
                <span className="text-small font-semibold text-ink">{group.title}</span>
                <div className="flex flex-wrap gap-2 py-1">
                  {group.list.map((district) => (
                    <Chip
                      key={district.outcode}
                      selected
                      aria-label={`Remove ${district.outcode}`}
                      onClick={() => { drop(district.outcode); }}
                    >
                      {district.outcode}
                      <X className="size-4" aria-hidden />
                    </Chip>
                  ))}
                </div>
              </div>
            ))}
        </div>
      ) : null}

      <ClientForm onSubmit={submit} pending={pending} className="flex flex-col gap-3 md:flex-row md:items-end">
        <Field label="Postcode district" hint="For example LS17." error={error} className="md:flex-1">
          <Input
            autoCapitalize="characters"
            spellCheck={false}
            className="uppercase"
            placeholder="LS17"
            value={outcode}
            onChange={(event) => { setOutcode(event.target.value); }}
          />
        </Field>
        <Field label="Rule" hideLabel className="md:w-56">
          <Select
            options={rules}
            value={rule}
            onChange={(event) => { setRule(event.target.value === 'exclude' ? 'exclude' : 'include'); }}
          />
        </Field>
        <SubmitButton variant="secondary" pending={pending} className="md:mb-0">
          Add
        </SubmitButton>
      </ClientForm>
      {districts.length === 0 ? (
        <p className="text-small text-grey-700">
          Most instructors need none of these. The circle around your base is usually enough.
        </p>
      ) : null}
    </div>
  );
}
