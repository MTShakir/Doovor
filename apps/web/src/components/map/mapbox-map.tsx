'use client';

import 'mapbox-gl/dist/mapbox-gl.css';
import { brand } from '@repo/config/brand';
import { boundsForRadius, circleFeature, type Point } from '@repo/providers/map';
import mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';

export interface MapboxMapProps {
  token: string;
  styleUrl: string;
  centre: Point;
  radiusMiles: number;
  /** Read out to people who cannot see the map. */
  description: string;
}

const SOURCE = 'coverage';

/** Mapbox takes a box as [[west, south], [east, north]]. */
function asLngLatBounds(bounds: { west: number; south: number; east: number; north: number }) {
  return [
    [bounds.west, bounds.south],
    [bounds.east, bounds.north],
  ] as [[number, number], [number, number]];
}

/**
 * The coverage circle on a real map (COV-01, M1-06).
 *
 * This module is the only one that imports the map library, and it is only ever reached
 * through `next/dynamic`, so the library stays out of the bundle every other page loads.
 */
export default function MapboxMap({ token, styleUrl, centre, radiusMiles, description }: MapboxMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const pin = useRef<mapboxgl.Marker | null>(null);

  useEffect(() => {
    if (!container.current) return undefined;
    mapboxgl.accessToken = token;
    const instance = new mapboxgl.Map({
      container: container.current,
      style: styleUrl,
      center: [centre.longitude, centre.latitude],
      zoom: 10,
      // A page is scrolled past a map far more often than a map is zoomed.
      cooperativeGestures: true,
      attributionControl: true,
    });
    map.current = instance;

    instance.on('load', () => {
      instance.addSource(SOURCE, { type: 'geojson', data: circleFeature(centre, radiusMiles) });
      instance.addLayer({
        id: `${SOURCE}-fill`,
        type: 'fill',
        source: SOURCE,
        paint: { 'fill-color': brand.colours.blue, 'fill-opacity': 0.12 },
      });
      instance.addLayer({
        id: `${SOURCE}-edge`,
        type: 'line',
        source: SOURCE,
        paint: { 'line-color': brand.colours.blue, 'line-width': 2 },
      });
      pin.current = new mapboxgl.Marker({ color: brand.colours.black })
        .setLngLat([centre.longitude, centre.latitude])
        .addTo(instance);
      instance.fitBounds(asLngLatBounds(boundsForRadius(centre, radiusMiles)), { padding: 24, duration: 0 });
    });

    return () => {
      pin.current?.remove();
      pin.current = null;
      instance.remove();
      map.current = null;
    };
    // The map is created once; moving the circle is handled below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, styleUrl]);

  useEffect(() => {
    const instance = map.current;
    if (!instance?.isStyleLoaded()) return;
    const source = instance.getSource(SOURCE);
    if (source?.type === 'geojson') source.setData(circleFeature(centre, radiusMiles));
    pin.current?.setLngLat([centre.longitude, centre.latitude]);
    instance.fitBounds(asLngLatBounds(boundsForRadius(centre, radiusMiles)), { padding: 24, duration: 300 });
  }, [centre, radiusMiles]);

  // A figure rather than an image: the map carries its own controls and attribution links, which an
  // image may not hold (axe nested-interactive), and the label still says what it shows.
  return (
    <figure aria-label={description} className="m-0 h-56 w-full overflow-hidden rounded-card border border-grey-200 md:h-72">
      <div ref={container} className="size-full" />
    </figure>
  );
}
