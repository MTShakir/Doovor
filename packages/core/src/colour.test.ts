import { brand } from '@repo/config/brand';
import { describe, expect, it } from 'vitest';
import { brandColourProblem, contrastRatio, isHexColour, normaliseHexColour, relativeLuminance } from './colour.ts';

describe('reading a colour somebody typed (D-210)', () => {
  it('takes it with or without the hash, in either case', () => {
    expect(normaliseHexColour('#1A4D8F')).toBe('#1A4D8F');
    expect(normaliseHexColour('1a4d8f')).toBe('#1A4D8F');
    expect(normaliseHexColour('  #1a4d8f  ')).toBe('#1A4D8F');
  });

  it('opens out the short form, which is what a colour picker gives back', () => {
    expect(normaliseHexColour('#abc')).toBe('#AABBCC');
    expect(normaliseHexColour('f00')).toBe('#FF0000');
  });

  it('gives nothing back for what is not a colour', () => {
    expect(normaliseHexColour('')).toBe('');
    expect(normaliseHexColour('#12345')).toBe('');
    expect(normaliseHexColour('rebeccapurple')).toBe('');
    expect(normaliseHexColour('#1234567')).toBe('');
    expect(normaliseHexColour('#gggggg')).toBe('');
  });

  it('knows one when it sees one', () => {
    expect(isHexColour('#1A4D8F')).toBe(true);
    expect(isHexColour('1A4D8F')).toBe(false);
    expect(isHexColour(null)).toBe(false);
  });
});

describe('whether a colour can be somebody own (D-210)', () => {
  it('takes a colour dark enough to read white writing on', () => {
    expect(brandColourProblem('#1A4D8F')).toBeNull();
    expect(brandColourProblem(brand.colours.black)).toBeNull();
    expect(brandColourProblem('#8B0000')).toBeNull();
  });

  it('refuses one nobody could read, however much somebody likes it', () => {
    // Our own yellow is the clearest case: black on it is fine, white on it is not (D-009). So an
    // instructor cannot paint their booking page in the brand's own accent, and should not.
    expect(brandColourProblem(brand.colours.yellow)).toBe('contrast');
    expect(brandColourProblem(brand.colours.white)).toBe('contrast');
    expect(brandColourProblem(brand.colours['yellow-100'])).toBe('contrast');
    expect(brandColourProblem('#AFEEEE')).toBe('contrast');
  });

  it('tells the two kinds of wrong apart, so the picker can say which', () => {
    expect(brandColourProblem('nonsense')).toBe('format');
    expect(brandColourProblem(brand.colours.yellow)).toBe('contrast');
  });

  it('measures the same ratio whichever way round the two colours go', () => {
    expect(contrastRatio(brand.colours.black, brand.colours.white)).toBeCloseTo(21, 5);
    expect(contrastRatio(brand.colours.white, brand.colours.black)).toBeCloseTo(21, 5);
  });

  it('still refuses to guess at something that is not a colour at all', () => {
    expect(() => relativeLuminance('nope')).toThrow(RangeError);
  });
});
