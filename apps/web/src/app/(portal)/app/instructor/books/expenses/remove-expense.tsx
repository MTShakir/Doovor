'use client';

import { formatPence } from '@repo/core/money';
import { Button } from '@repo/ui/button';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { Trash2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { removeExpense } from '../actions';

/**
 * MNY-02: a mistake taken back out of the books, and its receipt with it.
 *
 * Asked about first, because it cannot be undone: the row goes, and the photograph of the receipt
 * goes with it, which is the only copy anybody has.
 */
export function RemoveExpense({ id, label, amountPence }: { id: string; label: string; amountPence: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const amount = formatPence(amountPence);

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await removeExpense({ id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      toast(`${label} of ${amount} removed`);
    });
  };

  return (
    <>
      <Button
        variant="tertiary"
        size="icon"
        aria-label={`Remove ${label} of ${amount}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Trash2 className="size-5" aria-hidden />
      </Button>
      <Sheet
        open={open}
        onOpenChange={() => { setOpen(false); }}
        title={`Remove ${label} of ${amount}?`}
        description="It comes out of this year's figures, and its receipt is deleted."
        footer={
          <Button variant="destructive" width="full" size="lg" pending={pending} onClick={confirm}>
            Remove it
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <p className="text-small text-grey-700">
            There is no undo for this one, because the photograph goes too.
          </p>
        </div>
      </Sheet>
    </>
  );
}
