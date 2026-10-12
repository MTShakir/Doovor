import { describe, expect, it } from 'vitest';
import { foundingCountWords, foundingProgress } from './founding.ts';

describe('how far through the founding places are (D-203, D-243)', () => {
  it('counts what is taken and what is left', () => {
    expect(foundingProgress({ limit: 100, taken: 46 })).toEqual({
      limit: 100,
      taken: 46,
      left: 54,
      percent: 46,
      full: false,
    });
  });

  it('is full when the last place goes', () => {
    expect(foundingProgress({ limit: 100, taken: 100 })).toMatchObject({ left: 0, percent: 100, full: true });
  });

  it('never claims more taken than there are places, if the limit is lowered past it', () => {
    // Lowering the limit is allowed and everybody who had a place keeps it (D-203).
    expect(foundingProgress({ limit: 100, taken: 130 })).toMatchObject({ taken: 100, left: 0, full: true });
  });

  it('reads anything odd as nought rather than inventing a number', () => {
    for (const odd of [Number.NaN, -3, Number.POSITIVE_INFINITY]) {
      expect(foundingProgress({ limit: 100, taken: odd }).taken).toBe(0);
    }
    expect(foundingProgress({ limit: 100, taken: 4.9 }).taken).toBe(4);
  });

  it('does not divide by nothing when there are no places at all', () => {
    expect(foundingProgress({ limit: 0, taken: 0 })).toMatchObject({ percent: 100, full: true });
  });
});

describe('what the page says about it (D-243)', () => {
  it('gives the count as joined against the limit, as the owner asked for it', () => {
    expect(foundingCountWords(foundingProgress({ limit: 100, taken: 46 }))).toEqual({
      headline: '46/100 joined',
      detail: '54 places left',
    });
  });

  it('says the places are open rather than "0 joined" before anybody has', () => {
    expect(foundingCountWords(foundingProgress({ limit: 100, taken: 0 }))).toEqual({
      headline: '100 places open',
      detail: 'Be one of the first.',
    });
  });

  it('says one place, not one places', () => {
    expect(foundingCountWords(foundingProgress({ limit: 100, taken: 99 })).detail).toBe('1 place left');
  });

  it('says it has closed once they have all gone', () => {
    expect(foundingCountWords(foundingProgress({ limit: 100, taken: 100 }))).toEqual({
      headline: 'All 100 places taken',
      detail: 'The founding offer has closed.',
    });
  });
});
