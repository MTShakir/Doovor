import { lessonState } from '@repo/core/diary';
import { formatPence } from '@repo/core/money';
import { formatTime } from '@repo/core/time';
import { StatusPill } from '@repo/ui/status-pill';
import { MapPin } from 'lucide-react';
import type { DiaryEntry } from '@/lib/diary/lessons';

/**
 * One lesson, as it appears in the day and week views (DIA-03, DIA-04). The time is the
 * first thing read, then who it is with, then whether it has been paid for.
 */
export function LessonRow({ lesson, showInstructor = false }: { lesson: DiaryEntry; showInstructor?: boolean }) {
  const state = lessonState(lesson.facts);
  const off = state === 'cancelled';

  return (
    <article
      className={`flex items-start gap-3 px-4 py-3 ${off ? 'opacity-60' : ''}`}
      aria-label={`${formatTime(lesson.startsAt)} ${lesson.learnerName}`}
    >
      <span className="w-14 shrink-0 text-small font-semibold text-ink tabular-nums">
        {formatTime(lesson.startsAt)}
        <span className="block font-normal text-grey-700">{formatTime(lesson.endsAt)}</span>
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className={`text-body font-semibold text-black ${off ? 'line-through' : ''}`}>{lesson.learnerName}</span>
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
        <span className="text-small text-grey-700 tabular-nums">{formatPence(lesson.pricePence)}</span>
      </span>
    </article>
  );
}
