import type { LogoArt } from '@repo/config/logo/art';

/**
 * The logo as the image renderer draws it (D-249), for the app icons, the share images and the
 * logo at the top of an email: sized in pixels, with its colour written in, because the renderer
 * has no stylesheet and no text colour to inherit.
 */
export function DrawnLogo({ art, height, width, colour }: { art: LogoArt; height: number; width?: number; colour: string }) {
  return (
    <svg
      width={width ?? Math.round((height * art.width) / art.height)}
      height={height}
      viewBox={`0 0 ${String(art.width)} ${String(art.height)}`}
    >
      {art.paths.map((path, index) => (
        // The shapes never move or change, so where each sits in the list is what it is.
        <path key={index} d={path.d} fill={colour} fillRule={path.evenOdd ? 'evenodd' : 'nonzero'} />
      ))}
    </svg>
  );
}
