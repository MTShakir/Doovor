'use client';

import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Select } from '@repo/ui/select';
import { toast } from '@repo/ui/toast';
import { MapPin, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { setMyLessonPickup } from '../actions';

export interface PickupChoice {
  id: string;
  label: string;
  where: string;
}

/**
 * Where this lesson starts from, chosen by the learner (COV-04, D-185). The places are the ones
 * they keep on their account, so choosing one here never invents an address their instructor has
 * not seen, and a new place is added where the rest of them live.
 */
export function LessonPickup({
  bookingId,
  chosen,
  places,
  changeable,
}: {
  bookingId: string;
  chosen: string | null;
  places: PickupChoice[];
  changeable: boolean;
}) {
  const [picked, setPicked] = useState(chosen ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (next: string) => {
    setPicked(next);
    setError(null);
    startTransition(async () => {
      const result = await setMyLessonPickup({ bookingId, pickupPointId: next });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast(next === '' ? 'Pickup point taken off this lesson' : 'Your instructor collects you there');
    });
  };

  if (!changeable) {
    return <p className="text-small text-grey-700">This lesson has been and gone, so where it started cannot be changed.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <FormAlert>{error}</FormAlert> : null}
      {places.length === 0 ? (
        <p className="text-small text-grey-700">You have no pickup points saved yet. Add one and it can be used for this lesson.</p>
      ) : (
        <Field label="Collect me from" hint="One of the places saved on your account.">
          <Select
            options={[
              { value: '', label: 'No pickup point' },
              ...places.map((place) => ({ value: place.id, label: `${place.label}, ${place.where}` })),
            ]}
            value={picked}
            disabled={pending}
            onChange={(event) => { save(event.target.value); }}
          />
        </Field>
      )}
      <Button asChild variant="secondary" className="self-start">
        <Link href="/app/learner/account/pickup-points">
          {places.length === 0 ? <Plus className="size-5" aria-hidden /> : <MapPin className="size-5" aria-hidden />}
          {places.length === 0 ? 'Add a pickup point' : 'Manage my pickup points'}
        </Link>
      </Button>
    </div>
  );
}
