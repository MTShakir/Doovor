'use client';

import { offerWindows } from '@repo/core/schemas/school';
import type { Result } from '@repo/core/result';
import { Button } from '@repo/ui/button';
import { Checkbox } from '@repo/ui/checkbox';
import { Field } from '@repo/ui/field';
import { Select } from '@repo/ui/select';
import { Sheet } from '@repo/ui/sheet';
import { useState } from 'react';
import { FormAlert } from '@/components/form-alert';

export interface LinkedChoice {
  linkId: string;
  name: string;
  businessName: string;
}

/**
 * Offering a new pupil to instructors linked to the school (M9-17, D-289): whoever the school
 * ticks sees the offer, the first to accept gets the pupil, and an offer nobody answers in time
 * lapses and the pupil comes back to New.
 */
export function OfferPupilSheet({
  pupil,
  linked,
  onOffer,
  onClose,
  onOffered,
}: {
  pupil: { enquiryId: string; fullName: string } | null;
  linked: readonly LinkedChoice[];
  onOffer: (input: { enquiryId: string; linkIds: string[]; hours: string }) => Promise<Result<null>>;
  onClose: () => void;
  onOffered: () => void;
}) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [hours, setHours] = useState('24');
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [shown, setShown] = useState(pupil);
  // Keep the last pupil while the sheet closes, so it does not empty as it slides away.
  if (pupil !== null && pupil !== shown) {
    setShown(pupil);
    setChosen([]);
    setProblem(null);
  }

  const offer = async () => {
    if (shown === null) return;
    setPending(true);
    const result = await onOffer({ enquiryId: shown.enquiryId, linkIds: chosen, hours });
    setPending(false);
    if (result.ok) {
      onOffered();
      return;
    }
    setProblem(result.fields?.linkIds ?? result.fields?.hours ?? result.message);
  };

  return (
    <Sheet
      open={pupil !== null}
      onOpenChange={(open) => { if (!open) onClose(); }}
      title={`Offer ${shown?.fullName ?? 'this pupil'}`}
      description="The first to accept gets them. Until then, they see a first name, the area and when suits."
      footer={
        <Button width="full" pending={pending} onClick={() => { void offer(); }}>
          {chosen.length === 0 ? 'Offer' : chosen.length === 1 ? 'Offer to 1 instructor' : `Offer to ${String(chosen.length)} instructors`}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {problem ? <FormAlert>{problem}</FormAlert> : null}
        <fieldset className="flex flex-col">
          <legend className="text-small font-semibold text-ink">Who to offer them to</legend>
          {linked.map((one) => (
            <Checkbox
              key={one.linkId}
              id={`offer-${one.linkId}`}
              label={one.businessName === one.name ? one.name : `${one.name}, ${one.businessName}`}
              checked={chosen.includes(one.linkId)}
              onCheckedChange={(value) => {
                setChosen((now) => (value === true ? [...now, one.linkId] : now.filter((id) => id !== one.linkId)));
              }}
            />
          ))}
        </fieldset>
        <Field label="How long they have to answer">
          <Select id="offer-hours" options={[...offerWindows]} value={hours} onChange={(event) => { setHours(event.target.value); }} />
        </Field>
      </div>
    </Sheet>
  );
}
