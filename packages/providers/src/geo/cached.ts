import { normalisePostcode } from '@repo/core/postcode';
import type { GeoLookup, GeoProvider, PostcodeStore } from './types.ts';

/**
 * Asks the store first, the service second (COV-03).
 *
 * Postcodes do not move, so a place that has been looked up once never needs looking up
 * again. A store that is unavailable is not an error: the lookup simply costs a request.
 */
export function cachedGeoProvider(inner: GeoProvider, store: PostcodeStore): GeoProvider {
  return {
    lookup: async (postcode: string): Promise<GeoLookup> => {
      const normalised = normalisePostcode(postcode);
      if (normalised === null) return { ok: false, reason: 'INVALID' };

      try {
        const cached = await store.get(normalised);
        if (cached) return { ok: true, place: cached };
      } catch {
        // Fall through to the service.
      }

      const result = await inner.lookup(normalised);
      if (result.ok) {
        try {
          await store.put(result.place);
        } catch {
          // Worth a slower next lookup, not worth failing this one.
        }
      }
      return result;
    },
  };
}
