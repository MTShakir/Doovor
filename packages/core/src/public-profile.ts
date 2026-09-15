/**
 * What an instructor's public profile says, and where it lives (PUB-01, PRD 8.3, M5-02).
 *
 * The profile comes from `instructor_profile_page` in the database, which returns a fixed list
 * of fields. These are the words and the address built from them, kept here so the profile,
 * the city pages and the structured data say the same things.
 */

import type { Qualification } from './schemas/onboarding.ts';

/** The address of a profile, under the city its base is in (PRD 8.3). */
export function instructorProfilePath(citySlug: string | null, slug: string): string {
  return `/instructors/${citySlug ?? 'uk'}/${slug}`;
}

/** The address of a school's profile, under the city its base is in (PRD 8.3). */
export function schoolProfilePath(citySlug: string | null, slug: string): string {
  return `/schools/${citySlug ?? 'uk'}/${slug}`;
}

/** A trainee has to say so (R-18); both are named as a learner would know them. */
export function qualificationWords(qualification: Qualification): string {
  return qualification === 'adi' ? 'Approved driving instructor' : 'Trainee driving instructor';
}

/** "LS17, LS18 and LS19": a list as a sentence writes it. */
export function joinWords(words: readonly string[]): string {
  if (words.length <= 1) return words[0] ?? '';
  return `${words.slice(0, -1).join(', ')} and ${words.at(-1) ?? ''}`;
}

export interface Coverage {
  radiusMiles: number;
  /** The district of the instructor's base, never the postcode itself. */
  outcode: string | null;
  /** Districts added beyond the circle (COV-02). */
  alsoCovers: readonly string[];
}

/** Where lessons can start, in one sentence. */
export function coverageWords({ radiusMiles, outcode, alsoCovers }: Coverage): string {
  const miles = radiusMiles === 1 ? '1 mile' : `${String(radiusMiles)} miles`;
  const around = `Lessons within ${miles} of ${outcode ?? 'their base'}`;
  return alsoCovers.length === 0 ? `${around}.` : `${around}, and in ${joinWords(alsoCovers)}.`;
}

/**
 * The lowest price for an hour of driving across the lessons on offer, in pence, rounded up to
 * the penny so it is never lower than anything actually charged. Null when nothing is priced.
 */
export function hourlyFromPence(lessons: readonly { durationMinutes: number; pricePence: number }[]): number | null {
  const hourly = lessons
    .filter((lesson) => lesson.durationMinutes > 0)
    .map((lesson) => Math.ceil((lesson.pricePence * 60) / lesson.durationMinutes));
  return hourly.length === 0 ? null : Math.min(...hourly);
}
