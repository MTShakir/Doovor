import { formatDateTime, formatTime, todayInZone } from '@repo/core/time';
import type { TeachingLesson } from '@/lib/lessons/teaching';
import type { KeptDay } from './kept-days';

/**
 * What Today shows where there is no signal (PRG-09, PRD 8.1, M4-10).
 *
 * With signal, Today is what the server just put together. Without it, the screen on the phone may
 * be a copy from hours ago, even from yesterday, so the lessons come from the phone's own copy of
 * the day when it has one, and "next" and "needs its record" are worked out from the phone's clock.
 */

export interface TodayView {
  lessons: TeachingLesson[];
  /** The moment "next lesson" and "needs its record" are worked out from. */
  now: string;
  /** When the lessons shown were read, with no signal; null with signal. */
  readAt: string | null;
}

export interface TodayInputs {
  online: boolean;
  /** The lessons and moment the page arrived with, from the server or from a kept copy of it. */
  page: { lessons: TeachingLesson[]; now: string };
  /** The phone's kept copy of the day it is on the phone, once read, or null before. */
  kept: KeptDay | null;
  phoneNow: Date;
}

export function todayView({ online, page, kept, phoneNow }: TodayInputs): TodayView {
  if (online) return { lessons: page.lessons, now: page.now, readAt: null };
  // A kept copy of this very day beats a page that may be from another day or an earlier hour.
  const keptToday = kept !== null && kept.covered && kept.at !== null;
  if (keptToday) return { lessons: kept.lessons, now: phoneNow.toISOString(), readAt: kept.at };
  return { lessons: page.lessons, now: phoneNow.toISOString(), readAt: page.now };
}

/** "Lessons as of 14:02", or with the day when that was not today. */
export function readAtLabel(readAt: string, phoneNow: Date): string {
  const read = new Date(readAt);
  return todayInZone(read) === todayInZone(phoneNow) ? `Lessons as of ${formatTime(read)}` : `Lessons as of ${formatDateTime(read)}`;
}
