'use client';

import { isPostcode, normalisePostcode } from '@repo/core/postcode';
import type { Point } from '@repo/providers/map';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Slider } from '@repo/ui/slider';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { RadiusMap } from '@/components/map/radius-map';
import { usePostcodeLookup } from '@/lib/geo/use-postcode-lookup';
import { saveCoverage } from './coverage-actions';

interface CoverageFormProps {
  postcode: string | null;
  radiusMiles: number;
  centre: Point | null;
}

function milesLabel(miles: number): string {
  return `${String(miles)} ${miles === 1 ? 'mile' : 'miles'}`;
}

/** COV-01 after onboarding: an instructor who moves changes their base here. */
export function CoverageForm({ postcode, radiusMiles, centre }: CoverageFormProps) {
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
      const result = await saveCoverage({ postcode: value, radiusMiles: radius });
      if (result.ok) {
        toast('Area saved');
        return;
      }
      setPostcodeError(result.fields?.postcode);
      if (!result.fields?.postcode) setFormError(result.message);
    });
  };

  return (
    <ClientForm onSubmit={onSubmit} pending={pending} className="flex flex-col gap-4">
      {formError ? <FormAlert>{formError}</FormAlert> : null}
      <Field
        label="Your base postcode"
        hint="Usually home. Learners never see it, only the area it covers."
        error={postcodeError ?? lookup.problem}
      >
        <Input
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
        <Slider label="How far do you travel" value={radius} onValueChange={setRadius} min={1} max={30} valueText={milesLabel} />
      </div>
      <RadiusMap centre={lookup.place} radiusMiles={radius} place={isPostcode(value) ? normalisePostcode(value) : null} />
      {/* One primary action per screen (PRD 7.1): that is Save profile, further down. */}
      <SubmitButton variant="secondary" width="responsive" pending={pending}>
        Save area
      </SubmitButton>
    </ClientForm>
  );
}
