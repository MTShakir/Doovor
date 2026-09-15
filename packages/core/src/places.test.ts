import { describe, expect, it } from 'vitest';
import { districtPlace, INDEXABLE_MIN_INSTRUCTORS, isPlaceSlug, isThinPlace, placeHeading, placeName, placePagePath, placeSlug } from './places';

/**
 * The same names and answers are pinned in supabase/tests/71_cities_test.sql, against the
 * database's copy of these rules, so a place gets one address whichever side works it out.
 */
const districts: [district: string, name: string, slug: string][] = [
  ['Leeds', 'Leeds', 'leeds'],
  ['Bristol, City of', 'Bristol', 'bristol'],
  ['Kingston upon Hull, City of', 'Kingston upon Hull', 'kingston-upon-hull'],
  ['Herefordshire, County of', 'Herefordshire', 'herefordshire'],
  ['City of Edinburgh', 'Edinburgh', 'edinburgh'],
  ['Glasgow City', 'Glasgow', 'glasgow'],
  ["King's Lynn and West Norfolk", "King's Lynn and West Norfolk", 'kings-lynn-and-west-norfolk'],
  ['St. Helens', 'St. Helens', 'st-helens'],
  ['Stoke-on-Trent', 'Stoke-on-Trent', 'stoke-on-trent'],
  ['Na h-Eileanan Siar', 'Na h-Eileanan Siar', 'na-h-eileanan-siar'],
  ['Armagh City, Banbridge and Craigavon', 'Armagh City, Banbridge and Craigavon', 'armagh-city-banbridge-and-craigavon'],
  ['Derry City and Strabane', 'Derry City and Strabane', 'derry-city-and-strabane'],
  ['Ynys Môn', 'Ynys Môn', 'ynys-mon'],
];

describe('places from local authority districts (PRD 8.3, M5-01)', () => {
  it.each(districts)('names %s for a page, and gives it an address', (district, name, slug) => {
    expect(placeName(district)).toBe(name);
    expect(districtPlace(district)).toEqual({ name, slug });
  });

  it('makes an address from any name: lower case, words joined by dashes, nothing else', () => {
    expect(placeSlug('Kingston upon Thames')).toBe('kingston-upon-thames');
    expect(placeSlug('Barking and Dagenham')).toBe('barking-and-dagenham');
    expect(placeSlug('City of London')).toBe('city-of-london');
    expect(placeSlug('  Brighton & Hove ')).toBe('brighton-and-hove');
    expect(placeSlug('Weston’s  Corner')).toBe('westons-corner');
  });

  it('knows an address when it sees one, so a page is only looked up for one', () => {
    for (const [, , slug] of districts) expect(isPlaceSlug(slug)).toBe(true);
    for (const bad of ['', 'Leeds', 'leeds/', '-leeds', 'leeds-', 'kings--lynn', 'st.helens', 'x'.repeat(81)]) {
      expect(isPlaceSlug(bad)).toBe(false);
    }
  });
});

describe('city, area and automatic pages (PRD 8.3, M5-07)', () => {
  it('lives at the addresses the PRD sets out', () => {
    expect(placePagePath({ citySlug: 'manchester' })).toBe('/driving-lessons/manchester');
    expect(placePagePath({ citySlug: 'london', area: { slug: 'croydon' } })).toBe('/driving-lessons/london/croydon');
    expect(placePagePath({ citySlug: 'leeds', automatic: true })).toBe('/driving-lessons/leeds/automatic');
  });

  it('says what the page is about, as search shows it', () => {
    expect(placeHeading({ citySlug: 'manchester', cityName: 'Manchester' })).toBe('Driving lessons in Manchester');
    expect(placeHeading({ citySlug: 'london', cityName: 'London', area: { slug: 'croydon', name: 'Croydon' } })).toBe('Driving lessons in Croydon, London');
    expect(placeHeading({ citySlug: 'leeds', cityName: 'Leeds', automatic: true })).toBe('Automatic driving lessons in Leeds');
  });

  it('keeps a page out of search until at least three instructors are listed on it', () => {
    expect(INDEXABLE_MIN_INSTRUCTORS).toBe(3);
    expect(isThinPlace(0)).toBe(true);
    expect(isThinPlace(2)).toBe(true);
    expect(isThinPlace(3)).toBe(false);
    expect(isThinPlace(40)).toBe(false);
  });
});
