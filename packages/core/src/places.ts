/**
 * Places for the public pages: cities, their areas, and the address each one gets (PRD 8.3,
 * M5-01).
 *
 * Every postcode belongs to a local authority district, named the way the Office for National
 * Statistics names it, which is what postcodes.io returns and the postcode cache keeps
 * (`admin_district`). A launch city is a group of those districts, kept in the database
 * (`public.cities`, `public.city_districts`). A district outside every launch city is still a
 * place: an instructor there has a profile address under the district's own name, with no city
 * page above it until a city takes the district in.
 *
 * `private.place_name` and `private.place_slug` in the database follow the same rules, and a
 * test on each side pins them to the same names.
 */

/** A place as a page shows it: the name people say, and its address. */
export interface Place {
  name: string;
  slug: string;
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The name a district is known by. The statistics keep a few in index order, "Bristol, City of",
 * or with "City" as part of the official title, "Glasgow City"; people say "Bristol" and
 * "Glasgow". Everything else is left exactly as it is written.
 */
export function placeName(district: string): string {
  const name = district.trim();
  const indexed = /^(.+), (?:City|County) of$/.exec(name);
  if (indexed?.[1]) return indexed[1];
  const cityOf = /^City of (.+)$/.exec(name);
  if (cityOf?.[1]) return cityOf[1];
  const city = /^(.+) City$/.exec(name);
  if (city?.[1]) return city[1];
  return name;
}

/** An address from a name: "Kingston upon Thames" becomes "kingston-upon-thames". */
export function placeSlug(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A district outside the launch cities, as a place of its own. */
export function districtPlace(district: string): Place {
  const name = placeName(district);
  return { name, slug: placeSlug(name) };
}

/** Whether a piece of an address could name a place at all. */
export function isPlaceSlug(value: string): boolean {
  return value.length <= 80 && SLUG.test(value);
}

/**
 * A place page is thin, and carries noindex, until at least this many instructors search may show
 * are listed on it (PRD 8.3).
 */
export const INDEXABLE_MIN_INSTRUCTORS = 3;

/** Whether search engines should leave a city, area or transmission page out (PRD 8.3, M5-07). */
export function isThinPlace(instructorCount: number): boolean {
  return instructorCount < INDEXABLE_MIN_INSTRUCTORS;
}

/** Which place page: a city, one of its areas, or its automatic lessons, by their addresses alone. */
export interface PlaceAddress {
  citySlug: string;
  area?: { slug: string } | null;
  automatic?: boolean;
}

export interface PlacePage extends PlaceAddress {
  cityName: string;
  area?: { slug: string; name: string } | null;
}

/** The address of a city, area or automatic page: /driving-lessons/london/croydon. */
export function placePagePath({ citySlug, area, automatic }: PlaceAddress): string {
  const base = `/driving-lessons/${citySlug}`;
  if (automatic) return `${base}/automatic`;
  return area ? `${base}/${area.slug}` : base;
}

/** The heading a place page carries, which is also what search shows as its title. */
export function placeHeading({ cityName, area, automatic }: PlacePage): string {
  if (automatic) return `Automatic driving lessons in ${cityName}`;
  return area ? `Driving lessons in ${area.name}, ${cityName}` : `Driving lessons in ${cityName}`;
}
