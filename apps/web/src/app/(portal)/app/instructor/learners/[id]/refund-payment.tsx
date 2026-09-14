'use client';

import { refundValuePence } from '@repo/core/credit';
import { formatPence, parsePoundsToPence } from '@repo/core/money';
import { formatDate, formatMinutes } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input, Textarea } from '@repo/ui/input';
import { Select } from '@repo/ui/select';
import { Sheet } from '@repo/ui/sheet';
import { Skeleton } from '@repo/ui/skeleton';
import { toast } from '@repo/ui/toast';
import { Undo2 } from 'lucide-react';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { issueRefund, refundOptions, type RefundOptions } from './money-actions';

const backTheWayItCame: Record<RefundOptions['method'], string> = {
  card: 'Back to the card',
  cash: 'Handed back in cash',
  bank: 'Paid back by bank transfer',
  credit: 'Back as it was paid',
};

/** Every half hour up to what is unused, and what is unused itself when it is not on the half hour. */
function minuteChoices(usable: number): number[] {
  const choices: number[] = [];
  for (let minutes = 30; minutes < usable; minutes += 30) choices.push(minutes);
  if (usable > 0) choices.push(usable);
  return choices.reverse();
}

/**
 * Giving money back for one payment (PAY-07, M3-17). A lesson is refunded by an amount, back the
 * way it was paid or as credit; credit bought is refunded by the unused time, at the price it was
 * bought for. Always with a reason, which goes in the audit log. Offered only to somebody who may
 * refund; the database checks again.
 */
export function RefundPayment({ paymentId, learnerId, learnerName }: { paymentId: string; learnerId: string; learnerName: string }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<RefundOptions | null>(null);
  const [amount, setAmount] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [to, setTo] = useState<'payment' | 'credit'>('payment');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const show = () => {
    setOpen(true);
    setError(null);
    startTransition(async () => {
      const result = await refundOptions({ paymentId });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOptions(result.data);
      setAmount((result.data.refundablePence / 100).toFixed(2));
      setMinutes(result.data.lot?.usableMinutes ?? 0);
      setTo('payment');
    });
  };

  const lot = options?.lot ?? null;
  const pence = lot === null ? parsePoundsToPence(amount) : null;
  const creditValue =
    lot === null || minutes <= 0
      ? 0
      : refundValuePence(
          {
            id: paymentId,
            minutesTotal: lot.minutesTotal,
            minutesRemaining: lot.usableMinutes,
            pricePence: lot.pricePence,
            purchasedAt: new Date(0),
            expiresAt: null,
          },
          minutes,
        );
  const giving = lot === null ? (pence ?? 0) : creditValue;
  const creditMinutes =
    options !== null && lot === null && to === 'credit' && options.lessonMinutes !== null && pence !== null
      ? Math.floor((options.lessonMinutes * pence) / options.amountPence)
      : 0;
  const valid =
    options !== null &&
    reason.trim() !== '' &&
    giving > 0 &&
    (lot !== null || giving <= options.refundablePence) &&
    (to === 'payment' || creditMinutes > 0);

  const refund = () => {
    if (!options || !valid) return;
    setError(null);
    startTransition(async () => {
      const result = await issueRefund({
        paymentId,
        learnerId,
        reason,
        to,
        ...(lot === null ? { amountPence: giving } : { minutes }),
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setOpen(false);
      setReason('');
      toast(
        to === 'credit'
          ? `${formatMinutes(creditMinutes)} of credit added for ${learnerName}`
          : options.method === 'card'
            ? `Refund of ${formatPence(giving)} on its way to the card`
            : `${formatPence(giving)} refunded`,
      );
    });
  };

  return (
    <>
      <Button variant="tertiary" onClick={show}>
        <Undo2 className="size-5" aria-hidden />
        Refund
      </Button>
      <Sheet
        open={open}
        onOpenChange={() => { setOpen(false); }}
        title={`Refund ${learnerName}`}
        description={
          options === null
            ? 'Finding what can be given back.'
            : lot !== null
              ? `${formatMinutes(lot.minutesTotal)} of credit bought for ${formatPence(lot.pricePence)}. ${formatMinutes(lot.usableMinutes)} unused, worth ${formatPence(lot.valuePence)}.`
              : `${formatPence(options.amountPence)}${options.lessonAt === null ? '' : ` for the lesson on ${formatDate(new Date(options.lessonAt))}`}. Up to ${formatPence(options.refundablePence)} can be given back.`
        }
        footer={
          <Button width="full" size="lg" pending={pending} disabled={!valid} onClick={refund}>
            {giving > 0 ? `Refund ${formatPence(giving)}` : 'Refund'}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          {options === null ? (
            <Skeleton className="h-28 w-full" />
          ) : lot !== null ? (
            lot.usableMinutes === 0 ? (
              <p className="text-body text-ink">None of this credit is left to refund.</p>
            ) : (
              <Field label="Unused time to refund">
                <Select
                  value={String(minutes)}
                  onChange={(event) => { setMinutes(Number(event.target.value)); }}
                  options={minuteChoices(lot.usableMinutes).map((choice) => ({
                    value: String(choice),
                    label: `${formatMinutes(choice)}, ${formatPence(
                      refundValuePence(
                        { id: paymentId, minutesTotal: lot.minutesTotal, minutesRemaining: lot.usableMinutes, pricePence: lot.pricePence, purchasedAt: new Date(0), expiresAt: null },
                        choice,
                      ),
                    )}`,
                  }))}
                />
              </Field>
            )
          ) : (
            <>
              <Field label="Amount" error={pence === null || pence <= 0 || pence > options.refundablePence ? `Up to ${formatPence(options.refundablePence)}` : undefined}>
                <Input inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => { setAmount(event.target.value); }} />
              </Field>
              <Field label="How it goes back">
                <Select
                  value={to}
                  onChange={(event) => { setTo(event.target.value === 'credit' ? 'credit' : 'payment'); }}
                  options={[
                    { value: 'payment', label: backTheWayItCame[options.method] },
                    ...(options.lessonMinutes === null ? [] : [{ value: 'credit', label: 'As lesson credit' }]),
                  ]}
                />
              </Field>
              {to === 'credit' && creditMinutes > 0 ? (
                <p className="text-small text-grey-700">
                  {learnerName} gets {formatMinutes(creditMinutes)} of credit to book with, worth {formatPence(giving)}.
                </p>
              ) : null}
            </>
          )}
          <Field label="Why">
            <Textarea
              value={reason}
              maxLength={500}
              placeholder="For example, the lesson was cut short"
              onChange={(event) => { setReason(event.target.value); }}
            />
          </Field>
          <p className="text-small text-grey-700">The reason and your name are kept with the refund.</p>
        </div>
      </Sheet>
    </>
  );
}
