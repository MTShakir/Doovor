'use client';

import { Button } from '@repo/ui/button';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { Archive } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { retireVehicle } from '../actions';

/**
 * MNY-03, D-199: a car that has gone.
 *
 * Retired rather than deleted, and the sheet says so: what was claimed against it is part of a
 * financial record, and a set of books with a hole where a car used to be is worse than one
 * listing a car nobody drives any more.
 */
export function RetireVehicle({ id, name, claimed }: { id: string; name: string; claimed: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await retireVehicle({ id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      toast(`${name} retired`);
    });
  };

  return (
    <>
      <Button
        variant="tertiary"
        size="icon"
        aria-label={`Retire ${name}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Archive className="size-5" aria-hidden />
      </Button>
      <Sheet
        open={open}
        onOpenChange={() => { setOpen(false); }}
        title={`Retire ${name}?`}
        description="It stops being offered when you record something. Nothing already claimed against it changes."
        footer={
          <Button width="full" size="lg" pending={pending} onClick={confirm}>
            Retire it
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <p className="text-small text-grey-700">
            {claimed
              ? 'What you have already claimed against this car stays in your books, because that is what your records are.'
              : 'Nothing has been claimed against this car yet, so there is nothing to keep.'}
          </p>
          <p className="text-small text-grey-700">
            If you have replaced it, add the new car. How each one is claimed is settled separately, which is
            what lets you change method when you change car.
          </p>
        </div>
      </Sheet>
    </>
  );
}
