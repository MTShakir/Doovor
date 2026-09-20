'use client';

import { lessonState, lessonStateLabel } from '@repo/core/diary';
import { lessonToStart, needsRecord, nextLesson } from '@repo/core/lesson-records';
import { formatTime } from '@repo/core/time';
import { Button } from '@repo/ui/button';
import { StatusPill } from '@repo/ui/status-pill';
import { Check, CloudUpload, MapPin, Navigation, NotebookPen } from 'lucide-react';
import Link from 'next/link';
import { directionsTo, OpenLesson } from '@/components/lessons/lesson-details';
import { StartLessonButton } from '@/components/lessons/start-lesson';
import type { TeachingLesson } from '@/lib/lessons/teaching';

export interface TodayLessonsProps {
  lessons: TeachingLesson[];
  /** When the page was put together, so the server and the phone agree what "next" is. */
  now: string;
  /**
   * With no signal, a lesson opens as a whole page the service worker can answer, rather than as
   * data the app fetches from the server, which would never arrive (M4-10).
   */
  plainLinks?: boolean;
  /** Lessons whose record is saved on the phone and waiting to be sent: as good as recorded (M4-11). */
  waiting?: ReadonlySet<string>;
}

/**
 * Today, for an instructor (PRD 7.5, 10.2, M4-04, D-178): the day's lessons top to bottom, each
 * with where to go and whether it is paid. The lesson about to be taught carries Start lesson on
 * its own card, from a quarter of an hour before it until it ends. A lesson that has been taught
 * and has no record yet says so, since writing it is the one thing left to do.
 */
export function TodayLessons({ lessons, now, plainLinks = false, waiting = new Set<string>() }: TodayLessonsProps) {
  const moment = new Date(now);
  const Go = plainLinks ? 'a' : Link;
  const dayLessons = lessons.map((lesson) => ({
    ...lesson,
    recorded: lesson.recorded || waiting.has(lesson.id),
    startsAt: new Date(lesson.startsAt),
    endsAt: new Date(lesson.endsAt),
    status: lesson.facts.status,
  }));
  const starting = lessonToStart(dayLessons, moment);
  // Where to drive to is only ever a question about the lesson they are going to next, so the
  // day does not carry a row of identical buttons down the screen (D-190).
  const next = nextLesson(dayLessons, moment);

  return (
    <div className="flex flex-col gap-4">
      <ol className="divide-y divide-grey-200 rounded-card border border-grey-200 bg-white" aria-label="Today's lessons">
        {dayLessons.map((lesson) => {
          const state = lessonState(lesson.facts);
          const off = state === 'cancelled';
          const route = lesson.pickup ? directionsTo(lesson.pickup) : null;
          const toRecord = needsRecord(lesson, moment);
          const toStart = starting?.id === lesson.id;
          const toDrive = route !== null && next?.id === lesson.id;
          return (
            <li key={lesson.id}>
              <article className="flex flex-col gap-2 px-4 py-3" aria-label={`${formatTime(lesson.startsAt)} ${lesson.learnerName}`}>
                <OpenLesson
                  lesson={{
                    id: lesson.id,
                    startsAt: lesson.startsAt.toISOString(),
                    endsAt: lesson.endsAt.toISOString(),
                    learnerName: lesson.learnerName,
                    lessonType: lesson.lessonType,
                  }}
                >
                  <span className="flex flex-wrap items-start gap-3">
                    <span className="w-14 shrink-0 text-small font-semibold text-ink tabular-nums">
                      {formatTime(lesson.startsAt)}
                      <span className="block font-normal text-grey-700">{formatTime(lesson.endsAt)}</span>
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className={`text-body font-semibold ${off ? 'text-grey-700 line-through' : 'text-black'}`}>{lesson.learnerName}</span>
                      <span className="text-small text-grey-700">{lesson.lessonType}</span>
                      {lesson.pickup ? (
                        <span className="flex items-center gap-1 text-small text-grey-700">
                          <MapPin className="size-4 shrink-0" aria-hidden />
                          {lesson.pickup.label}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <StatusPill status={state}>{lessonStateLabel(lesson.facts)}</StatusPill>
                      {waiting.has(lesson.id) ? (
                        <span className="flex items-center gap-1 text-small text-grey-700">
                          <CloudUpload className="size-4" aria-hidden />
                          Waiting to send
                        </span>
                      ) : lesson.recorded ? (
                        <span className="flex items-center gap-1 text-small text-grey-700">
                          <Check className="size-4" aria-hidden />
                          Recorded
                        </span>
                      ) : null}
                    </span>
                  </span>
                </OpenLesson>
                {!off && (toDrive || toRecord || toStart) ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    {toStart ? <StartLessonButton bookingId={lesson.id} plainLinks={plainLinks} /> : null}
                    {toRecord ? (
                      <Button asChild variant="secondary">
                        <Go href={`/app/instructor/lessons/${lesson.id}?record=1`}>
                          <NotebookPen className="size-5" aria-hidden />
                          Write record
                        </Go>
                      </Button>
                    ) : null}
                    {toDrive ? (
                      <Button asChild variant="secondary">
                        <a href={route} target="_blank" rel="noreferrer">
                          <Navigation className="size-5" aria-hidden />
                          Navigate
                        </a>
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
