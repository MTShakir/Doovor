'use client';

import { mapSettings, type Point } from '@repo/providers/map';
import { Skeleton } from '@repo/ui/skeleton';
import dynamic from 'next/dynamic';
import { clientEnv } from '@/env/client';
import { StaticMap } from './static-map';

/**
 * The map library is a large download, and most pages never show a map, so it is loaded only
 * when one is drawn and never on the server (COV-01, M1-06). `./mapbox-map` is imported here
 * and nowhere else: a static import anywhere would put it back in the shared bundle.
 */
const MapboxMap = dynamic(() => import('./mapbox-map'), {
  ssr: false,
  loading: () => <Skeleton className="h-56 w-full rounded-card md:h-72" />,
});

export interface RadiusMapProps {
  /** Null until a postcode has been looked up. */
  centre: Point | null;
  radiusMiles: number;
  place?: string | null;
}

/** An instructor's own coverage area, as they set it (COV-01). A public page draws it as a picture instead (`CoverageImage`). */
export function RadiusMap({ centre, radiusMiles, place }: RadiusMapProps) {
  const settings = mapSettings(clientEnv.NEXT_PUBLIC_MAPBOX_TOKEN);
  const description = place
    ? `Your coverage area: ${String(radiusMiles)} miles around ${place}`
    : `Your coverage area: ${String(radiusMiles)} miles around your base`;

  if (settings.kind === 'static' || centre === null) {
    return <StaticMap radiusMiles={radiusMiles} place={place} description={description} />;
  }
  return (
    <MapboxMap
      token={settings.token ?? ''}
      styleUrl={settings.styleUrl}
      centre={centre}
      radiusMiles={radiusMiles}
      description={description}
    />
  );
}
