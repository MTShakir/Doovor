import { todayInZone, type LocalDate } from '@repo/core/time';
import { startOfMonth } from '@/lib/diary/range';

interface Dated {
  startsAt: string;
}

/** The day a lesson is on, as the learner's calendar has it: the day in the UK. */
export function lessonDay(startsAt: string): LocalDate {
  return todayInZone(new Date(startsAt));
}

/** The days with a lesson, for the calendar's dots (PRD 8.2, D-170). */
export function lessonDays(lessons: readonly Dated[]): Set<LocalDate> {
  return new Set(lessons.map((lesson) => lessonDay(lesson.startsAt)));
}

/** One day's lessons, in the order they come. */
export function lessonsOn<T extends Dated>(lessons: readonly T[], date: LocalDate): T[] {
  return lessons
    .filter((lesson) => lessonDay(lesson.startsAt) === date)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** The first day in a month with a lesson, or null for a month with none. */
export function firstLessonDayIn(lessons: readonly Dated[], month: LocalDate): LocalDate | null {
  const days = [...lessonDays(lessons)].filter((day) => startOfMonth(day) === month).sort();
  return days[0] ?? null;
}

/**
 * Where the calendar opens (D-170): on the next lesson's day, in its month, so the first thing it
 * shows is the lesson coming up, even when that is next month. With nothing booked, on today.
 */
export function calendarOpensOn(lessons: readonly Dated[], today: LocalDate): { month: LocalDate; selected: LocalDate } {
  const next = [...lessonDays(lessons)].sort()[0];
  const selected = next ?? today;
  return { month: startOfMonth(selected), selected };
}
