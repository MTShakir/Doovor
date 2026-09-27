'use client';

import { lessonState, lessonStateLabel } from '@repo/core/diary';
import { formatPence } from '@repo/core/money';
import { formatTime } from '@repo/core/time';
import { StatusPill } from '@repo/ui/status-pill';
import { LessonLength } from '@/components/lessons/lesson-length';
import { Button } from '@repo/ui/button';
import { Banknote, CalendarClock, Check, MapPin, X } from 'lucide-react';
import type { DiaryEntry } from '@/lib/diary/lessons';
import { OpenLesson } from '@/components/lessons/lesson-details';
import { RequestActions } from './request-actions';

/**
 * One lesson, as it appears in the day and week views (DIA-03, DIA-04). The time is the
 * first thing read, then who it is with, then whether it has been paid for.
 */
export function LessonRow({
  lesson,
  showInstructor = false,
  canAnswer = false,
  onMove,
  onCancel,
  started = false,
  canMarkNoShow = false,
  onComplete,
  onNoShow,
  onMarkPaid,
  openable = false,
  shouldOpen,
}: {
  lesson: DiaryEntry;
  showInstructor?: boolean;
  /** BOK-06: somebody who may accept or decline a request is looking at it. */
  canAnswer?: boolean;
  /** BOK-08, BOK-09: opening the sheets the day holds for the whole list. */
  onMove?: () => void;
  onCancel?: () => void;
  /** BOK-10, R-09: a lesson that has already happened has different answers. */
  started?: boolean;
  canMarkNoShow?: boolean;
  onComplete?: () => void;
  onNoShow?: () => void;
  /** PAY-05: a lesson somebody paid for in person, in cash or by bank transfer. */
  onMarkPaid?: () => void;
  /** Tapping what the lesson says opens its sheet (D-166). */
  openable?: boolean;
  /** Asked before it opens: a hold on a phone has just opened Move instead. */
  shouldOpen?: () => boolean;
}) {
  const state = lessonState(lesson.facts);
  const off = state === 'cancelled';
  const asked = lesson.facts.status === 'requested';
  const done = lesson.facts.status === 'completed' || lesson.facts.status === 'no_show';
  // Paid in person is recorded on a lesson that is on or has happened, with a price, and not paid another way.
  const payable =
    canAnswer && !asked && !off && lesson.pricePence > 0 && ['unpaid', 'pending', 'failed'].includes(lesson.facts.paymentStatus);
  const markPaid =
    payable && onMarkPaid ? (
      <Button variant="secondary" onClick={onMarkPaid}>
        <Banknote className="size-5" aria-hidden />
        Mark paid
      </Button>
    ) : null;

  const summary = (
    <span className="flex flex-wrap items-start gap-3">
      <span className="w-14 shrink-0 text-small font-semibold text-ink tabular-nums">
        {formatTime(lesson.startsAt)}
        <span className="block font-normal text-grey-700">{formatTime(lesson.endsAt)}</span>
        <LessonLength startsAt={lesson.startsAt} endsAt={lesson.endsAt} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {/* A cancelled lesson is struck through and muted rather than faded: text behind an
            opacity is text nobody with low vision can read (D-009). */}
        <span className={`text-body font-semibold ${off ? 'text-grey-700 line-through' : 'text-black'}`}>
          {lesson.learnerName}
        </span>
        <span className="text-small text-grey-700">
          {lesson.lessonType}
          {showInstructor ? ` with ${lesson.instructorName}` : ''}
        </span>
        {lesson.pickup ? (
          <span className="flex items-center gap-1 text-small text-grey-700">
            <MapPin className="size-4 shrink-0" aria-hidden />
            {lesson.pickup}
          </span>
        ) : null}
      </span>
      <span className="ml-auto flex shrink-0 flex-col items-end gap-1">
        <StatusPill status={state}>{lessonStateLabel(lesson.facts)}</StatusPill>
        <span className="text-small text-grey-700 tabular-nums">
          {formatPence(lesson.pricePence)}
        </span>
      </span>
    </span>
  );

  return (
    <article
      className="flex flex-col gap-2 px-4 py-3"
      aria-label={`${formatTime(lesson.startsAt)} ${lesson.learnerName}`}
    >
      {/* Wraps at 200% text, where the time, the learner and what is owed will not share a line. */}
      {openable ? (
        <OpenLesson
          lesson={{
            id: lesson.id,
            startsAt: lesson.startsAt.toISOString(),
            endsAt: lesson.endsAt.toISOString(),
            learnerName: lesson.learnerName,
            lessonType: lesson.lessonType,
          }}
          shouldOpen={shouldOpen}
        >
          {summary}
        </OpenLesson>
      ) : (
        summary
      )}
      {/* Its own line: on a phone there is no room beside a lesson for two more buttons. */}
      {canAnswer && asked ? (
        <div className="flex justify-end gap-2">
          <RequestActions bookingId={lesson.id} learnerName={lesson.learnerName} />
        </div>
      ) : null}
      {canAnswer && !asked && !off && !done && started && onComplete ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onComplete}>
            <Check className="size-5" aria-hidden />
            Done
          </Button>
          {canMarkNoShow && onNoShow ? (
            <Button variant="secondary" onClick={onNoShow}>
              No show
            </Button>
          ) : null}
          {markPaid}
        </div>
      ) : null}
      {/* Paying is its own thing: a card that leaves moving and calling off to the sheet behind
          it still offers Mark paid here (D-194). */}
      {canAnswer && !asked && !off && !done && !started && (markPaid !== null || (onMove && onCancel)) ? (
        <div className="flex flex-wrap justify-end gap-2">
          {onMove && onCancel ? (
            <>
              <Button variant="secondary" onClick={onMove}>
                <CalendarClock className="size-5" aria-hidden />
                Edit lesson
              </Button>
              {/* UX: "Cancel lesson" rather than "Cancel", which reads as closing the row. */}
              <Button variant="tertiary" onClick={onCancel}>
                <X className="size-5" aria-hidden />
                Cancel lesson
              </Button>
            </>
          ) : null}
          {markPaid}
        </div>
      ) : null}
      {/* Taught, and still to be paid: paying is the one thing left to do about it. */}
      {done && markPaid ? <div className="flex flex-wrap justify-end gap-2">{markPaid}</div> : null}
    </article>
  );
}
