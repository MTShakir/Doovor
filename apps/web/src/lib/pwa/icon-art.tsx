import { brand } from '@repo/config/brand';
import type { AppIcon } from './icons';

/** A heavy capital D in a 100 by 100 box: a stem, and a bowl with its counter cut out. */
const mark = 'M22 12 H48 A38 38 0 0 1 48 88 H22 Z M40 30 H48 A20 20 0 0 1 48 70 H40 Z';

/**
 * An app icon as the image renderer draws it (PRD 8.1, M4-08): the mark in white on black, the
 * brand's own colours. The mark is drawn rather than typed, because the renderer only has a thin
 * font to type with. It is the brand's logo, and changes with it the way a logo file would.
 */
export function AppIconArt({ icon }: { icon: AppIcon }) {
  const markSize = Math.round(icon.size * (icon.purpose === 'maskable' ? 0.5 : 0.62));
  return (
    <div
      style={{
        width: icon.size,
        height: icon.size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: brand.colours.black,
      }}
    >
      <svg width={markSize} height={markSize} viewBox="0 0 100 100">
        <path d={mark} fill={brand.colours.white} fillRule="evenodd" />
      </svg>
    </div>
  );
}
