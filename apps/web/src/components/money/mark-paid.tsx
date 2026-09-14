'use client';

import { formatPence } from '@repo/core/money';
import { formatDate, formatTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Sheet } from '@repo/ui/sheet';
import { toast, toastWithUndo } from '@repo/ui/toast';
import { Banknote, Landmark } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { recordOfflinePayment, undoOfflinePayment } from '@/app/(portal)/app/instructor/booking-actions';

export interface MarkPaidLesson {
  bookingId: string;
  learnerName: string;
  startsAt: string;
  /** What is owed: the price of the lesson, or the fee for one called off late. */
  pricePence: number;
  /** Paying the fee for a lesson called off late, not for the lesson (M3-18). */
  lateFee?: boolean;
}

/**
 * How a lesson was paid in person (PAY-05, M3-15): cash or a bank transfer, one tap each. A slip
 * is one Undo away (D-089). Opened from the diary and from the learner card.
 */
export function MarkPaidSheet({ lesson, open, onClose }: { lesson: MarkPaidLesson; open: boolean; onClose: () => void }) {
  const { bookingId, learnerName, startsAt, pricePence, lateFee = false } = lesson;
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const markPaid = (method: 'cash' | 'bank') => {
    setError(null);
    startTransition(async () => {
      const result = await recordOfflinePayment({ bookingId, method });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onClose();
      const { paymentId } = result.data;
      toastWithUndo(`Marked paid (${method})`, () => {
        void undoOfflinePayment({ paymentId }).then((undone) => {
          toast(undone.ok ? `${learnerName}'s ${lateFee ? 'fee' : 'lesson'} is unpaid again` : undone.message);
        });
      });
    });
  };

  return (
    <Sheet
      open={open}
      onOpenChange={onClose}
      title={`How did ${learnerName} pay?`}
      description={`${formatPence(pricePence)}${lateFee ? ' late cancellation fee' : ''} for ${formatDate(new Date(startsAt))} at ${formatTime(new Date(startsAt))}.`}
    >
      <div className="flex flex-col gap-3 pb-2">
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Button width="full" size="lg" pending={pending} onClick={() => { markPaid('cash'); }}>
          <Banknote className="size-5" aria-hidden />
          Cash
        </Button>
        <Button width="full" size="lg" variant="secondary" disabled={pending} onClick={() => { markPaid('bank'); }}>
          <Landmark className="size-5" aria-hidden />
          Bank transfer
        </Button>
      </div>
    </Sheet>
  );
}

/** The button and its sheet together, for a screen that has no sheet of its own to open. */
export function MarkPaidButton({ lesson }: { lesson: MarkPaidLesson }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => { setOpen(true); }}>
        <Banknote className="size-5" aria-hidden />
        Mark paid
      </Button>
      <MarkPaidSheet lesson={lesson} open={open} onClose={() => { setOpen(false); }} />
    </>
  );
}
