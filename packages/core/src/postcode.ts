/**
 * UK postcodes: the shape rules only, with no lookup (COV-03, M1-05).
 *
 * A postcode has an outward part (the district, "LS6") and an inward part ("3HN"). People
 * type them with any spacing and any case, so everything is compacted first and the canonical
 * single space is put back afterwards. Whether a well-shaped postcode actually exists is a
 * question for the GeoProvider; this file only decides whether it is worth asking.
 */

/** Outward part: the rules the Royal Mail publishes, without the special cases below. */
const OUTWARD = '(?:[A-Z][0-9]{1,2}|[A-Z][A-HJ-Y][0-9]{1,2}|[A-Z][0-9][A-Z]|[A-Z][A-HJ-Y][0-9][A-Z])';
const COMPACT = new RegExp(`^(?:GIR0AA|${OUTWARD}[0-9][A-Z]{2})$`);
const OUTWARD_ONLY = new RegExp(`^(?:GIR|${OUTWARD})$`);

function compact(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * The postcode in its canonical form ("LS6 3HN"), or null when it is not a postcode at all.
 * Returning null rather than throwing lets the caller choose the copy.
 */
export function normalisePostcode(value: string): string | null {
  const packed = compact(value);
  if (!COMPACT.test(packed)) return null;
  return `${packed.slice(0, -3)} ${packed.slice(-3)}`;
}

export function isPostcode(value: string): boolean {
  return normalisePostcode(value) !== null;
}

/** The district, for example "LS6" from "LS6 3HN". Used by coverage rules (COV-02). */
export function outcodeOf(value: string): string | null {
  const normalised = normalisePostcode(value);
  return normalised === null ? null : (normalised.split(' ')[0] ?? null);
}

/** The postal area, for example "LS" from "LS6 3HN". */
export function areaOf(value: string): string | null {
  const outcode = outcodeOf(value);
  return outcode === null ? null : (/^[A-Z]+/.exec(outcode)?.[0] ?? null);
}

/** A district on its own, as typed into a coverage list: "ls17" becomes "LS17" (COV-02). */
export function normaliseOutcode(value: string): string | null {
  const packed = compact(value);
  return OUTWARD_ONLY.test(packed) ? packed : null;
}

/** Great Britain and Northern Ireland, with room to spare. Keeps a bad lookup out of the cache. */
export const ukBounds = { minLatitude: 49.5, maxLatitude: 61.0, minLongitude: -8.8, maxLongitude: 2.1 } as const;

export function isInUk(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= ukBounds.minLatitude &&
    latitude <= ukBounds.maxLatitude &&
    longitude >= ukBounds.minLongitude &&
    longitude <= ukBounds.maxLongitude
  );
}
