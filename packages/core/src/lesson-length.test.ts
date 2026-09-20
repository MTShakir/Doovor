import { describe, expect, it } from 'vitest';
import { customLengthPrice, isCustomLength, lengthInHours, longestCustomMinutes, shortestCustomMinutes } from './lesson-length.ts';

describe('a lesson length an instructor sets themselves (BOK-03, D-179)', () => {
  it('runs from an hour to four and a half, on the half hour', () => {
    expect(shortestCustomMinutes).toBe(60);
    expect(longestCustomMinutes).toBe(270);
    expect(isCustomLength(60)).toBe(true);
    expect(isCustomLength(90)).toBe(true);
    expect(isCustomLength(270)).toBe(true);
  });

  it('is nothing shorter, longer, or off the half hour', () => {
    expect(isCustomLength(30)).toBe(false);
    expect(isCustomLength(300)).toBe(false);
    expect(isCustomLength(45)).toBe(false);
    expect(isCustomLength(90.5)).toBe(false);
  });

  it('costs the hourly rate for the time it takes, to the penny', () => {
    expect(customLengthPrice(4200, 60)).toBe(4200);
    expect(customLengthPrice(4200, 90)).toBe(6300);
    expect(customLengthPrice(4200, 150)).toBe(10_500);
    expect(customLengthPrice(4200, 270)).toBe(18_900);
  });

  it('rounds a rate that does not divide evenly, rather than dropping the pennies', () => {
    // £42.25 an hour for an hour and a half is £63.375, which is £63.38.
    expect(customLengthPrice(4225, 90)).toBe(6338);
  });

  it('says a length in hours and half hours, the way the picker holds it', () => {
    expect(lengthInHours(60)).toEqual({ hours: 1, minutes: 0 });
    expect(lengthInHours(150)).toEqual({ hours: 2, minutes: 30 });
    expect(lengthInHours(270)).toEqual({ hours: 4, minutes: 30 });
  });
});
