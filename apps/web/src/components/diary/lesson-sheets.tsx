'use client';

import { cancellationOutcome, cancellationWarning } from '@repo/core/cancellation';
import { formatPence } from '@repo/core/money';
import { formatDate, formatTime, todayInZone, utcToLocal } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input, Textarea } from '@repo/ui/input';
import { Sheet } from '@repo/ui/sheet';
import { Skeleton } from '@repo/ui/skeleton';
import { TimeSlotGrid } from '@repo/ui/time-slot-grid';
import { toast } from '@repo/ui/toast';
import { useEffect, useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import { cancelLesson, moveLesson, slotsForDay } from '@/app/(portal)/app/instructor/booking-actions';

export interface ChosenLesson {
  bookingId: string;
  learnerName: string;
  startsAt: string;
  durationMinutes: number;
  pricePence: number;
}

export interface LessonSheetsProps {
  lesson: ChosenLesson;
  /** The Business rules, so the sheet can say what a cancellation costs before it happens. */
  rules: { cancellationWindowHours: number; lateFeePercent: number };
  action: 'move' | 'cancel';
  onClose: () => void;
}

/** BOK-08, BOK-09: the two things an instructor does to a lesson that is already in. */
export function LessonSheets({ lesson, rules, action, onClose }: LessonSheetsProps) {
  const { bookingId, learnerName, startsAt, durationMinutes, pricePence } = lesson;
  const { cancellationWindowHours, lateFeePercent } = rules;
  const [pending, startTransition] = useTransition();
  const cancelling = action === 'cancel';
  const moving = action === 'move';
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [day, setDay] = useState(utcToLocal(new Date(startsAt)).date);
  const [times, setTimes] = useState<{ asked: string; open: string[]; outOfHours: string[] } | null>(null);
  const [slot, setSlot] = useState<string | null>(null);

  const loading = moving && times?.asked !== day;

  useEffect(() => {
    if (!moving || times?.asked === day) return;
    let current = true;
    void slotsForDay({ date: day, durationMinutes }).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTimes({ asked: day, ...result.data });
    });
    return () => {
      current = false;
    };
  }, [moving, day, durationMinutes, times?.asked]);

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
    });
  };

  const move = () => {
    if (slot === null) return;
    setError(null);
    startTransition(async () => {
      const result = await moveLesson({ bookingId, startsAt: slot });
      if (!result.ok) {
        setError(result.message);
        setTimes(null);
        return;
      }
      setTimes(null);
      setSlot(null);
      toast(`Moved to ${formatDate(new Date(slot))} at ${formatTime(new Date(slot))}`);
      onClose();
    });
  };

  return (
    <>
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
              are charged nothing.
            </FormAlert>
          ) : (
            <p className="text-small text-grey-700">{cancellationWarning(outcome, formatPence)}</p>
          )}
          <Field label="Why?" hint="The learner is told, so a few words help.">
            <Textarea value={reason} onChange={(event) => { setReason(event.target.value); }} />
          </Field>
        </div>
      </Sheet>

      <Sheet
        open={moving}
        onOpenChange={onClose}
        title={`Move ${learnerName}`}
        description="The lesson keeps its length and its price."
        footer={
          <Button width="full" size="lg" pending={pending} disabled={slot === null} onClick={move}>
            {slot === null ? 'Choose a time' : `Move to ${formatTime(new Date(slot))}`}
          </Button>
        }
      >
        <div className="flex flex-col gap-4">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <Field label="Which day?">
            {/* The browser owns what is in the box; this only listens (D-043). */}
            <Input type="date" defaultValue={day} min={todayInZone()} onChange={(event) => { setDay(event.target.value); }} />
          </Field>

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
    </>
  );
}
