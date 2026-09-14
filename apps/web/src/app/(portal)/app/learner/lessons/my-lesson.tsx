'use client';

import { cancellationOutcome, cancellationWarning, type PaidWith } from '@repo/core/cancellation';
import { lessonState, lessonStateLabel } from '@repo/core/diary';
import { formatPence } from '@repo/core/money';
import { formatDate, formatMinutes, formatTime, todayInZone, utcToLocal } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Field } from '@repo/ui/field';
import { Input } from '@repo/ui/input';
import { Sheet } from '@repo/ui/sheet';
import { Skeleton } from '@repo/ui/skeleton';
import { StatusPill } from '@repo/ui/status-pill';
import { TimeSlotGrid } from '@repo/ui/time-slot-grid';
import { toast } from '@repo/ui/toast';
import { MapPin } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { MyLesson } from '@/lib/learner/lessons';
import { cancelMyLesson, moveMyLesson, myInstructorSlots } from './actions';

export interface MyLessonRowProps {
  lesson: MyLesson;
  /** The Business rules, so a learner is told what a cancellation costs first (R-06). */
  rules: { cancellationWindowHours: number; lateFeePercent: number };
  /** The moment the page was rendered, so the server and the browser agree on what is past. */
  now: string;
  canChange: boolean;
}

/** How a lesson was paid for, which decides what cancelling it gives back (PAY-09). */
function paidWith(paymentStatus: string): PaidWith {
  switch (paymentStatus) {
    case 'paid_card':
      return 'card';
    case 'paid_cash':
      return 'cash';
    case 'paid_bank':
      return 'bank';
    case 'paid_credit':
      return 'credit';
    default:
      return 'none';
  }
}

/** One of a learner's own lessons (PRD 8.2, BOK-08, BOK-09). */
export function MyLessonRow({ lesson, rules, now, canChange }: MyLessonRowProps) {
  const [pending, startTransition] = useTransition();
  const [sheet, setSheet] = useState<'move' | 'cancel' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [day, setDay] = useState(utcToLocal(new Date(lesson.startsAt)).date);
  const [times, setTimes] = useState<{ asked: string; slots: string[] } | null>(null);
  const [slot, setSlot] = useState<string | null>(null);

  const state = lessonState({
    status: lesson.status as never,
    paymentStatus: lesson.paymentStatus as never,
    kind: 'standard',
  });
  const outcome = cancellationOutcome({
    startsAt: new Date(lesson.startsAt),
    now: new Date(now),
    by: 'learner',
    windowHours: rules.cancellationWindowHours,
    lateFeePercent: rules.lateFeePercent,
    pricePence: lesson.pricePence,
    paidWith: paidWith(lesson.paymentStatus),
    // A lesson is paid with credit all or nothing, so the credit it used is its length (PAY-04).
    creditMinutes: lesson.durationMinutes,
    // A request or a held slot is never a late cancellation (M3-18).
    status: lesson.status as never,
  });

  useEffect(() => {
    if (sheet !== 'move' || times?.asked === day) return;
    let current = true;
    void myInstructorSlots({
      instructorId: lesson.instructorId,
      date: day,
      durationMinutes: lesson.durationMinutes,
      bookingId: lesson.id,
    }).then((result) => {
      if (!current) return;
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setTimes({ asked: day, slots: result.data });
    });
    return () => {
      current = false;
    };
  }, [sheet, day, lesson.id, lesson.instructorId, lesson.durationMinutes, times?.asked]);

  const cancel = () => {
    setError(null);
    startTransition(async () => {
      const result = await cancelMyLesson({ bookingId: lesson.id });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSheet(null);
      toast('Lesson cancelled');
    });
  };

  const move = () => {
    if (slot === null) return;
    setError(null);
    startTransition(async () => {
      const result = await moveMyLesson({ bookingId: lesson.id, startsAt: slot });
      if (!result.ok) {
        setError(result.message);
        setTimes(null);
        return;
      }
      setSheet(null);
      setSlot(null);
      toast(`Moved to ${formatDate(new Date(slot))} at ${formatTime(new Date(slot))}`);
    });
  };

  return (
    <article className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-body font-semibold text-black">
            {formatDate(new Date(lesson.startsAt))} at {formatTime(new Date(lesson.startsAt))}
          </span>
          <span className="text-small text-grey-700">
            {lesson.lessonType}, {formatMinutes(lesson.durationMinutes)} with {lesson.instructorName}
          </span>
          {lesson.pickup === null ? null : (
            <span className="flex items-center gap-1 text-small text-grey-700">
              <MapPin className="size-4 shrink-0" aria-hidden />
              {lesson.pickup}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill status={state}>
            {lessonStateLabel({ status: lesson.status as never, paymentStatus: lesson.paymentStatus as never, kind: 'standard' })}
          </StatusPill>
          <span className="text-small text-grey-700 tabular-nums">{formatPence(lesson.pricePence)}</span>
        </span>
      </div>

      {!canChange && lesson.canPayNow && lesson.status === 'completed' ? (
        // Paid for after it happened, and not yet (PAY-03): the one thing left to do about it.
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild>
            <Link href={`/app/learner/pay/${lesson.id}`}>Pay {formatPence(lesson.pricePence)}</Link>
          </Button>
        </div>
      ) : null}

      {canChange ? (
        <div className="flex flex-wrap justify-end gap-2">
          {lesson.canPayNow ? (
            <Button asChild>
              <Link href={`/app/learner/pay/${lesson.id}`}>
                {lesson.status === 'requested'
                  ? `Authorise ${formatPence(lesson.pricePence)}`
                  : lesson.paymentMode === 'before_lesson' && lesson.paymentStatus === 'unpaid'
                    ? 'Set up payment'
                    : `Pay ${formatPence(lesson.pricePence)}`}
              </Link>
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => { setSheet('move'); }}>
            Move
          </Button>
          <Button variant="tertiary" onClick={() => { setSheet('cancel'); }}>
            Cancel
          </Button>
        </div>
      ) : null}

      <Sheet
        open={sheet === 'cancel'}
        onOpenChange={() => { setSheet(null); }}
        title="Cancel this lesson?"
        description={`${formatDate(new Date(lesson.startsAt))} at ${formatTime(new Date(lesson.startsAt))} with ${lesson.instructorName}.`}
        footer={
          <Button width="full" size="lg" pending={pending} onClick={cancel}>
            Yes, cancel it
          </Button>
        }
      >
        <div className="flex flex-col gap-3">
          {error ? <FormAlert>{error}</FormAlert> : null}
          {outcome.late && outcome.feePence > 0 ? (
            <FormAlert tone="warning">{cancellationWarning(outcome, formatPence)}</FormAlert>
          ) : (
            <p className="text-small text-grey-700">{cancellationWarning(outcome, formatPence)}</p>
          )}
          <p className="text-small text-grey-700">Your instructor is told straight away.</p>
        </div>
      </Sheet>

      <Sheet
        open={sheet === 'move'}
        onOpenChange={() => { setSheet(null); }}
        title="Move this lesson"
        description={`${lesson.instructorName}'s free times. The lesson keeps its length and price.`}
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
          {times?.asked !== day ? (
            <Skeleton className="h-28 w-full" />
          ) : times.slots.length === 0 ? (
            <p className="text-small text-grey-700">
              Nothing free on {formatDate(new Date(`${day}T12:00:00Z`))}. Try another day.
            </p>
          ) : (
            <TimeSlotGrid
              label={`Times on ${formatDate(new Date(`${day}T12:00:00Z`))}`}
              value={slot}
              onChange={setSlot}
              slots={times.slots.map((one) => ({ id: one, label: formatTime(new Date(one)) }))}
            />
          )}
        </div>
      </Sheet>
    </article>
  );
}
