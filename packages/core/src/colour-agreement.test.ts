import { describe, expect, it } from 'vitest';
import { brandColourProblem } from './colour.ts';

/**
 * The same colours are checked in supabase/tests/113_booking_colours_test.sql against
 * `private.readable_on_white`. Two copies of one rule drift unless something holds them together,
 * and this list is that something: change one side and the other side's test says so.
 *
 * None of them is a brand colour. The SQL side cannot import brand.ts, and the copy guard is
 * right to stop a hex value being written out by hand, so the pair of lists uses colours that
 * belong to nobody. What the brand's own colours do is asserted in colour.test.ts, where it can
 * read them properly.
 */
const agreed: [string, boolean][] = [
  ['#1A4D8F', true],
  ['#0B0B0B', true],
  ['#8B0000', true],
  ['#2F4F4F', true],
  ['#F5D76E', false],
  ['#FDFDFD', false],
  ['#AFEEEE', false],
  ['#3DD68C', false],
];

describe('the colour rule the database also applies (D-210)', () => {
  it.each(agreed)('%s is usable: %s', (colour, usable) => {
    expect(brandColourProblem(colour) === null).toBe(usable);
  });
});
