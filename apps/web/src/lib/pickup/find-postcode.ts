'use server';

import { err, ok, type Result } from '@repo/core/result';
import { isPostcode } from '@repo/core/postcode';
import { getAccess } from '@/lib/auth/session';
import { getGeoProvider } from '@/lib/geo/provider';

export interface FoundPostcode {
  /** Canonical form: "LS6 3HN". */
  postcode: string;
  /** The council area, for the line under the field: "Leeds". Null when the service does not say. */
  district: string | null;
  latitude: number;
  longitude: number;
  /**
   * The addresses in that postcode, when the service knows them by house. Null from the free one,
   * and the screen then asks for the house instead of offering a list (D-182).
   */
  addresses: { line: string; latitude: number; longitude: number }[] | null;
}

/**
 * The place a postcode names, while somebody is typing an address (COV-04, D-182).
 *
 * Looked up through the cache the coverage screens already use, so the same postcode is asked for
 * once however many people type it. Signed in only: it is not a postcode service for the world.
 */
export async function findPostcode(postcode: unknown): Promise<Result<FoundPostcode>> {
  if (typeof postcode !== 'string' || !isPostcode(postcode)) {
    return err('VALIDATION_FAILED', 'Enter a UK postcode like LS1 4DY');
  }
  const access = await getAccess();
  if (!access) return err('NOT_AUTHENTICATED');

  const geo = await getGeoProvider();
  const found = await geo.lookup(postcode);
  if (!found.ok) {
    if (found.reason === 'UNAVAILABLE') return err('UNKNOWN', 'We could not check that postcode just now. Try again in a moment.');
    return err('VALIDATION_FAILED', 'We could not find that postcode. Check it and try again');
  }

  const addresses = geo.addresses ? await geo.addresses(found.place.postcode) : null;
  return ok({
    postcode: found.place.postcode,
    district: found.place.district,
    latitude: found.place.latitude,
    longitude: found.place.longitude,
    addresses,
  });
}
