import { describe, expect, it } from 'vitest';
import { distanceMiles, type Point } from './geometry.ts';
import { staticMapImageUrl } from './static-image.ts';
import { monochromeStyleUrl } from './types.ts';

const headingley: Point = { latitude: 53.8198, longitude: -1.5795 };
const image = {
  token: 'pk.test-token',
  styleUrl: monochromeStyleUrl,
  centre: headingley,
  radiusMiles: 8,
  width: 600,
  height: 300,
  // Any colours: the app passes the brand's.
  circleColour: '#12AB34',
  pinColour: '#0A0B0C',
};

describe('a coverage area as a static map image (PUB-01, NFR-PERF-04, M5-24)', () => {
  it('asks Mapbox for the monochrome style, framed to fit, twice as sharp as it is shown', () => {
    const url = new URL(staticMapImageUrl(image));
    expect(url.origin).toBe('https://api.mapbox.com');
    expect(url.pathname.startsWith('/styles/v1/mapbox/light-v11/static/')).toBe(true);
    expect(url.pathname.endsWith('/auto/600x300@2x')).toBe(true);
    expect(url.searchParams.get('access_token')).toBe('pk.test-token');
    expect(url.searchParams.get('padding')).toBe('24');
  });

  it('draws the circle in the colour it is given, and pins its middle', () => {
    const url = staticMapImageUrl(image);
    const overlay = /\/static\/geojson\((.+)\),pin-s\+0a0b0c\((-?[\d.]+),(-?[\d.]+)\)\/auto\//.exec(url);
    expect(overlay).not.toBeNull();
    const circle = JSON.parse(decodeURIComponent(overlay?.[1] ?? '')) as {
      properties: Record<string, string | number>;
      geometry: { type: string; coordinates: [number, number][][] };
    };
    expect(circle.properties).toMatchObject({ stroke: '#12ab34', fill: '#12ab34', 'fill-opacity': 0.12 });
    expect(circle.geometry.type).toBe('Polygon');
    const ring = circle.geometry.coordinates[0] ?? [];
    expect(ring).toHaveLength(49);
    for (const [longitude, latitude] of ring) {
      expect(distanceMiles(headingley, { latitude, longitude })).toBeCloseTo(8, 0);
    }
    expect([Number(overlay?.[2]), Number(overlay?.[3])]).toEqual([-1.5795, 53.8198]);
  });

  it('keeps inside what Mapbox allows: 1280 pixels a side, and an address well under its length limit', () => {
    const url = staticMapImageUrl({ ...image, width: 4000, height: 0.2 });
    expect(url).toContain('/auto/1280x1@2x?');
    expect(staticMapImageUrl(image).length).toBeLessThan(8192);
  });
});
