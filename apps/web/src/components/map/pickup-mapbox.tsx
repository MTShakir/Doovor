'use client';

import 'mapbox-gl/dist/mapbox-gl.css';
import { brand } from '@repo/config/brand';
import type { Point } from '@repo/providers/map';
import mapboxgl from 'mapbox-gl';
import { useEffect, useRef } from 'react';

export interface PickupMapboxProps {
  token: string;
  styleUrl: string;
  /** Where the pin starts: the postcode's own point, or where it was left last time. */
  pin: Point;
  onMove: (point: Point) => void;
  /** Read out to people who cannot see the map. */
  description: string;
}

/**
 * The exact spot a lesson starts from, on a real map (COV-04, D-182). The pin is dragged, and
 * whoever cannot see it types the address instead, which is what the map is built from anyway.
 *
 * Only ever reached through `next/dynamic`, so the map library stays out of every other page.
 */
export default function PickupMapbox({ token, styleUrl, pin, onMove, description }: PickupMapboxProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const marker = useRef<mapboxgl.Marker | null>(null);
  // The latest handler, so the marker made once always calls the current one.
  const moved = useRef(onMove);
  useEffect(() => {
    moved.current = onMove;
  }, [onMove]);

  useEffect(() => {
    if (!container.current) return undefined;
    mapboxgl.accessToken = token;
    const instance = new mapboxgl.Map({
      container: container.current,
      style: styleUrl,
      center: [pin.longitude, pin.latitude],
      zoom: 16,
      // A page is scrolled past a map far more often than a map is zoomed.
      cooperativeGestures: true,
      attributionControl: true,
    });
    map.current = instance;

    const dropped = new mapboxgl.Marker({ color: brand.colours.black, draggable: true })
      .setLngLat([pin.longitude, pin.latitude])
      .addTo(instance);
    dropped.on('dragend', () => {
      const where = dropped.getLngLat();
      moved.current({ latitude: where.lat, longitude: where.lng });
    });
    marker.current = dropped;

    return () => {
      marker.current?.remove();
      marker.current = null;
      instance.remove();
      map.current = null;
    };
    // The map is made once; the pin is moved below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, styleUrl]);

  useEffect(() => {
    const instance = map.current;
    const dropped = marker.current;
    if (!instance || !dropped) return;

    // A pin that has just been dragged is already where it belongs. Moving the map under it would
    // put it back in the middle of the screen, which reads as the drag springing back (D-190).
    const at = dropped.getLngLat();
    if (Math.abs(at.lat - pin.latitude) < 1e-9 && Math.abs(at.lng - pin.longitude) < 1e-9) return;

    dropped.setLngLat([pin.longitude, pin.latitude]);
    instance.easeTo({ center: [pin.longitude, pin.latitude], duration: 300 });
  }, [pin]);

  // A figure rather than an image: the map carries its own controls and attribution links, which
  // an image may not hold (axe nested-interactive), and the label still says what it shows.
  return (
    <figure aria-label={description} className="m-0 h-48 w-full overflow-hidden rounded-card border border-grey-200">
      <div ref={container} className="size-full" />
    </figure>
  );
}
