/**
 * Suggesting an instructor for a learner at a school (SCH-03, LRN-06, M5-14).
 *
 * The database gathers the facts for each instructor: whether their badge is checked and in date,
 * the gearbox they teach, how far their base is from the learner, how far they travel, and their
 * open and free time over the next two weeks, which is how far ahead most lessons are booked. This
 * decides the order and says why, in words an owner reads at a glance. Somebody who does not teach
 * the learner's gearbox is never suggested; they can still be chosen by hand.
 */

import type { Transmission } from './schemas/profile.ts';

/** Less free time than one lesson is no free time. */
const SMALLEST_LESSON_MINUTES = 60;

export interface AllocationLearner {
  /** The gearbox the learner wants, or null when they have not said. */
  transmission: 'manual' | 'automatic' | null;
  /** Their postcode district, such as LS6, for the words. Null without a postcode. */
  outcode: string | null;
}

export type BadgeState = 'checked' | 'unchecked' | 'expired';

export interface AllocationInstructor {
  instructorId: string;
  name: string;
  /** Checked by the platform and in date (INS-02, INS-03). */
  badge: BadgeState;
  transmission: Transmission;
  /** Miles from the learner's postcode to the instructor's base. Null when either is unknown. */
  distanceMiles: number | null;
  radiusMiles: number;
  /** In the next two weeks: open for lessons, and booked. */
  openMinutes: number;
  freeMinutes: number;
}

export type AreaFit = 'covers' | 'unknown' | 'outside';

export interface Suggestion {
  instructorId: string;
  name: string;
  area: AreaFit;
  freeMinutes: number;
  /** Why they are where they are, most important first. */
  reasons: string[];
}

export function teachesGearbox(instructor: Transmission, learner: AllocationLearner['transmission']): boolean {
  return learner === null || instructor === 'both' || instructor === learner;
}

function miles(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return 'under 0.1 miles';
  return rounded === 1 ? '1 mile' : `${String(rounded)} miles`;
}

function hours(minutes: number): string {
  const whole = Math.floor(minutes / 60);
  return whole === 1 ? '1 free hour' : `${String(whole)} free hours`;
}

function areaFit(instructor: AllocationInstructor): AreaFit {
  if (instructor.distanceMiles === null) return 'unknown';
  return instructor.distanceMiles <= instructor.radiusMiles ? 'covers' : 'outside';
}

const areaOrder: Record<AreaFit, number> = { covers: 0, unknown: 1, outside: 2 };

function gearboxReason(transmission: Transmission): string {
  return transmission === 'both' ? 'Teaches manual and automatic' : `Teaches ${transmission}`;
}

function areaReason(instructor: AllocationInstructor, learner: AllocationLearner): string {
  const fit = areaFit(instructor);
  if (fit === 'unknown') return learner.outcode === null ? 'The learner has no postcode yet' : 'No base postcode set yet';
  const distance = miles(instructor.distanceMiles ?? 0);
  if (fit === 'covers') return learner.outcode ? `Covers ${learner.outcode}, ${distance} away` : `${distance} away, inside their area`;
  return `${distance} away, beyond the ${miles(instructor.radiusMiles)} they travel`;
}

function badgeReason(badge: BadgeState): string | null {
  if (badge === 'unchecked') return 'Badge not checked yet';
  if (badge === 'expired') return 'Badge out of date';
  return null;
}

function capacityReason(instructor: AllocationInstructor): string {
  if (instructor.openMinutes <= 0) return 'No working hours in the next 2 weeks';
  if (instructor.freeMinutes < SMALLEST_LESSON_MINUTES) return 'Fully booked for the next 2 weeks';
  return `${hours(instructor.freeMinutes)} in the next 2 weeks`;
}

/**
 * The instructors worth suggesting, best first: those who teach the learner's gearbox, then those
 * whose badge is checked and in date, then by whether they cover the learner's area, whether they
 * have time for a lesson, how much time they have, how near they are, and finally by name so the
 * order never shuffles.
 */
export function suggestInstructors(learner: AllocationLearner, instructors: AllocationInstructor[]): Suggestion[] {
  return instructors
    .filter((one) => teachesGearbox(one.transmission, learner.transmission))
    .map((one) => ({ one, area: areaFit(one), hasTime: one.freeMinutes >= SMALLEST_LESSON_MINUTES }))
    .sort(
      (a, b) =>
        Number(b.one.badge === 'checked') - Number(a.one.badge === 'checked') ||
        areaOrder[a.area] - areaOrder[b.area] ||
        Number(b.hasTime) - Number(a.hasTime) ||
        b.one.freeMinutes - a.one.freeMinutes ||
        (a.one.distanceMiles ?? Number.POSITIVE_INFINITY) - (b.one.distanceMiles ?? Number.POSITIVE_INFINITY) ||
        a.one.name.localeCompare(b.one.name, 'en-GB'),
    )
    .map(({ one, area }) => ({
      instructorId: one.instructorId,
      name: one.name,
      area,
      freeMinutes: one.freeMinutes,
      reasons: [badgeReason(one.badge), areaReason(one, learner), capacityReason(one), gearboxReason(one.transmission)].filter(
        (reason): reason is string => reason !== null,
      ),
    }));
}
