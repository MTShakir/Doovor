import { readFileSync } from 'node:fs';
import path from 'node:path';
import { brand, type ColourToken } from '@repo/config/brand';
import { describe, expect, it } from 'vitest';
import { AA_NON_TEXT, AA_TEXT, contrastRatio } from './contrast';

const c = (token: ColourToken) => brand.colours[token];

// Every text pairing the design system uses (D-009). Adding a pairing means adding it here.
const textPairs: [ColourToken, ColourToken, string][] = [
  ['ink', 'white', 'body text'],
  ['black', 'white', 'headings, primary actions'],
  ['white', 'black', 'primary button label'],
  ['grey-700', 'white', 'secondary text and placeholders'],
  ['grey-700', 'grey-100', 'placeholders in filled inputs'],
  ['ink', 'grey-100', 'text on cards and chips'],
  ['black', 'grey-100', 'secondary button label'],
  ['black', 'yellow', 'highlights and selected slots'],
  ['red', 'white', 'error text'],
  ['white', 'red', 'destructive button label'],
  ['blue', 'white', 'links'],
  ['black', 'green', 'Paid and Completed pills'],
];

// Non-text boundaries that identify components (WCAG 1.4.11).
const uiPairs: [ColourToken, ColourToken, string][] = [
  ['grey-700', 'white', 'input boundary'],
  ['black', 'white', 'focus ring, selected slot border'],
  ['red', 'white', 'error border'],
  ['green', 'white', 'status pill fill'],
];

describe('design token contrast (WCAG 2.2 AA)', () => {
  it.each(textPairs)('%s on %s passes for text (%s)', (fg, bg) => {
    expect(contrastRatio(c(fg), c(bg))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(uiPairs)('%s on %s passes as a UI boundary (%s)', (fg, bg) => {
    expect(contrastRatio(c(fg), c(bg))).toBeGreaterThanOrEqual(AA_NON_TEXT);
  });

  it('documents the pairings the rules forbid', () => {
    expect(contrastRatio(c('grey-400'), c('white'))).toBeLessThan(AA_TEXT); // no grey-400 text
    expect(contrastRatio(c('green'), c('white'))).toBeLessThan(AA_TEXT); // no green small text
    expect(contrastRatio(c('yellow'), c('white'))).toBeLessThan(AA_NON_TEXT); // yellow needs a black border
    expect(contrastRatio(c('red'), c('grey-100'))).toBeLessThan(AA_TEXT); // errors sit on white
    expect(contrastRatio(c('blue'), c('grey-100'))).toBeLessThan(AA_TEXT); // links sit on white
  });

  it('gives placeholders grey-700 in the theme (D-009)', () => {
    const css = readFileSync(path.resolve(import.meta.dirname, '../styles/theme.css'), 'utf8');
    expect(css).toMatch(/::placeholder\s*{[^}]*color:\s*var\(--color-grey-700\)/);
  });
});
