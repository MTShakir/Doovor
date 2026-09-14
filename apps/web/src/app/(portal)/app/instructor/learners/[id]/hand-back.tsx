'use client';

import { formatPence } from '@repo/core/money';
import { Button } from '@repo/ui/button';
import { Sheet } from '@repo/ui/sheet';
import { toast } from '@repo/ui/toast';
import { HandCoins } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { markHandedBack } from './money-actions';

/**
 * Cash or a bank transfer owed back, marked handed back (R-08, M3-18). Two taps, because it
 * cannot be taken back: the refund is settled, and the learner's balance and history say so.
 * Offered to the instructor who taught the lesson and to the people who run the Business; the
 * database checks again.
 */
export function HandBack({
  refundId,
  learnerId,
  learnerName,
  amountPence,
}: {
  refundId: string;
  learnerId: string;
  learnerName: string;
  amountPence: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const amount = formatPence(amountPence);

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await markHandedBack({ refundId, learnerId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      toast(`${amount} handed back to ${learnerName}`);
    });
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <HandCoins className="size-5" aria-hidden />
        Mark handed back
      </Button>
      <Sheet
        open={open}
        onOpenChange={() => { setOpen(false); }}
        title={`Hand back ${amount} to ${learnerName}?`}
        description="Paid in cash or by bank transfer, and owed back to them."
        footer={
          <Button width="full" size="lg" pending={pending} onClick={confirm}>
            It is handed back
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <p className="text-small text-grey-700">
            Mark it once the money is back with {learnerName}. Their balance and history show it as paid back.
          </p>
        </div>
      </Sheet>
    </>
  );
}
