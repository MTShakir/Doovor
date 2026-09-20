/**
 * A lesson on the instructor's phone, from starting it to its record (PRG-01, PRG-09, PRD 7.5,
 * M4-04, M4-05).
 *
 * Which lesson the big button on Today means, how long a lesson has been running, and which
 * lessons still need their record. Nothing here needs a network, because all of it has to work
 * with no signal in a car park.
 */

import type { BookingStatus } from './diary.ts';

export interface DayLesson {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: BookingStatus;
  /** Whether its record has been saved, here or on its way from this phone. */
  recorded: boolean;
}

const goingAhead: ReadonlySet<BookingStatus> = new Set(['confirmed', 'in_progress']);

/** How long before a lesson its card offers to start it (D-178). */
export const startWindowMinutes = 15;

/**
 * The next lesson of the day: the one under way, or the first still to come, and only one that is
 * going ahead (PRD 7.5, D-190). A lesson that has ended is behind them, whatever else the day holds.
 */
export function nextLesson<L extends DayLesson>(lessons: readonly L[], now: Date): L | null {
  const ahead = lessons
    .filter((lesson) => goingAhead.has(lesson.status) && lesson.endsAt.getTime() > now.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  return ahead[0] ?? null;
}

/**
 * The lesson "Start lesson" means (PRD 7.5, D-178): the next one, once it is a quarter of an hour
 * away or less. Earlier in the day there is nothing to start yet.
 */
export function lessonToStart<L extends DayLesson>(lessons: readonly L[], now: Date): L | null {
  const next = nextLesson(lessons, now);
  return next !== null && next.startsAt.getTime() <= now.getTime() + startWindowMinutes * 60 * 1000 ? next : null;
}

/**
 * A lesson that has started, was taught or is being taught, and has no record yet (PRD 10.2
 * step 3). Called off, not turned up to and not yet started are not lessons to record.
 */
export function needsRecord(lesson: DayLesson, now: Date): boolean {
  if (lesson.recorded) return false;
  if (lesson.startsAt.getTime() > now.getTime()) return false;
  return goingAhead.has(lesson.status) || lesson.status === 'completed';
}

/** How long something has been running, as a clock shows it: "0:07", "12:34", "1:02:03". */
export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${String(hours)}:${pad(minutes)}:${pad(rest)}` : `${String(minutes)}:${pad(rest)}`;
}
