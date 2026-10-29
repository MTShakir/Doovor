import { foundingProgress } from '@repo/core/founding';
import { describe, expect, it } from 'vitest';
import {
  arrivalSource,
  joinActionWords,
  joinHookAttribute,
  joinHooks,
  joinHookScript,
  offerTermWords,
  placesLeftWords,
  printedPieceFrom,
  withArrivalSource,
} from './join';

const places = (taken: number, months = 12) => ({
  months,
  instructors: foundingProgress({ limit: 100, taken }),
  schools: foundingProgress({ limit: 50, taken: 3 }),
});

/** Runs the opening's script as a browser would, against an address, and says what it marked. */
function marked(search: string): string | null {
  const attributes = new Map<string, string>();
  const parentElement = { setAttribute: (name: string, value: string) => attributes.set(name, value) };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- the script is a string the page writes, so it is run as one
  const run = new Function('location', 'document', joinHookScript()) as (location: { search: string }, document: unknown) => void;
  run({ search }, { currentScript: { parentElement } });
  return attributes.get(joinHookAttribute) ?? null;
}

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

  it('knows the three printed pieces, and nobody else as one', () => {
    expect(printedPieceFrom('card')).toBe('card');
    expect(printedPieceFrom('leaflet')).toBe('leaflet');
    expect(printedPieceFrom('flyer')).toBe('flyer');
    expect(printedPieceFrom('linkedin')).toBeNull();
    expect(printedPieceFrom(null)).toBeNull();
  });

  it('carries it on to sign-up, after whatever the address already asks', () => {
    expect(withArrivalSource('https://app.example.com/sign-up?role=instructor', 'card')).toBe(
      'https://app.example.com/sign-up?role=instructor&utm_source=card',
    );
    expect(withArrivalSource('https://app.example.com/start', 'flyer')).toBe('https://app.example.com/start?utm_source=flyer');
    expect(withArrivalSource('https://app.example.com/sign-up?role=instructor', null)).toBe('https://app.example.com/sign-up?role=instructor');
  });
});

describe('the opening marked before it is painted (D-404)', () => {
  it('marks it with the piece that was scanned', () => {
    expect(marked('?utm_source=card')).toBe('card');
    expect(marked('?utm_source=leaflet&utm_medium=print')).toBe('leaflet');
    expect(marked('?utm_source=FLYER')).toBe('flyer');
  });

  it('leaves it alone for anybody else, so they get the page’s own opening', () => {
    expect(marked('')).toBeNull();
    expect(marked('?utm_source=linkedin')).toBeNull();
    expect(marked('?utm_source=card%22%20onload%3D')).toBeNull();
  });

  it('never stops the page, whatever the browser lacks', () => {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- as above
    const run = new Function('location', 'document', joinHookScript()) as (location: unknown, document: unknown) => void;
    expect(() => {
      run(undefined, undefined);
    }).not.toThrow();
  });

  it('is a fixed string with nothing that could end the script early', () => {
    expect(joinHookScript()).not.toMatch(/<\/?script/i);
    expect(joinHookScript()).toContain('["card","leaflet","flyer"]');
  });
});

describe('what the page opens on (D-404)', () => {
  it('says the offer as the card does', () => {
    expect(offerTermWords(12)).toBe('a year');
    expect(offerTermWords(24)).toBe('2 years');
    expect(offerTermWords(6)).toBe('6 months');
    expect(offerTermWords(1)).toBe('a month');
  });

  it('counts the places left from the database’s own count (D-243)', () => {
    expect(placesLeftWords(foundingProgress({ limit: 100, taken: 46 }))).toBe('54 of the 100 founding places are left.');
    expect(placesLeftWords(foundingProgress({ limit: 100, taken: 99 }))).toBe('1 of the 100 founding places is left.');
    expect(placesLeftWords(foundingProgress({ limit: 100, taken: 0 }))).toBe('All 100 founding places are still open.');
    expect(placesLeftWords(foundingProgress({ limit: 100, taken: 100 }))).toBe('All 100 founding places have gone.');
  });

  it('opens on each printed piece’s own words, and the page’s own for everybody else', () => {
    const [everybody, card, leaflet, flyer] = joinHooks(places(46));
    const headline = (hook: typeof everybody) => (hook ? `${hook.title.before}${hook.title.marked}${hook.title.after}` : '');
    // The page's own says who it is for, and keeps the old headline's three promises under it (D-410).
    expect(headline(everybody)).toBe('The better way for UK driving instructors.');
    expect(everybody?.description).toMatch(/^Less admin\. More lessons\. Paid on time\. /);
    expect(headline(card)).toBe('Pro free for a year.');
    expect(headline(leaflet)).toBe('Your last lesson ends at six. Your admin doesn’t.');
    expect(headline(flyer)).toBe('Less admin. Paid on time.');
    expect(card?.description).toBe(
      '54 of the 100 founding places are left. No card needed, and nothing is ever charged unless you choose Pro and add a card.',
    );
  });

  it('keeps the offer’s line off the card’s headline only, which already is the offer', () => {
    expect(joinHooks(places(46)).map((hook) => [hook.key, hook.badge])).toEqual([
      ['default', true],
      ['card', false],
      ['leaflet', true],
      ['flyer', true],
    ]);
  });

  it('never offers the card’s year once the places have gone, or while they cannot be counted', () => {
    for (const answer of [places(100), null]) {
      const [everybody, card] = joinHooks(answer);
      expect(card).toEqual({ ...everybody, key: 'card' });
    }
  });

  it('keeps every sentence of a headline to seven words or fewer', () => {
    for (const hook of joinHooks(places(46))) {
      const headline = `${hook.title.before}${hook.title.marked}${hook.title.after}`;
      for (const sentence of headline.split(/(?<=[.?!])\s+/)) {
        expect(sentence.split(/\s+/).length, `${hook.key}: ${sentence}`).toBeLessThanOrEqual(7);
      }
    }
  });

  it('asks for a founding place only while one can be had (D-251)', () => {
    expect(joinActionWords(places(46))).toBe('Claim your founding place');
    expect(joinActionWords(places(100))).toBe('Create your free account');
    expect(joinActionWords(null)).toBe('Create your free account');
  });
});
