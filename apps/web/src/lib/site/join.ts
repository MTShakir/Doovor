import { foundingTermWords, type FoundingProgress } from '@repo/core/founding';
import type { FoundingPlaces } from './founding';

/**
 * The page the printed pieces open (PRD 8.3, 9.18, D-404). The business card, the leaflet and the
 * flyer each carry a QR code for /join with a utm_source of their own, and the page opens on the
 * words the piece itself ended on, so whoever scanned it knows straight away they are in the right
 * place. Anybody else, with a link or the address typed in, gets the page's own opening.
 */

export const printedPieces = ['card', 'leaflet', 'flyer'] as const;

export type PrintedPiece = (typeof printedPieces)[number];

export type JoinHookKey = PrintedPiece | 'default';

/** Where the opening says which piece was scanned, for the stylesheet to read. */
export const joinHookAttribute = 'data-join-hook';

/**
 * The utm_source somebody arrived with, when it is a plain word: card, leaflet, flyer, linkedin.
 * Anything else is nobody's business to carry on, and is dropped.
 */
export function arrivalSource(search: string): string | null {
  const value = (new URLSearchParams(search).get('utm_source') ?? '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,40}$/.test(value) ? value : null;
}

/** The printed piece somebody scanned, or null for anybody who came another way. */
export function printedPieceFrom(source: string | null): PrintedPiece | null {
  return printedPieces.find((piece) => piece === source) ?? null;
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

/**
 * The script that marks the opening with the piece that was scanned, before it is painted, so the
 * stylesheet shows that piece's words and nothing moves once the page is up: the way the cookie
 * question is decided before the first paint (D-152). It runs where it stands, as the first thing
 * inside the opening, and marks that. A fixed string: only the pieces' own names are written in.
 */
export function joinHookScript(): string {
  return [
    'try{',
    "var s=(new URLSearchParams(location.search).get('utm_source')||'').trim().toLowerCase();",
    `if(${JSON.stringify(printedPieces)}.indexOf(s)>=0)document.currentScript.parentElement.setAttribute('${joinHookAttribute}',s)`,
    '}catch(e){}',
  ].join('');
}

/** "a year" for the twelve months of the offer, as the card says it, and the months otherwise. */
export function offerTermWords(months: number): string {
  return foundingTermWords(months).replace(/^1 /, 'a ');
}

/** How many founding places are left, in a sentence, from the database's own count (D-243). */
export function placesLeftWords(progress: FoundingProgress): string {
  if (progress.full) return `All ${String(progress.limit)} founding places have gone.`;
  if (progress.taken === 0) return `All ${String(progress.limit)} founding places are still open.`;
  if (progress.left === 1) return `1 of the ${String(progress.limit)} founding places is left.`;
  return `${String(progress.left)} of the ${String(progress.limit)} founding places are left.`;
}

/** The words the page opens on, for one way of arriving. */
export interface JoinHook {
  key: JoinHookKey;
  /** The headline, with the words the printed piece marks in yellow kept apart, to mark them here. */
  title: { before: string; marked: string; after: string };
  description: string;
  /** Whether the founding offer's line sits over it: not over a headline that already is the offer. */
  badge: boolean;
}

/**
 * The opening for each way of arriving. Only the card's is the offer itself, so only the card's
 * waits on it: while the founding places are open, and known to be, it says what is left of them;
 * when they have gone, or cannot be counted, it opens as everybody else's does, rather than offer
 * a year nobody can have.
 */
export function joinHooks(places: FoundingPlaces | null): JoinHook[] {
  const counted = places?.instructors ?? null;
  const everybody: JoinHook = {
    key: 'default',
    title: { before: 'Less admin. More lessons. ', marked: 'Paid on time.', after: '' },
    description:
      'Learners book your free times from your own link and pay before the lesson, straight to your own account. Your diary, payments and lesson records in one app.',
    badge: true,
  };
  const card: JoinHook =
    places !== null && counted !== null && !counted.full
      ? {
          key: 'card',
          title: { before: 'Pro ', marked: `free for ${offerTermWords(places.months)}.`, after: '' },
          description: `${placesLeftWords(counted)} No card needed, and nothing is ever charged unless you choose Pro and add a card.`,
          badge: false,
        }
      : { ...everybody, key: 'card' };
  return [
    everybody,
    card,
    {
      key: 'leaflet',
      title: { before: 'Your last lesson ends at six. ', marked: 'Your admin doesn’t.', after: '' },
      description: 'Diary, bookings, payments and lesson records. One app, made for UK driving instructors.',
      badge: true,
    },
    {
      // The flyer's back, where its code is, under its three ticks.
      key: 'flyer',
      title: { before: 'Less admin. ', marked: 'Paid on time.', after: '' },
      description:
        'Learners book your free times and pay before the lesson, by card, Apple Pay or Google Pay, straight to your own account. Cash and bank transfers are recorded in two taps.',
      badge: true,
    },
  ];
}

/** The button's words: the offer's own while it is open, plain ones once it has closed (D-251). */
export function joinActionWords(places: FoundingPlaces | null): string {
  return places !== null && !places.instructors.full ? 'Claim your founding place' : 'Create your free account';
}
