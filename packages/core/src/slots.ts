/**
 * Which moments a lesson can actually start (R-01 to R-04, DIA-05, DIA-06, M2-12).
 *
 * Availability says when an instructor is open. This says what is left once the lessons
 * already in the diary, the travel time between them, and the rules about how soon and how
 * far ahead somebody may book are taken into account.
 *
 * A learner is held to all of it. An instructor is held only to what the database will
 * enforce anyway, which is that two lessons cannot overlap: the rest is a warning, because
 * an instructor deciding to teach at eight on a Sunday is not a mistake (R-04).
 */

import type { DomainErrorCode } from './errors.ts';
import { localTimeToMinutes, minutesToLocalTime } from './time/calendar.ts';
import { DEFAULT_TIME_ZONE, localToUtc, utcToLocal } from './time/zone.ts';
import { clipRanges, mergeRanges, type TimeRange } from './availability.ts';

const MINUTE = 60_000;

export interface SlotRules {
  /** How long the lesson is. */
  durationMinutes: number;
  /** How often a lesson may start, on the local clock. */
  stepMinutes: number;
  /** Travel time kept after a lesson (D-001, DIA-05). */
  bufferMinutes: number;
  /** How soon before a lesson a learner may still book it (DIA-06). */
  noticeHours: number;
  /** How far ahead the diary is open to learners (DIA-06). */
  horizonWeeks: number;
}

export const slotRuleDefaults: Pick<SlotRules, 'stepMinutes'> = { stepMinutes: 30 };

export interface SlotRequest {
  startsAt: Date;
  rules: SlotRules;
  /** When an instructor is open, from `openWindows`. */
  windows: TimeRange[];
  /** What already fills the instructor's diary, each with its own travel time on the end. */
  instructorBusy?: TimeRange[];
  /** The learner's own lessons, with any instructor (R-03). */
  learnerBusy?: TimeRange[];
  now: Date;
  by: 'learner' | 'instructor';
  timeZone?: string;
}

/** The range a lesson takes out of an instructor's day: the lesson, then the travel (D-001). */
export function blockedRange(startsAt: Date, durationMinutes: number, bufferMinutes: number): TimeRange {
  return {
    startsAt,
    endsAt: new Date(startsAt.getTime() + (durationMinutes + bufferMinutes) * MINUTE),
  };
}

export function lessonRange(startsAt: Date, durationMinutes: number): TimeRange {
  return { startsAt, endsAt: new Date(startsAt.getTime() + durationMinutes * MINUTE) };
}

function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.startsAt.getTime() < b.endsAt.getTime() && a.endsAt.getTime() > b.startsAt.getTime();
}

function inside(range: TimeRange, windows: TimeRange[]): boolean {
  return windows.some(
    (window) =>
      window.startsAt.getTime() <= range.startsAt.getTime() && window.endsAt.getTime() >= range.endsAt.getTime(),
  );
}

/**
 * Why this moment cannot be booked, or null when it can. The order is the order a person
 * would say them in: is it free, is it soon enough, is it too far off, are they open.
 */
export function slotProblem(request: SlotRequest): DomainErrorCode | null {
  const { startsAt, rules, now, by } = request;
  const lesson = lessonRange(startsAt, rules.durationMinutes);
  const blocked = blockedRange(startsAt, rules.durationMinutes, rules.bufferMinutes);

  if ((request.instructorBusy ?? []).some((busy) => overlaps(blocked, busy))) return 'SLOT_TAKEN';
  if ((request.learnerBusy ?? []).some((busy) => overlaps(lesson, busy))) return 'LEARNER_BUSY';

  // An instructor books what they like in their own diary, as long as it is free (R-04).
  if (by === 'instructor') return null;

  if (startsAt.getTime() < now.getTime() + rules.noticeHours * 60 * MINUTE) return 'NOTICE_TOO_SHORT';
  if (startsAt.getTime() > now.getTime() + rules.horizonWeeks * 7 * 24 * 60 * MINUTE) return 'BEYOND_HORIZON';
  if (!inside(lesson, mergeRanges(request.windows))) return 'OUTSIDE_AVAILABILITY';

  return null;
}

/** What an instructor is told before they book something unusual, rather than refused. */
export function slotWarnings(request: SlotRequest): DomainErrorCode[] {
  if (request.by !== 'instructor') return [];
  const lesson = lessonRange(request.startsAt, request.rules.durationMinutes);
  const warnings: DomainErrorCode[] = [];
  if (!inside(lesson, mergeRanges(request.windows))) warnings.push('OUTSIDE_AVAILABILITY');
  if (request.startsAt.getTime() < request.now.getTime()) warnings.push('TOO_CLOSE');
  return warnings;
}

export interface SlotSearch extends Omit<SlotRequest, 'startsAt'> {
  /** Only look inside this stretch of time, on top of the rules. */
  within?: TimeRange;
}

/**
 * Every moment a lesson of this length could start. Starts sit on the local clock, so they
 * read as half past rather than twenty-eight minutes past, whatever the clocks have done.
 */
export function bookableSlots(search: SlotSearch): Date[] {
  const { rules, now, by, timeZone = DEFAULT_TIME_ZONE } = search;
  if (rules.durationMinutes <= 0 || rules.stepMinutes <= 0) return [];

  const earliest = by === 'learner' ? new Date(now.getTime() + rules.noticeHours * 60 * MINUTE) : now;
  const latest =
    by === 'learner'
      ? new Date(now.getTime() + rules.horizonWeeks * 7 * 24 * 60 * MINUTE)
      : new Date(now.getTime() + 52 * 7 * 24 * 60 * MINUTE);

  const bounds: TimeRange = {
    startsAt: new Date(Math.max(earliest.getTime(), search.within?.startsAt.getTime() ?? earliest.getTime())),
    endsAt: new Date(Math.min(latest.getTime(), search.within?.endsAt.getTime() ?? latest.getTime())),
  };
  if (bounds.endsAt.getTime() <= bounds.startsAt.getTime()) return [];

  const windows = clipRanges(mergeRanges(search.windows), {
    startsAt: bounds.startsAt,
    // A lesson may finish after the stretch asked for; it is the start that has to be in it.
    endsAt: new Date(bounds.endsAt.getTime() + rules.durationMinutes * MINUTE),
  });

  const slots: Date[] = [];
  for (const window of windows) {
    for (const startsAt of startsWithin(window, rules, timeZone)) {
      if (startsAt.getTime() > bounds.endsAt.getTime()) break;
      const problem = slotProblem({ ...search, startsAt });
      if (problem === null) slots.push(startsAt);
    }
  }
  return slots;
}

/** The starts on the local clock inside one window, oldest first. */
function startsWithin(window: TimeRange, rules: SlotRules, timeZone: string): Date[] {
  const starts: Date[] = [];
  const local = utcToLocal(window.startsAt, timeZone);
  const stepsIntoDay = Math.ceil(localTimeToMinutes(local.time) / rules.stepMinutes);

  // Working hours never cross midnight, so one day of steps covers any window.
  for (let minutes = stepsIntoDay * rules.stepMinutes; minutes < 24 * 60; minutes += rules.stepMinutes) {
    const startsAt = localToUtc(local.date, minutesToLocalTime(minutes), timeZone);
    // A start the clocks skipped is not a time anybody can turn up at.
    if (startsAt === null) continue;
    if (startsAt.getTime() < window.startsAt.getTime()) continue;
    if (startsAt.getTime() + rules.durationMinutes * MINUTE > window.endsAt.getTime()) break;
    starts.push(startsAt);
  }
  return starts;
}
