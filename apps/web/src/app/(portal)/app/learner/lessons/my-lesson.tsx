'use client';

import { cancellationOutcome, cancellationWarning, type PaidWith } from '@repo/core/cancellation';
import { splitByCredit } from '@repo/core/credit';
import { lessonState, lessonStateLabel } from '@repo/core/diary';
import { formatPence } from '@repo/core/money';
import { formatDate, formatMinutes, formatTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { Sheet } from '@repo/ui/sheet';
import { StatusPill } from '@repo/ui/status-pill';
import { toast } from '@repo/ui/toast';
import { ChevronRight, MapPin } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { FormAlert } from '@/components/form-alert';
import type { MyLesson } from '@/lib/learner/lessons';
import { cancelMyLesson } from './actions';
import { NoShowDispute } from './no-show-dispute';

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

  const state = lessonState({
    status: lesson.status as never,
    paymentStatus: lesson.paymentStatus as never,
    kind: 'standard',
  });
  // Credit paid for what it covered, so what is left to pay is the price less that (D-225). The
  // price still shows beside the pill: it is what the lesson costs, whoever the money came from.
  const owedPence = splitByCredit({
    minutes: lesson.durationMinutes,
    pricePence: lesson.pricePence,
    availableMinutes: lesson.creditMinutes,
  }).owedPence;
  const outcome = cancellationOutcome({
    startsAt: new Date(lesson.startsAt),
    now: new Date(now),
    by: 'learner',
    windowHours: rules.cancellationWindowHours,
    lateFeePercent: rules.lateFeePercent,
    pricePence: lesson.pricePence,
    durationMinutes: lesson.durationMinutes,
    paidWith: paidWith(lesson.paymentStatus),
    // Credit pays for what it covers, which may be all of the lesson or part of it (D-225).
    creditMinutes: lesson.creditMinutes,
    // A request or a held slot is never a late cancellation (M3-18).
    status: lesson.status as never,
  });

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

  return (
    <article className="flex flex-col gap-2 px-4 py-3">
      {/* What the card says opens the lesson; the buttons under it stay buttons of their own. */}
      <Link
        href={`/app/learner/lessons/${lesson.id}`}
        aria-label={`Open ${formatDate(new Date(lesson.startsAt))} at ${formatTime(new Date(lesson.startsAt))} with ${lesson.instructorName}`}
        className="flex items-start gap-3 rounded-input focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
      >
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
            {lessonStateLabel({
              status: lesson.status as never,
              paymentStatus: lesson.paymentStatus as never,
              kind: 'standard',
              creditMinutes: lesson.creditMinutes,
            })}
          </StatusPill>
          <span className="text-small text-grey-700 tabular-nums">{formatPence(lesson.pricePence)}</span>
        </span>
        <ChevronRight className="mt-0.5 size-5 shrink-0 text-grey-700" aria-hidden />
      </Link>

      {lesson.status === 'no_show' ? <NoShowDispute lesson={lesson} now={now} /> : null}

      {!canChange && lesson.canPayNow && lesson.status === 'completed' ? (
        // Paid for after it happened, and not yet (PAY-03): the one thing left to do about it.
        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild>
            <Link href={`/app/learner/pay/${lesson.id}`}>Pay {formatPence(owedPence)}</Link>
          </Button>
        </div>
      ) : null}

      {canChange ? (
        <div className="flex flex-wrap justify-end gap-2">
          {lesson.canPayNow ? (
            <Button asChild>
              <Link href={`/app/learner/pay/${lesson.id}`}>
                {lesson.status === 'requested'
                  ? `Authorise ${formatPence(owedPence)}`
                  : lesson.paymentMode === 'before_lesson' && lesson.paymentStatus === 'unpaid'
                    ? 'Set up payment'
                    : `Pay ${formatPence(owedPence)}`}
              </Link>
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => { setSheet('move'); }}>
            Move
          </Button>
          {/* UX: a learner reads "Cancel" beside "Move" as backing out, not as calling it off. */}
          <Button variant="tertiary" onClick={() => { setSheet('cancel'); }}>
            Cancel lesson
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

      {/* Only the instructor moves a lesson; the learner asks them (BOK-08 as amended, D-164). */}
      <Sheet
        open={sheet === 'move'}
        onOpenChange={() => { setSheet(null); }}
        title="Only your instructor can move it"
        description={`${formatDate(new Date(lesson.startsAt))} at ${formatTime(new Date(lesson.startsAt))} with ${lesson.instructorName}.`}
        footer={
          <Button width="full" size="lg" onClick={() => { setSheet(null); }}>
            Got it
          </Button>
        }
      >
        <p className="text-body text-ink">
          Contact {lesson.instructorName} directly to ask for another time. When they move it, you are told the new time.
        </p>
      </Sheet>
    </article>
  );
}
