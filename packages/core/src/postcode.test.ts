import { describe, expect, it } from 'vitest';
import { areaOf, isInUk, isPostcode, normaliseOutcode, normalisePostcode, outcodeOf } from './postcode.ts';

describe('UK postcodes (COV-03, M1-05)', () => {
  it('accepts every shape the Royal Mail issues', () => {
    // One from each format in the specification, plus the one special case.
    for (const postcode of ['M1 1AE', 'B33 8TH', 'CR2 6XH', 'DN55 1PT', 'W1A 0AX', 'EC1A 1BB', 'GIR 0AA']) {
      expect(normalisePostcode(postcode)).toBe(postcode);
    }
  });

  it('tidies whatever someone types', () => {
    expect(normalisePostcode('ls63hn')).toBe('LS6 3HN');
    expect(normalisePostcode('  sw1a  1aa ')).toBe('SW1A 1AA');
    expect(normalisePostcode('Ls6 3Hn')).toBe('LS6 3HN');
  });

  it('rejects what is not a postcode, so the copy can say so', () => {
    for (const value of ['', 'LS6', '3HN', 'LS6 3H', 'LS6 3HNN', 'QQ1 1QQ Leeds', '90210', 'LS6-3HN']) {
      expect(normalisePostcode(value)).toBeNull();
      expect(isPostcode(value)).toBe(false);
    }
  });

  it('rejects the letters the specification leaves out of the second position', () => {
    // I, J and Z never appear there, so a mistyped 1 or a stray letter is caught.
    expect(normalisePostcode('LI6 3HN')).toBeNull();
    expect(normalisePostcode('LZ6 3HN')).toBeNull();
  });

  it('reads the district and the area, which coverage rules are built from', () => {
    expect(outcodeOf('ls17 8ab')).toBe('LS17');
    expect(outcodeOf('EC1A 1BB')).toBe('EC1A');
    expect(areaOf('ls17 8ab')).toBe('LS');
    expect(areaOf('EC1A 1BB')).toBe('EC');
    expect(outcodeOf('not a postcode')).toBeNull();
    expect(areaOf('not a postcode')).toBeNull();
  });

  it('takes a district on its own, for the coverage list', () => {
    expect(normaliseOutcode('ls17')).toBe('LS17');
    expect(normaliseOutcode(' W1A ')).toBe('W1A');
    expect(normaliseOutcode('LS17 8AB')).toBeNull();
    expect(normaliseOutcode('L')).toBeNull();
  });

  it('knows what is in the United Kingdom, so a bad lookup is not cached', () => {
    expect(isInUk(53.8, -1.55)).toBe(true); // Leeds
    expect(isInUk(60.15, -1.15)).toBe(true); // Lerwick
    expect(isInUk(49.9, -6.3)).toBe(true); // Isles of Scilly
    expect(isInUk(48.85, 2.35)).toBe(false); // Paris
    expect(isInUk(Number.NaN, -1.55)).toBe(false);
  });
});
