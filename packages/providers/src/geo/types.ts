/**
 * Turning a postcode into a place (COV-03, M1-05).
 *
 * Everything that needs coordinates goes through this interface, so the service behind it can
 * change without touching a feature. postcodes.io is the implementation today.
 */

export interface GeoPlace {
  /** Canonical form, for example "LS6 3HN". */
  postcode: string;
  /** The district, for example "LS6". */
  outcode: string;
  latitude: number;
  longitude: number;
  /** Council area, for example "Leeds". Null when the service does not say. */
  district: string | null;
  /** England, Scotland, Wales or Northern Ireland. */
  country: string | null;
}

export type GeoFailure =
  /** Not a postcode at all: no point asking anyone. */
  | 'INVALID'
  /** Well formed, but no such postcode. */
  | 'NOT_FOUND'
  /** The service could not be reached, or answered with something unusable. */
  | 'UNAVAILABLE';

export type GeoLookup = { ok: true; place: GeoPlace } | { ok: false; reason: GeoFailure };

export interface GeoProvider {
  lookup: (postcode: string) => Promise<GeoLookup>;
}

/** Where looked-up places are kept, so the same postcode is asked for once (COV-03). */
export interface PostcodeStore {
  get: (postcode: string) => Promise<GeoPlace | null>;
  put: (place: GeoPlace) => Promise<void>;
}
