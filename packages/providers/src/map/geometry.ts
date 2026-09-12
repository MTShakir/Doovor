/**
 * The geometry a map needs, with no map library involved (COV-01, M1-06).
 *
 * Distances in this product are miles, because that is what an instructor says: "I teach
 * within eight miles of home". Coordinates are longitude first inside GeoJSON and latitude
 * first everywhere a person reads them, which is a well known trap, so the types below name
 * the parts rather than relying on order.
 */

export interface Point {
  latitude: number;
  longitude: number;
}

export interface Bounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

const EARTH_RADIUS_MILES = 3958.7613;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

/** How far apart two points are, as the crow flies. */
export function distanceMiles(from: Point, to: Point): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * A closed ring around a point, in GeoJSON order (longitude, latitude). Mapbox has no circle
 * measured in miles, so the circle is drawn as a polygon; 64 points is smooth at every zoom
 * a coverage area is looked at.
 */
export function circleRing(centre: Point, radiusMiles: number, steps = 64): [number, number][] {
  const radius = Math.max(0, radiusMiles);
  const latitudeSpan = toDegrees(radius / EARTH_RADIUS_MILES);
  // Lines of longitude close together as you go north, so a mile is more degrees up there.
  const shrink = Math.max(Math.cos(toRadians(centre.latitude)), 1e-6);
  const longitudeSpan = latitudeSpan / shrink;

  const ring: [number, number][] = [];
  for (let step = 0; step < steps; step += 1) {
    const angle = (2 * Math.PI * step) / steps;
    ring.push([centre.longitude + longitudeSpan * Math.cos(angle), centre.latitude + latitudeSpan * Math.sin(angle)]);
  }
  // GeoJSON rings end where they started.
  ring.push(ring[0] ?? [centre.longitude, centre.latitude]);
  return ring;
}

/** The circle as a GeoJSON feature, ready for a map source. */
export function circleFeature(centre: Point, radiusMiles: number, steps = 64) {
  return {
    type: 'Feature' as const,
    properties: { radiusMiles },
    geometry: { type: 'Polygon' as const, coordinates: [circleRing(centre, radiusMiles, steps)] },
  };
}

/** The smallest box holding the circle, so a map can frame it. */
export function boundsForRadius(centre: Point, radiusMiles: number): Bounds {
  const latitudeSpan = toDegrees(Math.max(0, radiusMiles) / EARTH_RADIUS_MILES);
  const longitudeSpan = latitudeSpan / Math.max(Math.cos(toRadians(centre.latitude)), 1e-6);
  return {
    west: centre.longitude - longitudeSpan,
    south: centre.latitude - latitudeSpan,
    east: centre.longitude + longitudeSpan,
    north: centre.latitude + latitudeSpan,
  };
}
