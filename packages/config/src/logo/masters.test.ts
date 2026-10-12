import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { appIconLogo } from './app-icon.ts';
import { logoArtFromSvg, sameArtwork, type LogoArt } from './art.ts';
import { faviconLogo } from './favicon.ts';
import { horizontalLogo } from './horizontal.ts';
import { logoMasters } from './masters.ts';
import { stackedLogo } from './stacked.ts';
import { taglineLogo } from './tagline.ts';
import { wheelLogo } from './wheel.ts';

/**
 * The logo the app draws is the logo in assets/brand (D-244, D-249). Replace a file there without
 * running `pnpm brand:logo` and this fails, naming the file.
 */
const carried: Record<(typeof logoMasters)[number]['name'], LogoArt> = { horizontalLogo, stackedLogo, taglineLogo, wheelLogo, appIconLogo, faviconLogo };

function master(file: string): LogoArt {
  return logoArtFromSvg(readFileSync(new URL(`../../../../assets/brand/${file}`, import.meta.url), 'utf8'));
}

const pairs = logoMasters.flatMap((entry) => (entry.whiteFile === undefined ? [] : [{ file: entry.file, whiteFile: entry.whiteFile }]));

describe('the logo the app draws (D-249)', () => {
  it.each(logoMasters)('$module.ts is still what $file has', ({ name, file }) => {
    expect(carried[name]).toEqual(master(file));
  });

  it.each(pairs)('$whiteFile is the same artwork as $file', ({ file, whiteFile }) => {
    expect(sameArtwork(master(whiteFile), master(file))).toBe(true);
  });

  it('keeps the icons square, as the phone and the browser tab need them', () => {
    expect(appIconLogo.width).toBe(appIconLogo.height);
    expect(faviconLogo.width).toBe(faviconLogo.height);
    expect(Math.abs(wheelLogo.width - wheelLogo.height) / wheelLogo.width).toBeLessThan(0.01);
  });

  it('puts the app icon on a square, which the phone rounds, and the tab icon on a circle', () => {
    expect(appIconLogo.backdrop).toBe('square');
    expect(faviconLogo.backdrop).toBe('circle');
    for (const logo of [horizontalLogo, stackedLogo, taglineLogo, wheelLogo]) expect(logo.backdrop).toBeUndefined();
  });
});
