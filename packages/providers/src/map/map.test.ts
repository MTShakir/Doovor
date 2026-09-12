import { describe, expect, it } from 'vitest';
import { boundsForRadius, circleFeature, circleRing, distanceMiles, type Point } from './geometry.ts';
import { mapSettings, monochromeStyleUrl } from './types.ts';

const leeds: Point = { latitude: 53.8008, longitude: -1.5491 };
const lerwick: Point = { latitude: 60.1553, longitude: -1.1494 };

describe('map geometry (COV-01, M1-06)', () => {
  it('measures a distance people can check', () => {
    const manchester: Point = { latitude: 53.4808, longitude: -2.2426 };
    // Leeds to Manchester is about 36 miles as the crow flies.
    expect(distanceMiles(leeds, manchester)).toBeGreaterThan(34);
    expect(distanceMiles(leeds, manchester)).toBeLessThan(38);
    expect(distanceMiles(leeds, leeds)).toBe(0);
  });

  it('draws a ring whose every point is the radius away', () => {
    const ring = circleRing(leeds, 8);
    for (const [longitude, latitude] of ring) {
      expect(distanceMiles(leeds, { latitude, longitude })).toBeCloseTo(8, 1);
    }
  });

  it('closes the ring, as GeoJSON requires', () => {
    const ring = circleRing(leeds, 8, 16);
    expect(ring).toHaveLength(17);
    expect(ring.at(-1)).toEqual(ring[0]);
  });

  it('still works where the lines of longitude are close together', () => {
    for (const [longitude, latitude] of circleRing(lerwick, 30)) {
      expect(distanceMiles(lerwick, { latitude, longitude })).toBeCloseTo(30, 0);
    }
  });

  it('treats a radius of nothing as a point', () => {
    const ring = circleRing(leeds, 0, 8);
    for (const [longitude, latitude] of ring) {
      expect(distanceMiles(leeds, { latitude, longitude })).toBe(0);
    }
  });

  it('carries the radius on the feature, so a map can label it', () => {
    const feature = circleFeature(leeds, 12);
    expect(feature.type).toBe('Feature');
    expect(feature.properties.radiusMiles).toBe(12);
    expect(feature.geometry.coordinates[0]).toHaveLength(65);
  });

  it('frames the circle in a box that holds all of it', () => {
    const bounds = boundsForRadius(leeds, 8);
    for (const [longitude, latitude] of circleRing(leeds, 8)) {
      expect(longitude).toBeGreaterThanOrEqual(bounds.west - 1e-9);
      expect(longitude).toBeLessThanOrEqual(bounds.east + 1e-9);
      expect(latitude).toBeGreaterThanOrEqual(bounds.south - 1e-9);
      expect(latitude).toBeLessThanOrEqual(bounds.north + 1e-9);
    }
  });
});

describe('which map to draw (COV-01, M1-06)', () => {
  it('uses Mapbox when there is a token', () => {
    expect(mapSettings('pk.abc123')).toEqual({ kind: 'mapbox', token: 'pk.abc123', styleUrl: monochromeStyleUrl });
  });

  it('falls back to a drawing when there is not, rather than a broken panel', () => {
    for (const token of [undefined, '', '   ']) {
      expect(mapSettings(token).kind).toBe('static');
      expect(mapSettings(token).token).toBeUndefined();
    }
  });
});
