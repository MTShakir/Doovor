import { foundingTermWords } from '@repo/core/founding';
import type { FoundingPlaces } from './founding';

/**
 * The page the printed pieces open (PRD 8.3, 9.18, D-404). The business card, the leaflet and the
 * flyer each carry a QR code for /join with a utm_source of their own. Every one of them lands on
 * the same page, with the same opening as anybody who came another way (D-412), and where somebody
 * came from is still carried on to sign-up, so each piece is still counted.
 */

/**
 * The utm_source somebody arrived with, when it is a plain word: card, leaflet, flyer, linkedin.
 * Anything else is nobody's business to carry on, and is dropped.
 */
export function arrivalSource(search: string): string | null {
  const value = (new URLSearchParams(search).get('utm_source') ?? '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(value) ? value : null;
}

/**
 * A sign-up address that carries on where somebody came from. Nothing records it on the account:
 * the counting reads it from the address of the page it is on, so a sign-up that began with a scan
 * is counted against the piece that was scanned, for whoever has said yes to being counted.
 */
export function withArrivalSource(href: string, source: string | null): string {
  if (source === null) return href;
  return `${href}${href.includes('?') ? '&' : '?'}utm_source=${encodeURIComponent(source)}`;
}

/** "a year" for the twelve months of the offer, as the card says it, and the months otherwise. */
export function offerTermWords(months: number): string {
  return foundingTermWords(months).replace(/^1 /, 'a ');
}

/** The words the page opens on. */
export interface JoinOpening {
  /** The headline, with the words that matter kept apart, to underline them (D-411). */
  title: { before: string; marked: string };
  description: string;
}

/**
 * The page's opening, the same for everybody, whichever piece they scanned (D-412): who it is for
 * and that it is better (D-410), then what it does.
 */
export const joinOpening: JoinOpening = {
  title: { before: 'The better way for ', marked: 'UK driving instructors.' },
  description: 'Less admin. More lessons. Paid on time. Learners book and pay from your own link, straight to your own account.',
};

/** The button's words: the offer's own while it is open, plain ones once it has closed (D-251). */
export function joinActionWords(places: FoundingPlaces | null): string {
  return places !== null && !places.instructors.full ? 'Claim your founding place' : 'Create your free account';
}
