'use client';

import { isPostcode, normalisePostcode } from '@repo/core/postcode';
import type { Point } from '@repo/providers/map';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Slider } from '@repo/ui/slider';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { RadiusMap } from '@/components/map/radius-map';
import { usePostcodeLookup } from '@/lib/geo/use-postcode-lookup';
import { saveArea } from '../../actions';

interface AreaFormProps {
  postcode: string | null;
  radiusMiles: number;
  /** Where that postcode is, when it is already known. */
  centre: Point | null;
}

function milesLabel(miles: number): string {
  return `${String(miles)} ${miles === 1 ? 'mile' : 'miles'}`;
}

export function AreaForm({ postcode, radiusMiles, centre }: AreaFormProps) {
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);
  const [postcodeError, setPostcodeError] = useState<string | undefined>(undefined);
  const [value, setValue] = useState(postcode ?? '');
  const [radius, setRadius] = useState(radiusMiles);
  const lookup = usePostcodeLookup(value, { postcode, place: centre });

  const onSubmit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setFormError(null);
    setPostcodeError(undefined);
    startTransition(async () => {
      // Saving redirects, so this only resolves when something needs fixing.
      const result = await saveArea({ postcode: value, radiusMiles: radius });
      if (!result.ok) {
        setPostcodeError(result.fields?.postcode);
        if (!result.fields?.postcode) setFormError(result.message);
      }
    });
  };

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-5">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field
        label="Your base postcode"
        hint="Usually home. Learners never see it, only the area it covers."
        error={postcodeError ?? lookup.problem}
      >
        <Input
          name="postcode"
          autoComplete="postal-code"
          autoCapitalize="characters"
          spellCheck={false}
          className="uppercase"
          defaultValue={postcode ?? ''}
          onChange={(event) => { setValue(event.target.value); }}
        />
      </Field>
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <span className="text-small font-semibold text-ink">How far do you travel?</span>
          <span className="text-body font-semibold text-black">{milesLabel(radius)}</span>
        </div>
        <Slider
          label="How far do you travel"
          value={radius}
          onValueChange={setRadius}
          min={1}
          max={30}
          valueText={milesLabel}
        />
      </div>
      <RadiusMap centre={lookup.place} radiusMiles={radius} place={isPostcode(value) ? normalisePostcode(value) : null} />
      <SubmitButton width="full" size="lg" pending={pending}>
        Continue
      </SubmitButton>
    </ClientForm>
  );
}
