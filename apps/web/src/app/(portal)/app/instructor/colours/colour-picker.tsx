'use client';

import { brand } from '@repo/config/brand';
import { brandColourProblem, normaliseHexColour } from '@repo/core/colour';
import { contrastMessage } from '@repo/core/schemas/brand-colour';
import { Button } from '@repo/ui/button';
import { Card, CardDescription, CardTitle } from '@repo/ui/card';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { toast } from '@repo/ui/toast';
import { useState, useTransition } from 'react';
import { ClientForm, SubmitButton } from '@/components/client-form';
import { FormAlert } from '@/components/form-alert';
import { setBookingColour } from './actions';

/** The default, when somebody has picked nothing: the same black every other page is drawn in. */
const defaultColour = brand.colours.black;

/**
 * D-210: one colour, checked as it is typed.
 *
 * The check runs here so somebody sees the answer while they are still choosing, and again on the
 * server and in the database, because this one is only a courtesy: what keeps a learner able to
 * read the page is the rule that cannot be skipped.
 */
export function ColourPicker({ businessId, colour: saved }: { businessId: string; colour: string | null }) {
  const [colour, setColour] = useState(saved ?? defaultColour);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const tidied = normaliseHexColour(colour);
  const problem = tidied === '' ? 'format' : brandColourProblem(tidied);
  const shown = problem === null ? tidied : defaultColour;
  const changed = (saved ?? '') !== tidied;

  const save = (next: string) => {
    setError(null);
    startTransition(async () => {
      const result = await setBookingColour({ businessId, colour: next });
      if (!result.ok) {
        setError(result.fields?.colour ?? result.message);
        return;
      }
      setColour(result.data.colour === '' ? defaultColour : result.data.colour);
      toast(result.data.colour === '' ? 'Back to the default' : 'Your colour is saved');
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <ClientForm
          onSubmit={(event) => {
            event.preventDefault();
            if (problem === null) save(tidied);
          }}
          pending={pending}
          className="flex flex-col gap-4"
        >
          {error ? <FormAlert>{error}</FormAlert> : null}

          {/* Two controls, each with its own label. A Field gives its one child the id its label
              points at, so wrapping a pair of inputs in a div leaves the label pointing at the div
              and naming neither of them. */}
          <Field
            label="Your colour"
            hint="Used for the buttons and headings a learner sees on your booking page."
            error={
              problem === 'contrast' ? contrastMessage : problem === 'format' ? 'Use a colour like #1A4D8F.' : undefined
            }
          >
            <Input
              value={colour}
              onChange={(event) => { setColour(event.target.value); }}
              maxLength={7}
              autoComplete="off"
              spellCheck={false}
              className="w-40 font-mono uppercase"
            />
          </Field>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="color"
              aria-label="Pick your colour from the wheel"
              value={problem === null ? tidied : defaultColour}
              onChange={(event) => { setColour(event.target.value); }}
              className="size-12 shrink-0 cursor-pointer rounded-card border border-grey-200 bg-white p-1"
            />
            <span className="text-small text-grey-700">Or pick one, and the box above follows.</span>
          </div>

          <div className="flex flex-wrap gap-2">
            <SubmitButton pending={pending} disabled={problem !== null || !changed}>
              Save your colour
            </SubmitButton>
            {saved === null ? null : (
              <Button type="button" variant="secondary" disabled={pending} onClick={() => { save(''); }}>
                Back to the default
              </Button>
            )}
          </div>
        </ClientForm>
      </Card>

      {/* What a learner sees, drawn in whatever is in the box, so nobody has to imagine it. */}
      <Card className="flex flex-col gap-3" role="region" aria-labelledby="preview-title">
        <div className="flex flex-col gap-1">
          <CardTitle id="preview-title">What a learner sees</CardTitle>
          <CardDescription>A preview. Your booking page changes as soon as you save.</CardDescription>
        </div>
        <div className="flex flex-col gap-3 rounded-card border border-grey-200 bg-white p-4">
          <p className="text-h3" style={{ color: shown }}>
            Book a lesson
          </p>
          <p className="text-small text-grey-700">Tuesday 15 September, 14:30, one hour</p>
          <span
            className="inline-flex min-h-12 w-full items-center justify-center rounded-full px-4 text-body font-semibold text-white"
            style={{ backgroundColor: shown }}
          >
            Book this time
          </span>
        </div>
      </Card>
    </div>
  );
}
