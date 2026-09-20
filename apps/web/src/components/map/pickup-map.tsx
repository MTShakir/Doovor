'use client';

import { mapSettings, type Point } from '@repo/providers/map';
import { Skeleton } from '@repo/ui/skeleton';
import dynamic from 'next/dynamic';
import { clientEnv } from '@/env/client';

/**
 * The map library is a large download, and most pages never show a map, so it is loaded only when
 * one is drawn and never on the server (COV-01, M1-06).
 */
const PickupMapbox = dynamic(() => import('./pickup-mapbox'), {
  ssr: false,
  loading: () => <Skeleton className="h-48 w-full rounded-card" />,
});

/**
 * Where exactly a lesson starts (COV-04, D-182): a pin to drag when there is a map to drag it on,
 * and nothing at all where no map is set up, since the address alone still finds the place.
 */
export function PickupMap({ pin, onMove, place }: { pin: Point; onMove: (point: Point) => void; place: string }) {
  const settings = mapSettings(clientEnv.NEXT_PUBLIC_MAPBOX_TOKEN);
  if (settings.kind === 'static') return null;

  return (
    <div className="flex flex-col gap-1">
      <PickupMapbox
        token={settings.token ?? ''}
        styleUrl={settings.styleUrl}
        pin={pin}
        onMove={onMove}
        description={`Where the lesson starts from at ${place}. Drag the pin to the exact spot.`}
      />
      <p className="text-small text-grey-700">Optional: drag the pin to the door, so your instructor stops in the right place.</p>
    </div>
  );
}
