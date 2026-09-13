import { gapsBetween, teachingMinutes } from '@repo/core/diary';
import { formatMinutes } from '@repo/core/time';
import { EmptyState } from '@repo/ui/empty-state';
import { CalendarX } from 'lucide-react';
import type { DiaryEntry } from '@/lib/diary/lessons';
import { DayLessons } from './day-lessons';

/** How much of the day is taught, in the words a person would use. */
export function hoursTaught(minutes: number): string {
  return minutes === 0 ? 'Nothing booked' : formatMinutes(minutes);
}

export interface DayViewProps {
  /** BOK-06: this diary belongs to somebody who may answer a request in it. */
  canAnswer?: boolean;
  /** BOK-08, BOK-09: the rules a cancellation is judged by, for the warning before one. */
  rules?: { cancellationWindowHours: number; lateFeePercent: number };
  lessons: DiaryEntry[];
  /** The hours worked that day, for the gaps between lessons. */
  opens: Date | null;
  closes: Date | null;
  showInstructor?: boolean;
  /** The moment the page was rendered (BOK-10, R-09). */
  now?: Date;
}

/** The day, top to bottom: what is on, and the gaps between (DIA-03, M1-19). */
export function DayView({ lessons, opens, closes, showInstructor = false, canAnswer = false, rules, now }: DayViewProps) {
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
  const taught = teachingMinutes(lessons);

  return (
    <div className="flex flex-col gap-3">
      <p className="px-4 text-small text-grey-700 md:px-0">
        {lessons.length === 1 ? '1 lesson' : `${String(lessons.length)} lessons`}, {hoursTaught(taught).toLowerCase()}
      </p>
      <DayLessons
        lessons={lessons}
        gaps={gaps}
        now={now ?? new Date(0)}
        showInstructor={showInstructor}
        canAnswer={canAnswer}
        rules={rules}
      />
    </div>
  );
}
