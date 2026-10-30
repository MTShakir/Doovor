import { foundingProgress } from '@repo/core/founding';
import { describe, expect, it } from 'vitest';
import { arrivalSource, joinActionWords, joinOpening, offerTermWords, withArrivalSource } from './join';

const places = (taken: number, months = 12) => ({
  months,
  instructors: foundingProgress({ limit: 100, taken }),
  schools: foundingProgress({ limit: 50, taken: 3 }),
});

describe('where somebody came from (D-404)', () => {
  it('reads the utm_source of a plain word, in any case, and nothing else', () => {
    expect(arrivalSource('?utm_source=card')).toBe('card');
    expect(arrivalSource('?utm_medium=print&utm_source=Leaflet')).toBe('leaflet');
    expect(arrivalSource('?utm_source=%20flyer%20')).toBe('flyer');
    expect(arrivalSource('?utm_source=linkedin')).toBe('linkedin');
    expect(arrivalSource('')).toBeNull();
    expect(arrivalSource('?utm_source=')).toBeNull();
    expect(arrivalSource('?utm_source=%3Cscript%3E')).toBeNull();
    expect(arrivalSource(`?utm_source=${'a'.repeat(41)}`)).toBeNull();
  });

  it('carries it on to sign-up, after whatever the address already asks', () => {
    expect(withArrivalSource('https://app.example.com/sign-up?role=instructor', 'card')).toBe(
      'https://app.example.com/sign-up?role=instructor&utm_source=card',
    );
    expect(withArrivalSource('https://app.example.com/start', 'flyer')).toBe('https://app.example.com/start?utm_source=flyer');
    expect(withArrivalSource('https://app.example.com/sign-up?role=instructor', null)).toBe('https://app.example.com/sign-up?role=instructor');
  });
});

describe('what the page opens on (D-404, D-412)', () => {
  it('says the offer as the card does', () => {
    expect(offerTermWords(12)).toBe('a year');
    expect(offerTermWords(24)).toBe('2 years');
    expect(offerTermWords(6)).toBe('6 months');
    expect(offerTermWords(1)).toBe('a month');
  });

  it('opens the same for everybody: who it is for, then the old headline’s three promises (D-410)', () => {
    expect(`${joinOpening.title.before}${joinOpening.title.marked}`).toBe('The better way for UK driving instructors.');
    expect(joinOpening.description).toMatch(/^Less admin\. More lessons\. Paid on time\. /);
  });

  it('keeps every sentence of the headline to seven words or fewer', () => {
    for (const sentence of `${joinOpening.title.before}${joinOpening.title.marked}`.split(/(?<=[.?!])\s+/)) {
      expect(sentence.split(/\s+/).length, sentence).toBeLessThanOrEqual(7);
    }
  });

  it('asks for a founding place only while one can be had (D-251)', () => {
    expect(joinActionWords(places(46))).toBe('Claim your founding place');
    expect(joinActionWords(places(100))).toBe('Create your free account');
    expect(joinActionWords(null)).toBe('Create your free account');
  });
});
