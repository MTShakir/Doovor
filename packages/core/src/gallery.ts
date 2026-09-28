/**
 * The gallery: what the banner under a pass photo says (D-218).
 *
 * The words are here rather than in the component because the public profile, the school profile
 * and the instructor's own screen all draw the same banner, and a sentence written three times is
 * a sentence that ends up saying three things.
 */

import { formatCalendarDate } from './time/format.ts';
import type { LocalDate } from './time/calendar.ts';

export interface PassBanner {
  learnerName: string;
  passedOn: LocalDate;
  businessName: string;
}

/**
 * "Lee One became a driver on Tue 15 Sep 2026 with Asha Driving".
 *
 * The year is kept: a photo from four years ago that reads "Tue 15 Sep" invites a reader to assume
 * it was this month, and a wall of passes is read as a record rather than as news.
 */
export function passBannerWords({ learnerName, passedOn, businessName }: PassBanner): string {
  const who = learnerName.trim();
  const school = businessName.trim();
  const when = formatCalendarDate(passedOn);
  return school === '' ? `${who} became a driver on ${when}` : `${who} became a driver on ${when} with ${school}`;
}

/** How many photos a wall shows before it asks for another page. Matches `private.gallery_of`. */
export const galleryPageSize = 24;
