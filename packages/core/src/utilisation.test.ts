import { describe, expect, it } from 'vitest';
import { hoursText, utilisationPercent, utilisationWords } from './utilisation.ts';

describe('how full a week is (SCH-01, M5-12)', () => {
  it('is the booked time over the open time, to the whole per cent', () => {
    expect(utilisationPercent(360, 2580)).toBe(14);
    expect(utilisationPercent(1920, 1920)).toBe(100);
    expect(utilisationPercent(0, 600)).toBe(0);
  });

  it('can be more than full, and has no figure when nothing was open', () => {
    expect(utilisationPercent(660, 600)).toBe(110);
    expect(utilisationPercent(60, 0)).toBeNull();
    expect(utilisationPercent(0, 0)).toBeNull();
  });

  it('says the hours in words that line up', () => {
    expect(hoursText(2580)).toBe('43 hours');
    expect(hoursText(330)).toBe('5.5 hours');
    expect(hoursText(60)).toBe('1 hour');
    expect(hoursText(45)).toBe('0.8 hours');
    expect(utilisationWords(360, 2580)).toBe('6 of 43 hours booked');
    expect(utilisationWords(60, 60)).toBe('1 of 1 hour booked');
    expect(utilisationWords(0, 0)).toBe('No open hours this week');
    expect(utilisationWords(90, 0)).toBe('1.5 hours booked, with no open hours');
  });
});
