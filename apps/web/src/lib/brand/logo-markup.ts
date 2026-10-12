import type { LogoArt } from '@repo/config/logo/art';

/**
 * The logo as SVG text (D-249), for where there is no React to draw it: the page the app shows
 * with no connection, and the browser tab's icon. The colour is written in, with a background
 * square behind the shapes when one is asked for.
 */
export interface LogoMarkupOptions {
  colour: string;
  /** Paints the whole frame first: the app icon's black square. */
  background?: string;
  /** Names it for a screen reader; without one it is hidden from them as decoration. */
  label?: string;
  /** In CSS pixels; the width follows from the logo's proportions. Without one it fills its box. */
  height?: number;
}

function attribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function logoSvgMarkup(art: LogoArt, { colour, background, label, height }: LogoMarkupOptions): string {
  const size = height === undefined ? '' : ` width="${String(Math.round((height * art.width) / art.height))}" height="${String(height)}"`;
  const name = label === undefined ? ' aria-hidden="true"' : ` role="img" aria-label="${attribute(label)}"`;
  const square = background === undefined ? '' : `<rect width="${String(art.width)}" height="${String(art.height)}" fill="${attribute(background)}"/>`;
  const shapes = art.paths
    .map((path) => `<path d="${attribute(path.d)}" fill="${attribute(colour)}"${path.evenOdd ? ' fill-rule="evenodd"' : ''}/>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${String(art.width)} ${String(art.height)}"${size}${name}>${square}${shapes}</svg>`;
}
