import { byDay, isOff, lessonState, teachingMinutes } from '@repo/core/diary';
import { addDaysToLocalDate, formatTime, parseLocalDate, type LocalDate } from '@repo/core/time';
import { StatusPill } from '@repo/ui/status-pill';
import type { DiaryEntry } from '@/lib/diary/lessons';
import { NavLink } from '@/components/nav-link';
import { hoursTaught } from './day-view';

const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface WeekViewProps {
  /** The Monday the week starts on. */
  from: LocalDate;
  lessons: DiaryEntry[];
  /** Local dates, so a lesson lands on the day a person would say it is on. */
  dayOf: (instant: Date) => LocalDate;
  today: LocalDate;
  showInstructor?: boolean;
}

/** The week, seven columns across (DIA-03, M1-20). Stacks into days on a narrow screen. */
export function WeekView({ from, lessons, dayOf, today, showInstructor = false }: WeekViewProps) {
  const days = byDay(lessons, dayOf);
  const columns = Array.from({ length: 7 }, (_, index) => {
    const date = addDaysToLocalDate(from, index);
    return { date, name: dayNames[index] ?? '', lessons: days.get(date) ?? [] };
  });

  return (
    <ol className="grid gap-3 md:grid-cols-7 md:gap-2">
      {columns.map((column) => {
        const taught = teachingMinutes(column.lessons);
        return (
          <li key={column.date} className="flex flex-col gap-2">
            <NavLink
              href={`/app/instructor/diary?view=day&date=${column.date}`}
              aria-label={`${column.name} ${String(parseLocalDate(column.date).day)}, ${
                column.lessons.length === 0 ? 'nothing booked' : hoursTaught(taught).toLowerCase()
              }`}
              className={`flex items-baseline gap-2 rounded-input px-2 py-1 hover:bg-grey-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black ${
                column.date === today ? 'bg-black text-white hover:bg-ink' : ''
              }`}
            >
              <span className="text-small font-semibold">{column.name}</span>
              <span className="text-small tabular-nums opacity-80">{parseLocalDate(column.date).day}</span>
            </NavLink>
            <ul className="flex flex-col gap-2">
              {column.lessons.map((lesson) => {
                const state = lessonState(lesson.facts);
                return (
                  <li key={lesson.id}>
                    <article
                      className="flex flex-col gap-1 rounded-card border border-grey-200 bg-white p-2"
                      aria-label={`${formatTime(lesson.startsAt)} ${lesson.learnerName}`}
                    >
                      <span className="text-small font-semibold text-ink tabular-nums">
                        {formatTime(lesson.startsAt)}
                      </span>
                      <span
                        className={`truncate text-small ${
                          isOff(lesson.facts.status) ? 'text-grey-700 line-through' : 'text-black'
                        }`}
                      >
                        {lesson.learnerName}
                      </span>
                      {showInstructor ? (
                        <span className="truncate text-caption text-grey-700">{lesson.instructorName}</span>
                      ) : null}
                      <StatusPill status={state} className="self-start" />
                    </article>
                  </li>
                );
              })}
              {column.lessons.length === 0 ? (
                <li className="rounded-card border border-dashed border-grey-200 p-2 text-small text-grey-700">Free</li>
              ) : null}
            </ul>
          </li>
        );
      })}
    </ol>
  );
}
