/**
 * Colour, and whether text can be read on it (PRD 14.4, D-210).
 *
 * This lived in `packages/ui` for the token tests. It moved here when an instructor's own colour
 * became something a Server Action has to check: the rule that decides whether a colour is usable
 * has to be the same rule in the picker and on the server, and `packages/core` is the only place
 * both can read.
 */

import { brand } from '@repo/config/brand';

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new RangeError(`Expected #RRGGBB, got ${hex}`);
  const [r, g, b] = [match[1], match[2], match[3]].map((part) => channel(parseInt(part ?? '0', 16))) as [
    number,
    number,
    number,
  ];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [relativeLuminance(foreground), relativeLuminance(background)].sort((a, b) => b - a) as [
    number,
    number,
  ];
  return (light + 0.05) / (dark + 0.05);
}

/** WCAG AA thresholds: normal text 4.5, large text and UI component boundaries 3. */
export const AA_TEXT = 4.5;
export const AA_NON_TEXT = 3;

export const white = brand.colours.white;

/** "#abc" and "abcdef" are both meant as a colour, so both are read as one. */
export function normaliseHexColour(value: string): string {
  const tidied = value.trim().replace(/^#/, '');
  // Each of the three characters doubles: #abc is #aabbcc. Matched rather than split, because a
  // string is not always one character per code unit and the lint rule is right about that.
  const full = /^[0-9a-f]{3}$/i.test(tidied)
    ? (tidied.match(/[0-9a-f]/gi) ?? []).map((one) => one + one).join('')
    : tidied;
  return /^[0-9a-f]{6}$/i.test(full) ? `#${full.toUpperCase()}` : '';
}

export function isHexColour(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-F]{6}$/i.test(value);
}

/**
 * Why a colour cannot be somebody's own, or null when it can (D-210).
 *
 * One number decides it: at least 4.5 to 1 against white. A learner's screen uses the colour two
 * ways, as a heading on white and as a button with white writing on it, and both are the same
 * ratio the other way up. So a colour that passes is readable in both places, and a colour that
 * fails is a booking page somebody cannot read: pale yellows, mints and pastels all land here,
 * which is why the picker says so rather than letting it through and looking broken.
 */
export function brandColourProblem(value: string): 'format' | 'contrast' | null {
  const colour = normaliseHexColour(value);
  if (colour === '') return 'format';
  return contrastRatio(colour, white) < AA_TEXT ? 'contrast' : null;
}
