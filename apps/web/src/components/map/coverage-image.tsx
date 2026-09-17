import { brand } from '@repo/config/brand';
import { mapSettings, staticMapImageUrl, type Point } from '@repo/providers/map';
import Image from 'next/image';
import { clientEnv } from '@/env/client';
import { StaticMap } from './static-map';

export interface CoverageImageProps {
  /** The rounded middle of the area, never a home; null when there is none to draw around. */
  centre: Point | null;
  radiusMiles: number;
  place: string | null;
  description: string;
}

/** CSS pixels. The image is as wide as a profile's column gets, and as tall as the panel is on a wide screen. */
const WIDTH = 640;
const HEIGHT = 288;

/**
 * Where lessons start, as a visitor to a public page reads it (PUB-01): a picture of the map from
 * Mapbox rather than the interactive map, whose library public pages cannot afford (NFR-PERF-04,
 * ARCHITECTURE 13, D-132). Without a map key, or a middle to draw around, it is the drawn circle.
 */
export function CoverageImage({ centre, radiusMiles, place, description }: CoverageImageProps) {
  const settings = mapSettings(clientEnv.NEXT_PUBLIC_MAPBOX_TOKEN);
  if (settings.kind === 'static' || settings.token === undefined || centre === null) {
    return <StaticMap radiusMiles={radiusMiles} place={place} description={description} audience="public" />;
  }
  const src = staticMapImageUrl({
    token: settings.token,
    styleUrl: settings.styleUrl,
    centre,
    radiusMiles,
    width: WIDTH,
    height: HEIGHT,
    circleColour: brand.colours.blue,
    pinColour: brand.colours.black,
  });
  return (
    <Image
      src={src}
      alt={description}
      width={WIDTH}
      height={HEIGHT}
      // Mapbox draws and sizes the picture itself; the image optimiser would only fetch it again.
      unoptimized
      // On a wide screen it can be the largest thing in view, which lazy loading would hold back.
      loading="eager"
      className="h-56 w-full rounded-card border border-grey-200 bg-grey-100 object-cover md:h-72"
    />
  );
}
