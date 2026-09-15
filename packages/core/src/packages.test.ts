import { describe, expect, it } from 'vitest';
import { packageExpiryText, pricePerHourPence } from './packages.ts';

describe('what an hour of a package costs (PAY-04, M3-13)', () => {
  it('divides the price by the hours, to the nearest penny', () => {
    expect(pricePerHourPence({ minutes: 600, pricePence: 38000 })).toBe(3800);
    expect(pricePerHourPence({ minutes: 300, pricePence: 19500 })).toBe(3900);
    // £100 for 7 hours is 1428.57p an hour.
    expect(pricePerHourPence({ minutes: 420, pricePence: 10000 })).toBe(1429);
    expect(pricePerHourPence({ minutes: 90, pricePence: 0 })).toBe(0);
  });

  it('refuses a package of no time, part minutes or money that is not pence', () => {
    expect(() => pricePerHourPence({ minutes: 0, pricePence: 100 })).toThrow(RangeError);
    expect(() => pricePerHourPence({ minutes: 60.5, pricePence: 100 })).toThrow(RangeError);
    expect(() => pricePerHourPence({ minutes: 60, pricePence: 42.5 })).toThrow(RangeError);
    expect(() => pricePerHourPence({ minutes: 60, pricePence: -1 })).toThrow(RangeError);
  });
});

describe('how long the hours last', () => {
  it('says so plainly, in years when the days are whole years', () => {
    expect(packageExpiryText(null)).toBe('The hours never run out.');
    expect(packageExpiryText(365)).toBe('Use them within a year of buying.');
    expect(packageExpiryText(730)).toBe('Use them within 2 years of buying.');
    expect(packageExpiryText(180)).toBe('Use them within 180 days of buying.');
    expect(packageExpiryText(1)).toBe('Use them within a day of buying.');
  });

  it('refuses a time limit that is not whole days', () => {
    expect(() => packageExpiryText(0)).toThrow(RangeError);
    expect(() => packageExpiryText(1.5)).toThrow(RangeError);
  });
});
