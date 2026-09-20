'use client';

import { isPostcode } from '@repo/core/postcode';
import { pickupKinds, type PickupKind } from '@repo/core/schemas/pickup';
import { Checkbox } from '@repo/ui/checkbox';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { useEffect, useState } from 'react';
import { PickupMap } from '@/components/map/pickup-map';
import { findPostcode, type FoundPostcode } from '@/lib/pickup/find-postcode';

export interface PickupDraft {
  kind: PickupKind;
  label: string;
  address: string;
  postcode: string;
  isDefault: boolean;
  /** Where the pin was left, when somebody moved it off the middle of the postcode (D-182). */
  latitude?: number;
  longitude?: number;
}

/**
 * Where a lesson starts, filled in from the postcode (COV-04, D-182).
 *
 * The postcode comes first, because it is the one thing we can check: it names the place, puts a
 * pin on the map and, with a service that knows houses, offers the addresses inside it. The free
 * service knows postcodes only, so the house is typed and the pin can be dragged to the door.
 */
export function PickupForm({
  draft,
  errors,
  onChange,
}: {
  draft: PickupDraft;
  errors: Record<string, string>;
  onChange: (next: Partial<PickupDraft>) => void;
}) {
  // What came back, and which postcode it was about: an answer to an older postcode is not an
  // answer to the one on screen, so it is held with the question rather than cleared as they type.
  const [answered, setAnswered] = useState<{ postcode: string; found: FoundPostcode | null; problem: string | null } | null>(null);

  const typed = draft.postcode.trim();
  const askable = isPostcode(typed);
  const answer = answered?.postcode === typed ? answered : null;
  const found = answer?.found ?? null;
  const problem = answer?.problem ?? null;
  const looking = askable && answer === null;

  // Looked up as they type, once what they have typed could be a postcode. The lookup is cached,
  // so a postcode the platform has seen before costs nothing.
  useEffect(() => {
    if (!askable || answer !== null) return undefined;
    let current = true;
    const timer = setTimeout(() => {
      void findPostcode(typed)
        .then((result) => {
          if (!current) return;
          if (result.ok) {
            setAnswered({ postcode: typed, found: result.data, problem: null });
            // The middle of the postcode until somebody drags the pin somewhere better.
            if (draft.latitude === undefined) onChange({ latitude: result.data.latitude, longitude: result.data.longitude });
          } else {
            setAnswered({ postcode: typed, found: null, problem: result.message });
          }
        })
        .catch(() => {
          if (!current) return;
          setAnswered({ postcode: typed, found: null, problem: 'We could not check that postcode just now. Try again in a moment.' });
        });
    }, 400);

    return () => {
      current = false;
      clearTimeout(timer);
    };
    // Only the postcode starts a lookup; the rest of the draft changing must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typed, askable, answer]);

  const place = found === null ? null : [found.district, found.postcode].filter((part) => part !== null).join(', ');
  const pin =
    found === null
      ? null
      : { latitude: draft.latitude ?? found.latitude, longitude: draft.longitude ?? found.longitude };

  return (
    <div className="flex flex-col gap-4">
      <Field label="Postcode" hint="Start here: it finds the place and puts the pin on the map." error={errors.postcode}>
        <Input
          autoCapitalize="characters"
          spellCheck={false}
          className="uppercase"
          value={draft.postcode}
          onChange={(event) => {
            // A new postcode is a new place, so a pin dragged for the old one is dropped.
            onChange({ postcode: event.target.value, latitude: undefined, longitude: undefined });
          }}
        />
      </Field>

      {looking ? <p className="text-small text-grey-700">Looking it up…</p> : null}
      {problem !== null ? <p className="text-small text-red">{problem}</p> : null}
      {place !== null && !looking ? <p className="text-small text-grey-700">Found {place}.</p> : null}

      {found?.addresses ? (
        <Field label="Which address?" error={errors.address}>
          <Select
            options={found.addresses.map((one) => ({ value: one.line, label: one.line }))}
            placeholder="Choose the address"
            value={draft.address}
            onChange={(event) => {
              const picked = found.addresses?.find((one) => one.line === event.target.value);
              onChange({ address: event.target.value, latitude: picked?.latitude, longitude: picked?.longitude });
            }}
          />
        </Field>
      ) : (
        <Field label="Address" hint="The house number or name, and the street." error={errors.address}>
          <Input autoComplete="off" value={draft.address} onChange={(event) => { onChange({ address: event.target.value }); }} />
        </Field>
      )}

      {pin !== null ? (
        <PickupMap
          pin={pin}
          place={place ?? draft.postcode}
          onMove={(point) => { onChange({ latitude: point.latitude, longitude: point.longitude }); }}
        />
      ) : null}

      <Field label="What kind of place?" error={errors.kind}>
        <Select
          options={[...pickupKinds]}
          value={draft.kind}
          onChange={(event) => { onChange({ kind: event.target.value as PickupKind }); }}
        />
      </Field>

      <Field
        label="What to call it"
        hint={`Optional. Left empty, it is called ${pickupKinds.find((kind) => kind.value === draft.kind)?.label ?? 'by its kind'}.`}
        error={errors.label}
      >
        <Input value={draft.label} onChange={(event) => { onChange({ label: event.target.value }); }} />
      </Field>

      <Checkbox
        label="Lessons start here"
        description="New lessons use it, unless another is chosen."
        checked={draft.isDefault}
        onCheckedChange={(checked) => { onChange({ isDefault: checked === true }); }}
      />
    </div>
  );
}
