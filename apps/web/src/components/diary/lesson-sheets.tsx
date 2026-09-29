'use client';

import { cancellationOutcome, cancellationWarning } from '@repo/core/cancellation';
import { formatPence } from '@repo/core/money';
import { formatDate, formatMinutes, formatTime, todayInZone, utcToLocal } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Checkbox } from '@repo/ui/checkbox';
import { Field } from '@repo/ui/field';
import { Input, Textarea } from '@repo/ui/input';
import { Sheet } from '@repo/ui/sheet';
import { Select } from '@repo/ui/select';
import { Skeleton } from '@repo/ui/skeleton';
import { TimeSlotGrid } from '@repo/ui/time-slot-grid';
import { toast } from '@repo/ui/toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { MarkPaidSheet } from '@/components/money/mark-paid';
import { cancelLesson, moveLesson, priceForLength, slotsForDay } from '@/app/(portal)/app/instructor/booking-actions';

export interface ChosenLesson {
  bookingId: string;
  /** So the instructor can go and speak to them before moving it (D-200). */
  learnerId?: string;
  learnerName: string;
  startsAt: string;
  durationMinutes: number;
  pricePence: number;
  /** Where its money stands, so the sheet can say what goes back when it is called off (R-08). */
  paymentStatus?: string;
}

export interface LessonSheetsProps {
  lesson: ChosenLesson;
  /** The Business rules, so the sheet can say what a cancellation costs before it happens. */
  rules: { cancellationWindowHours: number; lateFeePercent: number };
  action: 'move' | 'cancel' | 'paid';
  onClose: () => void;
}

/** Everything a learner paid goes back when the instructor calls the lesson off (R-08, M3-18). */
function paidBack(paymentStatus: string | undefined, price: string): string | null {
  switch (paymentStatus) {
    case 'paid_card':
      return `The ${price} they paid goes back to their card.`;
    case 'paid_cash':
    case 'paid_bank':
      return `The ${price} they paid is owed back to them: mark it handed back on their learner card once it is.`;
    case 'paid_credit':
      return 'The credit it used goes back to them.';
    default:
      return null;
  }
}

/**
 * The lengths a lesson can be changed to (BOK-03, D-179, D-187): every half hour from one to four
 * and a half, and whatever it is now, which may be a length the catalogue no longer sells.
 */
function lengthOptions(current: number): { value: string; label: string }[] {
  const lengths = new Set<number>([current]);
  for (let each = 60; each <= 270; each += 30) lengths.add(each);
  return [...lengths]
    .sort((a, b) => a - b)
    .map((each) => ({ value: String(each), label: formatMinutes(each) }));
}

/** What the length change does to the price, in the words under the picker. */
function priceWords(
  minutes: number,
  was: number,
  pricePence: number,
  quoted: { minutes: number; pence: number | null } | null,
): string {
  if (minutes === was) return `It runs for ${formatMinutes(was)} and costs ${formatPence(pricePence)}.`;
  if (quoted?.minutes !== minutes) return 'Working out what that costs...';
  if (quoted.pence === null) return 'No price is set for a lesson that long, so it cannot be changed to it.';
  return `${formatMinutes(minutes)} costs ${formatPence(quoted.pence)}, instead of ${formatPence(pricePence)}.`;
}

/** BOK-08, BOK-09, PAY-05: what an instructor does to a lesson that is already in. */
export function LessonSheets({ lesson, rules, action, onClose }: LessonSheetsProps) {
  const { bookingId, learnerId, learnerName, startsAt, durationMinutes, pricePence, paymentStatus } = lesson;
  const { cancellationWindowHours, lateFeePercent } = rules;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const cancelling = action === 'cancel';
  const moving = action === 'move';
  const paying = action === 'paid';
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [day, setDay] = useState(utcToLocal(new Date(startsAt)).date);
  // How long it runs, which the instructor may change here as well as when (BOK-03, D-187).
  const [minutes, setMinutes] = useState(durationMinutes);
  const [newPrice, setNewPrice] = useState<{ minutes: number; pence: number | null } | null>(null);
  // Travel time after the lesson before, which is not needed where it starts at the same door.
  const [ignoreGap, setIgnoreGap] = useState(false);
  const [times, setTimes] = useState<{ asked: string; open: string[]; outOfHours: string[] } | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  // Between choosing a new time and it happening: a lesson is an appointment with a person, and
  // moving one nobody has been told about is how a learner turns up to an empty street (D-200).
  const [telling, setTelling] = useState(false);

  const sameAsNow = slot !== null && minutes === durationMinutes && new Date(slot).getTime() === new Date(startsAt).getTime();

  const askedFor = `${day}:${String(minutes)}:${String(ignoreGap)}`;
  const loading = moving && times?.asked !== askedFor;

  useEffect(() => {
    if (!moving || times?.asked === askedFor) return;
    let current = true;
    void slotsForDay({ date: day, durationMinutes: minutes, exceptBookingId: bookingId, ignoreGap }).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTimes({ asked: askedFor, ...result.data });
      // Start from where the lesson already is, so the instructor sees it before they move it
      // (D-200). A choice made on another day is dropped rather than quietly carried over.
      const offered = [...result.data.open, ...result.data.outOfHours];
      const itsOwn = offered.find((one) => new Date(one).getTime() === new Date(startsAt).getTime()) ?? null;
      setSlot((chosen) => (chosen !== null && offered.includes(chosen) ? chosen : itsOwn));
    });
    return () => {
      current = false;
    };
  }, [moving, day, bookingId, minutes, ignoreGap, askedFor, times?.asked, startsAt]);

  // What the new length costs is the database's answer, not this screen's arithmetic (R-05).
  useEffect(() => {
    if (!moving || minutes === durationMinutes) return;
    let current = true;
    void priceForLength({ bookingId, durationMinutes: minutes }).then((result) => {
      if (current && result.ok) setNewPrice({ minutes, pence: result.data });
    });
    return () => {
      current = false;
    };
  }, [moving, bookingId, minutes, durationMinutes]);

  // What the learner would be charged if the instructor were the learner: the instructor
  // cancelling costs them nothing (R-08), so this is only ever the shape of the warning.
  const outcome = cancellationOutcome({
    startsAt: new Date(startsAt),
    now: new Date(),
    by: 'instructor',
    windowHours: cancellationWindowHours,
    lateFeePercent,
    pricePence,
    paidWith: 'none',
  });

  const cancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelLesson({ bookingId, reason });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setReason('');
      toast(`Lesson with ${learnerName} cancelled`);
      onClose();
      // The diary listens for changes as well, and that is for changes made somewhere else
      // (D-220). Whoever just did this should not be waiting on a websocket to see it.
      router.refresh();
    });
  };

  const move = () => {
    if (slot === null) return;
    setTelling(false);
    setError(null);
    startTransition(async () => {
      const result = await moveLesson({ bookingId, startsAt: slot, durationMinutes: minutes, ignoreGap });
      if (!result.ok) {
        setError(result.message);
        setTimes(null);
        return;
      }
      setTimes(null);
      setSlot(null);
      toast(`Moved to ${formatDate(new Date(slot))} at ${formatTime(new Date(slot))}`);
      onClose();
      router.refresh();
    });
  };

  return (
    <>
      {/* Two taps: the lesson's Mark paid, then how (PAY-05). */}
      <MarkPaidSheet lesson={{ bookingId, learnerName, startsAt, pricePence }} open={paying} onClose={onClose} />

      <Sheet
        open={cancelling}
        onOpenChange={onClose}
        title={`Cancel ${learnerName}?`}
        description={`${formatDate(new Date(startsAt))} at ${formatTime(new Date(startsAt))}.`}
        footer={
          <Button width="full" size="lg" pending={pending} disabled={reason.trim() === ''} onClick={cancel}>
            Cancel the lesson
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          {outcome.late ? (
            <FormAlert tone="warning">
              This is inside the {cancellationWindowHours} hour window, so the learner would have been charged
              {' '}
              {formatPence(Math.round((pricePence * lateFeePercent) / 100))} had they cancelled. Because you are, they
              are charged nothing. {paidBack(paymentStatus, formatPence(pricePence))}
            </FormAlert>
          ) : (
            <p className="text-small text-grey-700">
              {paidBack(paymentStatus, formatPence(pricePence)) ?? cancellationWarning(outcome, formatPence)}
            </p>
          )}
          <Field label="Why?" hint="The learner is told, so a few words help.">
            <Textarea value={reason} onChange={(event) => { setReason(event.target.value); }} />
          </Field>
        </div>
      </Sheet>

      <Sheet
        open={moving}
        onOpenChange={onClose}
        title={`Edit ${learnerName}'s lesson`}
        description="Change when it is, how long it runs, or both. A different length is priced like a lesson of that length."
        footer={
          <Button
            width="full"
            size="lg"
            pending={pending}
            disabled={slot === null || sameAsNow}
            onClick={() => { setTelling(true); }}
          >
            {slot === null ? 'Choose a time' : sameAsNow ? 'Pick a different time' : `Move to ${formatTime(new Date(slot))}`}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="How long?" hint={priceWords(minutes, durationMinutes, pricePence, newPrice)}>
            <Select
              value={String(minutes)}
              onChange={(event) => { setMinutes(Number(event.target.value)); }}
              options={lengthOptions(durationMinutes)}
            />
          </Field>

          <Field label="Which day?">
            {/* The browser owns what is in the box; this only listens (D-043). */}
            <Input type="date" defaultValue={day} min={todayInZone()} onChange={(event) => { setDay(event.target.value); }} />
          </Field>

          <Checkbox
            label="No gap needed after the lesson before"
            description="For a lesson that starts where the last one finished. It frees the times the travel gap was holding, on both sides."
            checked={ignoreGap}
            onCheckedChange={(checked) => { setIgnoreGap(checked === true); }}
          />

          {loading || times === null ? (
            <Skeleton className="h-28 w-full" />
          ) : times.open.length === 0 && times.outOfHours.length === 0 ? (
            <p className="text-small text-grey-700">Nothing free that day. Try another.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {times.open.length > 0 ? (
                <TimeSlotGrid
                  label={`Times on ${formatDate(new Date(`${day}T12:00:00Z`))}`}
                  value={slot}
                  onChange={setSlot}
                  slots={times.open.map((one) => ({ id: one, label: formatTime(new Date(one)) }))}
                />
              ) : null}
              {times.outOfHours.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-small font-semibold text-ink">Outside your hours</p>
                  <TimeSlotGrid
                    label="Times outside your hours"
                    value={slot}
                    onChange={setSlot}
                    slots={times.outOfHours.map((one) => ({ id: one, label: formatTime(new Date(one)) }))}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </Sheet>

      {/* One more tap, because the lesson is an appointment with a person (D-200). */}
      <Sheet
        open={telling && slot !== null}
        onOpenChange={() => { setTelling(false); }}
        title={`Have you told ${learnerName} about the change?`}
        description={
          slot === null
            ? undefined
            : `It would move to ${formatDate(new Date(slot))} at ${formatTime(new Date(slot))}.`
        }
      >
        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <p className="text-small text-grey-700">
            They are told the lesson moved either way. This is about whether they are expecting it.
          </p>
          <Button width="full" size="lg" pending={pending} onClick={move}>
            Yes, I have told them
          </Button>
          {learnerId === undefined ? null : (
            <Button variant="secondary" width="full" asChild>
              <Link href={`/app/instructor/learners/${learnerId}`}>Contact them now</Link>
            </Button>
          )}
          {/* Discard is discarding the change, so it puts the whole thing away rather than
              dropping the person back on the form they were trying to leave (D-222). Closing this
              sheet another way, with the cross or Escape, goes back to the form, which is what
              somebody who wants a different time wants. */}
          <Button
            variant="tertiary"
            width="full"
            onClick={() => {
              setTelling(false);
              setSlot(null);
              setTimes(null);
              onClose();
            }}
          >
            Discard
          </Button>
        </div>
      </Sheet>
    </>
  );
}
