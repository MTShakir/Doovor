import { describe, expect, it } from 'vitest';
import { postcodeAreaLabel, postcodeAreaName, readiness, wholeHours } from './regions';

describe('postcode areas (PRD 4.1, M5-19)', () => {
  it('names an area by its place, however the letters are typed', () => {
    expect(postcodeAreaName('LS')).toBe('Leeds');
    expect(postcodeAreaName('m')).toBe('Manchester');
    expect(postcodeAreaName(' sw ')).toBe('South West London');
    expect(postcodeAreaName('ZZ')).toBeNull();
  });

  it('labels an area with its letters and its place, or its letters alone', () => {
    expect(postcodeAreaLabel('ST')).toBe('ST, Stoke-on-Trent');
    expect(postcodeAreaLabel('qq')).toBe('QQ');
  });
});

describe('the switch-on rule (PRD 4.2, ADM-04, M5-19)', () => {
  const rule = { instructors: 25, hours: 150 };

  it('opens an area with enough instructors and enough free hours', () => {
    expect(readiness({ instructors: 25, freeMinutes: 9000 }, rule)).toEqual({ meetsRule: true, instructorsShort: 0, hoursShort: 0 });
    expect(readiness({ instructors: 40, freeMinutes: 12_000 }, rule).meetsRule).toBe(true);
  });

  it('says how far short an area is, in instructors and in whole hours', () => {
    expect(readiness({ instructors: 21, freeMinutes: 8_970 }, rule)).toEqual({ meetsRule: false, instructorsShort: 4, hoursShort: 1 });
    expect(readiness({ instructors: 30, freeMinutes: 0 }, rule)).toEqual({ meetsRule: false, instructorsShort: 0, hoursShort: 150 });
  });

  it('counts free time in whole hours, rounded down', () => {
    expect(wholeHours(4590)).toBe(76);
    expect(wholeHours(59)).toBe(0);
    expect(wholeHours(-30)).toBe(0);
  });
});
