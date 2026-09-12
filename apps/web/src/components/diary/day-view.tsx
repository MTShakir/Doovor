import { gapsBetween, teachingMinutes } from '@repo/core/diary';
import { formatTime } from '@repo/core/time';
import { EmptyState } from '@repo/ui/empty-state';
import { CalendarX } from 'lucide-react';
import type { DiaryEntry } from '@/lib/diary/lessons';
import { LessonRow } from './lesson-row';

/** How much of the day is taught, in the words a person would use. */
export function hoursTaught(minutes: number): string {
  if (minutes === 0) return 'Nothing booked';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const hourText = hours === 1 ? '1 hour' : `${String(hours)} hours`;
  if (hours === 0) return `${String(rest)} minutes`;
  return rest === 0 ? hourText : `${hourText} ${String(rest)} minutes`;
}

export interface DayViewProps {
  lessons: DiaryEntry[];
  /** The hours worked that day, for the gaps between lessons. */
  opens: Date | null;
  closes: Date | null;
  showInstructor?: boolean;
}

/** The day, top to bottom: what is on, and the gaps between (DIA-03, M1-19). */
export function DayView({ lessons, opens, closes, showInstructor = false }: DayViewProps) {
  if (lessons.length === 0) {
    return (
      <EmptyState
        icon={CalendarX}
        title="Nothing booked"
        description={opens ? 'You are free all day. Time to fill it.' : 'You do not work this day.'}
      />
    );
  }

  const gaps = opens && closes ? gapsBetween(lessons, opens, closes) : [];
  const gapAfter = new Map(gaps.map((gap) => [gap.startsAt.getTime(), gap]));
  const taught = teachingMinutes(lessons);

  return (
    <div className="flex flex-col gap-3">
      <p className="px-4 text-small text-grey-700 md:px-0">
        {lessons.length === 1 ? '1 lesson' : `${String(lessons.length)} lessons`}, {hoursTaught(taught).toLowerCase()}
      </p>
      <ul className="divide-y divide-grey-200 rounded-card border border-grey-200 bg-white">
        {lessons.map((lesson) => {
          const gap = gapAfter.get(lesson.endsAt.getTime());
          return (
            <li key={lesson.id}>
              <LessonRow lesson={lesson} showInstructor={showInstructor} />
              {gap ? (
                <p className="border-t border-dashed border-grey-200 bg-grey-100 px-4 py-2 text-small text-grey-700">
                  Free until {formatTime(gap.endsAt)}, {hoursTaught(gap.minutes).toLowerCase()}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
