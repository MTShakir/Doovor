import { lessonState, lessonStateLabel } from '@repo/core/diary';
import { formatDate, formatTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { StatusPill } from '@repo/ui/status-pill';
import { LessonLength } from './lesson-length';
import { MapPin } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { OpenLesson } from '@/components/lessons/lesson-details';
import type { TeachingLesson } from '@/lib/lessons/teaching';
import { upcomingStep } from '@/lib/lessons/upcoming';

/**
 * The lessons after today, under Today's own (DIA-04, D-167): the next few, each opening its
 * sheet, and more five at a time. A link, so it works before the page has come alive.
 */
export function UpcomingLessons({ lessons, more, shown }: { lessons: TeachingLesson[]; more: boolean; shown: number }) {
  if (lessons.length === 0) {
    return <p className="text-small text-grey-700">Nothing booked after today yet.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <ol className="divide-y divide-grey-200 rounded-card border border-grey-200 bg-white" aria-label="Upcoming lessons">
        {lessons.map((lesson) => {
          const startsAt = new Date(lesson.startsAt);
          return (
            <li key={lesson.id}>
              <OpenLesson
                lesson={{
                  id: lesson.id,
                  startsAt: lesson.startsAt,
                  endsAt: lesson.endsAt,
                  learnerName: lesson.learnerName,
                  lessonType: lesson.lessonType,
                }}
                className="flex flex-wrap items-start gap-3 rounded-none px-4 py-3 hover:bg-grey-100"
              >
                <span className="flex w-24 shrink-0 flex-col gap-1 text-small font-semibold text-ink tabular-nums">
                  <span>
                    {formatDate(startsAt)}
                    <span className="block font-normal text-grey-700">{formatTime(startsAt)}</span>
                  </span>
                  <LessonLength startsAt={startsAt} endsAt={new Date(lesson.endsAt)} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-body font-semibold text-black">{lesson.learnerName}</span>
                  <span className="text-small text-grey-700">{lesson.lessonType}</span>
                  {lesson.pickup ? (
                    <span className="flex items-center gap-1 text-small text-grey-700">
                      <MapPin className="size-4 shrink-0" aria-hidden />
                      {lesson.pickup.label}
                    </span>
                  ) : null}
                </span>
                <StatusPill status={lessonState(lesson.facts)}>{lessonStateLabel(lesson.facts)}</StatusPill>
              </OpenLesson>
            </li>
          );
        })}
      </ol>
      {/*
        UX: a control that looks like one. Bold black text on white reads as a heading until you
        try tapping it, and the Money screen's own "Load more" was already a grey pill, so the same
        action had two different looks in one product.
      */}
      {more ? (
        <Button variant="secondary" width="full" asChild>
          <Link href={`/app/instructor?upcoming=${String(shown + upcomingStep)}` as Route} scroll={false}>
            Show more
          </Link>
        </Button>
      ) : null}
    </div>
  );
}
