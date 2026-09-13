import { lessonState } from '@repo/core/diary';
import { formatPence } from '@repo/core/money';
import { formatTime } from '@repo/core/time';
import { StatusPill } from '@repo/ui/status-pill';
import { MapPin } from 'lucide-react';
import type { DiaryEntry } from '@/lib/diary/lessons';
import { LessonActions } from './lesson-actions';
import { RequestActions } from './request-actions';

/**
 * One lesson, as it appears in the day and week views (DIA-03, DIA-04). The time is the
 * first thing read, then who it is with, then whether it has been paid for.
 */
export function LessonRow({
  lesson,
  showInstructor = false,
  canAnswer = false,
  rules,
}: {
  lesson: DiaryEntry;
  showInstructor?: boolean;
  /** BOK-06: somebody who may accept or decline a request is looking at it. */
  canAnswer?: boolean;
  /** BOK-08, BOK-09: what moving or cancelling this lesson would mean. */
  rules?: { cancellationWindowHours: number; lateFeePercent: number };
}) {
  const state = lessonState(lesson.facts);
  const off = state === 'cancelled';
  const asked = lesson.facts.status === 'requested';

  return (
    <article
      className={`flex flex-col gap-2 px-4 py-3 ${off ? 'opacity-60' : ''}`}
      aria-label={`${formatTime(lesson.startsAt)} ${lesson.learnerName}`}
    >
      <div className="flex items-start gap-3">
        <span className="w-14 shrink-0 text-small font-semibold text-ink tabular-nums">
          {formatTime(lesson.startsAt)}
          <span className="block font-normal text-grey-700">{formatTime(lesson.endsAt)}</span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={`text-body font-semibold text-black ${off ? 'line-through' : ''}`}>
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
        <span className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill status={state} />
          <span className="text-small text-grey-700 tabular-nums">
            {formatPence(lesson.pricePence)}
          </span>
        </span>
      </div>
      {/* Its own line: on a phone there is no room beside a lesson for two more buttons. */}
      {canAnswer && asked ? (
        <div className="flex justify-end gap-2">
          <RequestActions bookingId={lesson.id} learnerName={lesson.learnerName} />
        </div>
      ) : null}
      {canAnswer && !asked && !off && rules ? (
        <div className="flex justify-end gap-2">
          <LessonActions
            bookingId={lesson.id}
            learnerName={lesson.learnerName}
            startsAt={lesson.startsAt.toISOString()}
            durationMinutes={Math.round((lesson.endsAt.getTime() - lesson.startsAt.getTime()) / 60_000)}
            pricePence={lesson.pricePence}
            cancellationWindowHours={rules.cancellationWindowHours}
            lateFeePercent={rules.lateFeePercent}
          />
        </div>
      ) : null}
    </article>
  );
}
