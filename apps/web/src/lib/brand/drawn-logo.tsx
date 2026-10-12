import type { LogoArt } from '@repo/config/logo/art';

/**
 * The logo as the image renderer draws it (D-249), for the app icons, the favicon, the share
 * images and the logo at the top of an email: sized in pixels, with its colours written in,
 * because the renderer has no stylesheet and no text colour to inherit. With a backdrop colour,
 * the art's own backdrop is painted behind it: the favicon's circle, with the corners left clear.
 */
export function DrawnLogo({
  art,
  height,
  width,
  colour,
  backdropColour,
}: {
  art: LogoArt;
  height: number;
  width?: number;
  colour: string;
  backdropColour?: string;
}) {
  return (
    <svg
      width={width ?? Math.round((height * art.width) / art.height)}
      height={height}
      viewBox={`0 0 ${String(art.width)} ${String(art.height)}`}
    >
      {backdropColour === undefined ? null : art.backdrop === 'circle' ? (
        <circle cx={art.width / 2} cy={art.height / 2} r={Math.min(art.width, art.height) / 2} fill={backdropColour} />
      ) : (
        <rect width={art.width} height={art.height} fill={backdropColour} />
      )}
      {art.paths.map((path, index) => (
        // The shapes never move or change, so where each sits in the list is what it is.
        <path key={index} d={path.d} fill={colour} fillRule={path.evenOdd ? 'evenodd' : 'nonzero'} />
      ))}
    </svg>
  );
}
