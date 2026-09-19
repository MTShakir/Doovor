'use client';

import { formatCalendarDate, type LocalDate } from '@repo/core/time';
import { Card } from '@repo/ui/card';
import { ListDivider } from '@repo/ui/list-row';
import { MonthCalendar } from '@repo/ui/month-calendar';
import { Fragment, useId, useMemo, useState, type ReactNode } from 'react';
import { calendarOpensOn, firstLessonDayIn, lessonDays, lessonsOn } from '@/lib/learner/calendar';

export interface CalendarLesson {
  id: string;
  startsAt: string;
  /** The lesson as the list draws it, so a day on the calendar lists it the same way. */
  row: ReactNode;
}

/** What is under the month: how many lessons the day has, or why there are none. */
function summary(total: number, selected: LocalDate | null, onDay: number): string {
  if (total === 0) return 'No lessons booked. When your instructor books one, or you do, it appears here.';
  if (selected === null) return 'Turn to another month to see the lessons in it.';
  if (onDay === 0) return 'Nothing booked on this day.';
  return onDay === 1 ? '1 lesson' : `${String(onDay)} lessons`;
}

/**
 * A learner's lessons to come on a month calendar (PRD 8.2, D-170): a dot on each day with a
 * lesson, and the chosen day's lessons under the month, drawn as the list draws them, so one can
 * be paid for or cancelled from here too. It opens on the next lesson.
 */
export function LessonsCalendar({ lessons, today }: { lessons: CalendarLesson[]; today: LocalDate }) {
  const headingId = useId();
  const [shown, setShown] = useState<{ month: LocalDate; selected: LocalDate | null }>(() => calendarOpensOn(lessons, today));
  const marked = useMemo(() => lessonDays(lessons), [lessons]);
  const onDay = shown.selected === null ? [] : lessonsOn(lessons, shown.selected);

  return (
    <div className="flex flex-col gap-4 md:grid md:grid-cols-2 md:items-start md:gap-6">
      <Card>
        <MonthCalendar
          month={shown.month}
          // A month turned to opens on its first lesson, so what shows under it belongs to it.
          onMonthChange={(month) => { setShown({ month, selected: firstLessonDayIn(lessons, month) }); }}
          selected={shown.selected}
          onSelect={(selected) => { setShown((current) => ({ ...current, selected })); }}
          today={today}
          // It shows what is to come; what has happened is under Before now.
          isDisabled={(date) => date < today}
          marked={marked}
        />
      </Card>
      <section className="flex flex-col gap-2" aria-labelledby={headingId}>
        <h3 id={headingId} className="text-h3 text-black">
          {shown.selected === null ? 'Nothing booked this month' : formatCalendarDate(shown.selected, { year: false })}
        </h3>
        <p className="text-small text-grey-700" aria-live="polite">
          {summary(lessons.length, shown.selected, onDay.length)}
        </p>
        {onDay.length === 0 ? null : (
          <Card padding="none">
            {onDay.map((lesson, index) => (
              <Fragment key={lesson.id}>
                {index === 0 ? null : <ListDivider />}
                {lesson.row}
              </Fragment>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
