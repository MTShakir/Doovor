import { isInUk, normalisePostcode, outcodeOf } from '@repo/core/postcode';
import type { GeoLookup, GeoProvider } from './types.ts';

/**
 * postcodes.io: a free service over Ordnance Survey open data, run by the Open Data
 * Institute (COV-03). No key, no personal data sent beyond the postcode itself.
 */
export interface PostcodesIoOptions {
  baseUrl?: string;
  /** Giving up quickly matters: a person is waiting for the map to move. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function decimal(value: unknown): number {
  return typeof value === 'number' ? value : Number.NaN;
}

export function postcodesIoProvider(options: PostcodesIoOptions = {}): GeoProvider {
  const baseUrl = options.baseUrl ?? 'https://api.postcodes.io';
  const timeoutMs = options.timeoutMs ?? 3000;
  const call = options.fetchImpl ?? fetch;

  return {
    lookup: async (postcode: string): Promise<GeoLookup> => {
      const normalised = normalisePostcode(postcode);
      if (normalised === null) return { ok: false, reason: 'INVALID' };

      let response: Response;
      try {
        response = await call(`${baseUrl}/postcodes/${encodeURIComponent(normalised)}`, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { accept: 'application/json' },
        });
      } catch {
        return { ok: false, reason: 'UNAVAILABLE' };
      }

      if (response.status === 404) return { ok: false, reason: 'NOT_FOUND' };
      if (!response.ok) return { ok: false, reason: 'UNAVAILABLE' };

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return { ok: false, reason: 'UNAVAILABLE' };
      }

      const result = isRecord(body) && isRecord(body.result) ? body.result : {};
      const latitude = decimal(result.latitude);
      const longitude = decimal(result.longitude);
      // A postcode with no coordinates, or coordinates outside the country, is no use here.
      if (!isInUk(latitude, longitude)) return { ok: false, reason: 'UNAVAILABLE' };

      return {
        ok: true,
        place: {
          postcode: normalised,
          outcode: text(result.outcode) ?? outcodeOf(normalised) ?? normalised,
          latitude,
          longitude,
          district: text(result.admin_district),
          country: text(result.country),
        },
      };
    },
  };
}
