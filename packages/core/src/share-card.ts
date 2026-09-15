/**
 * The image a shared public page shows (PRD 14.6, M5-08): drawn 1200 by 630 for the preview a link
 * gets in WhatsApp, Facebook, LinkedIn and search. The words are here, from the same helpers the
 * pages use, so the picture always says what the page says; the app draws it.
 */

import { formatPence } from './money.ts';
import { placeHeading, type PlacePage } from './places.ts';
import { initialsFor, qualificationWords } from './public-profile.ts';
import { transmissions, type Transmission } from './schemas/profile.ts';
import type { Qualification } from './schemas/onboarding.ts';

/** The size link previews expect: 1.91 to 1. */
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 } as const;

export interface ShareCard {
  /** Above the title: what, and where. */
  eyebrow: string;
  title: string;
  /** The facts somebody decides on first, each drawn as a pill. */
  facts: readonly string[];
  /** A person or a school: their photo, or their initials without one. A place has none. */
  picture: { initials: string; photoUrl: string | null; verified: boolean } | null;
  /** What the page is for, drawn as its button. */
  action: string;
  /** The button says there is nothing to do yet, so it is drawn quietly. */
  paused: boolean;
}

function fromHourly(pence: number | null): string[] {
  return pence === null ? [] : [`From ${formatPence(pence)} an hour`];
}

function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

export interface InstructorCardFacts {
  name: string;
  qualification: Qualification;
  transmission: Transmission;
  cityName: string | null;
  hourlyFromPence: number | null;
  takingBookings: boolean;
  photoUrl: string | null;
}

/** An instructor, as the top of their profile shows them. Every public profile is a checked one. */
export function instructorShareCard(facts: InstructorCardFacts): ShareCard {
  return {
    eyebrow: facts.cityName === null ? 'Driving instructor' : `Driving instructor in ${facts.cityName}`,
    title: facts.name,
    facts: [
      qualificationWords(facts.qualification),
      transmissions.find((one) => one.value === facts.transmission)?.label ?? facts.transmission,
      ...fromHourly(facts.hourlyFromPence),
    ],
    picture: { initials: initialsFor(facts.name), photoUrl: facts.photoUrl, verified: true },
    action: facts.takingBookings ? 'Book a lesson' : 'Not taking new bookings',
    paused: !facts.takingBookings,
  };
}

export interface SchoolCardFacts {
  name: string;
  cityName: string | null;
  /** The instructors its page lists. */
  instructorCount: number;
  hourlyFromPence: number | null;
  logoUrl: string | null;
}

/** A school, with how many instructors a learner can choose from on its page. */
export function schoolShareCard(facts: SchoolCardFacts): ShareCard {
  return {
    eyebrow: facts.cityName === null ? 'Driving school' : `Driving school in ${facts.cityName}`,
    title: facts.name,
    facts: [...(facts.instructorCount === 0 ? [] : [count(facts.instructorCount, 'instructor', 'instructors')]), ...fromHourly(facts.hourlyFromPence)],
    picture: { initials: initialsFor(facts.name), photoUrl: facts.logoUrl, verified: false },
    action: 'Choose an instructor',
    paused: false,
  };
}

export interface PlaceCardFacts extends PlacePage {
  instructorCount: number;
}

/** A city, area or automatic page, by its heading. */
export function placeShareCard(facts: PlaceCardFacts): ShareCard {
  return {
    eyebrow: facts.cityName,
    title: placeHeading(facts),
    facts:
      facts.instructorCount === 0
        ? ['No instructors listed yet']
        : [`${count(facts.instructorCount, 'instructor', 'instructors')} checked by us`, 'Prices and free times'],
    picture: null,
    action: 'Find an instructor',
    paused: false,
  };
}

/**
 * A short tag that changes whenever anything the card draws does (FNV-1a over the card). The
 * image's address carries it, so a preview that kept an old picture fetches the new one, and the
 * picture at any one address can be kept for a long time.
 */
export function shareCardVersion(card: ShareCard): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(card)) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}
