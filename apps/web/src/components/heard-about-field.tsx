'use client';

import type { IntendedRole } from '@repo/core/schemas/auth';
import { heardAboutLabels, heardAboutOptions } from '@repo/core/visits';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';

/**
 * "How did you hear about us?", asked once, as an account is made (D-413). Optional, and it starts
 * at whatever the link somebody came on suggests, so a tap confirms it. "Somewhere else" asks
 * where, in their own words.
 */
export function HeardAboutField({
  signingUpAs,
  value,
  onChange,
  other,
  onOtherChange,
  otherError,
}: {
  /** Who is signing up, which decides the answers offered. */
  signingUpAs: IntendedRole;
  /** The answer's key, or empty for none yet. */
  value: string;
  onChange: (value: string) => void;
  other: string;
  onOtherChange: (value: string) => void;
  otherError?: string | undefined;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Field label="How did you hear about us?" hint="Optional. It helps us know what works.">
        <Select
          name="heardAbout"
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          placeholder="Choose one"
          options={heardAboutOptions(signingUpAs).map((choice) => ({ value: choice, label: heardAboutLabels[choice] }))}
        />
      </Field>
      {value === 'other' ? (
        <Field label="Where?" error={otherError}>
          <Input
            name="heardAboutOther"
            value={other}
            maxLength={80}
            autoComplete="off"
            onChange={(event) => {
              onOtherChange(event.target.value);
            }}
          />
        </Field>
      ) : null}
    </div>
  );
}
