import type { LogoArt } from '@repo/config/logo/art';
import { cn } from '../lib/cn';

/**
 * The logo (D-244, D-249), drawn from its shapes rather than loaded as a picture: sharp at any
 * size, nothing extra to fetch, and painted in the text colour, so black on a light background and
 * white on a dark one are the same component. Give it the art for the place: the horizontal logo
 * for a header, the stacked one for a square space, the wheel alone where nothing else fits.
 *
 * With a label it is an image of that name, for a link with nothing else in it. Without one it
 * is decoration, for when the name is written beside it anyway.
 */
export function Logo({ art, label, className }: { art: LogoArt; label?: string; className?: string }) {
  const name = label === undefined ? { 'aria-hidden': true } : { role: 'img', 'aria-label': label };
  return (
    <svg
      viewBox={`0 0 ${String(art.width)} ${String(art.height)}`}
      width={art.width}
      height={art.height}
      focusable="false"
      className={cn('h-8 w-auto shrink-0 fill-current', className)}
      {...name}
    >
      {art.paths.map((path, index) => (
        // The shapes never move or change, so where each sits in the list is what it is.
        <path key={index} d={path.d} fillRule={path.evenOdd ? 'evenodd' : undefined} />
      ))}
    </svg>
  );
}
