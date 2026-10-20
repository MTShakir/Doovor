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

/** What a profile is called (D-269). */
export interface ProfileNames {
  /** The heading: an independent instructor's Business name, or a school instructor's own name. */
  main: string;
  /** Their own name, small above the heading, where the heading is another name. */
  personal: string | null;
}

/**
 * An independent instructor's profile goes by their Business name, with their own name small
 * above it (D-269), unless the two are the same. An instructor at a school goes by their own
 * name: they all work for the school, and the school has a profile of its own.
 */
export function profileNames(personName: string, business: { name: string; type: 'independent' | 'school' }): ProfileNames {
  if (business.type !== 'independent') return { main: personName, personal: null };
  const same = business.name.trim().toLowerCase() === personName.trim().toLowerCase();
  return same ? { main: personName, personal: null } : { main: business.name, personal: personName };
}

/** The whole pass gallery of a profile, on a page of its own under it (PUB-06, D-268). */
export function instructorGalleryPath(citySlug: string | null, slug: string): string {
  return `${instructorProfilePath(citySlug, slug)}/gallery`;
}

/** A school's whole pass gallery, every instructor's (PUB-06, D-268). */
export function schoolGalleryPath(citySlug: string | null, slug: string): string {
  return `${schoolProfilePath(citySlug, slug)}/gallery`;
}

/** What stands in for a photo: the first letters of the first and last names. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
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

/**
 * Where lessons can start, in one sentence. Without a base there is no distance to give, because
 * the miles are only the setting's starting value until a base is set: just the districts they
 * added, or nothing at all (D-307).
 */
export function coverageWords({ radiusMiles, outcode, alsoCovers }: Coverage): string | null {
  if (outcode === null) return alsoCovers.length === 0 ? null : `Lessons in ${joinWords(alsoCovers)}.`;
  const miles = radiusMiles === 1 ? '1 mile' : `${String(radiusMiles)} miles`;
  const around = `Lessons within ${miles} of ${outcode}`;
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
