/**
 * A coverage area as one picture from Mapbox's Static Images API (PUB-01, NFR-PERF-04, M5-24).
 *
 * A public page shows where lessons start as an image rather than the interactive map, whose
 * library is the largest download the app has and kept public pages under their Lighthouse score
 * (ARCHITECTURE 13, D-132). The circle is drawn by Mapbox on its own map, framed to fit, in the
 * same colours the interactive map uses.
 */
import { circleRing, type Point } from './geometry.ts';

export interface StaticMapImage {
  token: string;
  /** As `mapSettings` gives it: "mapbox://styles/mapbox/light-v11". */
  styleUrl: string;
  centre: Point;
  radiusMiles: number;
  /** CSS pixels; the image is fetched at twice this for sharp screens. */
  width: number;
  height: number;
  /** Hex colours, from the brand. */
  circleColour: string;
  pinColour: string;
}

/** Mapbox allows at most 1280 pixels a side for a static image. */
const MAX_SIDE = 1280;
/** Enough points for a smooth circle, few enough to keep the address well inside Mapbox's limit. */
const STEPS = 48;

const rounded = (value: number) => Math.round(value * 1e5) / 1e5;
const colourOf = (hex: string) => hex.replace(/^#/, '').toLowerCase();

export function staticMapImageUrl(image: StaticMapImage): string {
  const style = image.styleUrl.replace(/^mapbox:\/\/styles\//, '');
  const width = Math.min(MAX_SIDE, Math.max(1, Math.round(image.width)));
  const height = Math.min(MAX_SIDE, Math.max(1, Math.round(image.height)));
  const circle = {
    type: 'Feature',
    properties: {
      stroke: `#${colourOf(image.circleColour)}`,
      'stroke-width': 2,
      'stroke-opacity': 1,
      fill: `#${colourOf(image.circleColour)}`,
      'fill-opacity': 0.12,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [circleRing(image.centre, image.radiusMiles, STEPS).map(([longitude, latitude]) => [rounded(longitude), rounded(latitude)])],
    },
  };
  const pin = `pin-s+${colourOf(image.pinColour)}(${String(rounded(image.centre.longitude))},${String(rounded(image.centre.latitude))})`;
  const overlay = `geojson(${encodeURIComponent(JSON.stringify(circle))}),${pin}`;
  const query = new URLSearchParams({ padding: '24', access_token: image.token });
  return `https://api.mapbox.com/styles/v1/${style}/static/${overlay}/auto/${String(width)}x${String(height)}@2x?${query.toString()}`;
}
