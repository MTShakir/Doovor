/**
 * The pictures a guide can show (D-387): screens of the app on a phone, photographed from the local
 * app with its made-up people, and photographs of the places a guide is about (D-391), each drawn
 * by the site from a file of its own. A guide names one on a line of its own,
 * `![What it shows](booking-page "What to notice")`, and the Markdown refuses a name that is not
 * here. The words are the guide's: what the picture shows, for somebody who cannot see it, and a
 * caption saying what to notice.
 */
export const guideImageKeys = [
  'booking-page',
  'booking-link',
  'today',
  'diary-week',
  'lesson-record',
  'money',
  'learner-pay',
  'learner-lessons',
  'learner-contact',
  'public-profile',
  'tax-year-export',
  'expenses',
  'bookkeeping',
  'sidcup-high-street',
  'woolwich-road-belvedere',
  'picardy-road-belvedere',
] as const;

export type GuideImageKey = (typeof guideImageKeys)[number];

export function isGuideImageKey(value: string): value is GuideImageKey {
  return (guideImageKeys as readonly string[]).includes(value);
}

/** Whose a photograph is, and the licence it is used under, shown under it as its credit (D-391). */
export interface GuidePhotoCredit {
  /** Its title where it was found. */
  title: string;
  author: string;
  /** The year it was taken, so nobody takes an old street for today's. */
  year: number;
  licence: string;
  licenceUrl: string;
  /** Where it was found: the file's own page. */
  sourceUrl: string;
  via: string;
}

const ccBySa2 = { licence: 'CC BY-SA 2.0', licenceUrl: 'https://creativecommons.org/licenses/by-sa/2.0/', via: 'Wikimedia Commons' } as const;

/**
 * The photographs: other people's work, used under Creative Commons Attribution-ShareAlike as they
 * are, at their own size, and credited under each with links to where it came from and to the
 * licence (D-391). The product owner approved each one. Every other picture is a screen of the
 * app, which is ours.
 */
export const guidePhotoCredits: Partial<Record<GuideImageKey, GuidePhotoCredit>> = {
  'sidcup-high-street': {
    title: 'Sidcup High Street',
    author: 'Stacey Harris',
    year: 2008,
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Sidcup_High_Street_-_geograph.org.uk_-_657079.jpg',
    ...ccBySa2,
  },
  'woolwich-road-belvedere': {
    title: 'A206, Woolwich Rd',
    author: 'N Chadwick',
    year: 2014,
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:A206,_Woolwich_Rd_-_geograph.org.uk_-_3845403.jpg',
    ...ccBySa2,
  },
  'picardy-road-belvedere': {
    title: 'Picardy Road, Steep Hill 10%',
    author: 'Adam Morse',
    year: 2009,
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Picardy_Road_-_Steep_Hill_10%5E_-_geograph.org.uk_-_1435397.jpg',
    ...ccBySa2,
  },
};

/** A photograph's credit, or null for a screen of the app. */
export function guidePhotoCredit(key: GuideImageKey): GuidePhotoCredit | null {
  return guidePhotoCredits[key] ?? null;
}
