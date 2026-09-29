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
  // The canvas the app is painted on (D-226), which is a ground for everything a card is not.
  ['ink', 'canvas', 'body text on the canvas'],
  ['black', 'canvas', 'headings on the canvas'],
  ['grey-700', 'canvas', 'secondary text on the canvas'],
  ['blue', 'canvas', 'links on a page rather than a card'],
  ['red', 'canvas', 'a field error on a page rather than a card'],
  // Both of these were forbidden until the two colours were darkened for the canvas (D-226).
  ['red', 'grey-100', 'error text on a tinted block'],
  ['blue', 'grey-100', 'a link on a tinted block'],
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
  ['green', 'canvas', 'status pill fill on the canvas'],
  // A card's outline is not in this list on purpose: grey-200 on the canvas is 1.19, and 1.4.11
  // asks this of a boundary somebody needs to perceive a component by. A card is read by what is
  // written in it and by its white against the canvas; the hairline only tidies the edge. The
  // boundaries that do have to be seen are an input's and the focus ring, which are above.
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
    expect(contrastRatio(c('green'), c('canvas'))).toBeLessThan(AA_TEXT); // no green small text there either
    expect(contrastRatio(c('yellow'), c('canvas'))).toBeLessThan(AA_NON_TEXT); // yellow still needs its black border
  });

  it('gives placeholders grey-700 in the theme (D-009)', () => {
    const css = readFileSync(path.resolve(import.meta.dirname, '../styles/theme.css'), 'utf8');
    expect(css).toMatch(/::placeholder\s*{[^}]*color:\s*var\(--color-grey-700\)/);
  });
});
