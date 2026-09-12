import type { GeoLookup } from '@repo/providers/geo';
import { err, ok, type Result } from '@repo/core/result';

export interface PostcodeAnswer {
  postcode: string;
  outcode: string;
  latitude: number;
  longitude: number;
  district: string | null;
}

/**
 * Turns a lookup into the answer a screen shows (COV-03, M1-05). Each failure says what to do
 * next: a postcode that is not one at all reads differently from one the country does not
 * have, which reads differently again from a service that is having a moment.
 */
export function answerFor(lookup: GeoLookup): { status: number; body: Result<PostcodeAnswer> } {
  if (lookup.ok) {
    const { postcode, outcode, latitude, longitude, district } = lookup.place;
    return { status: 200, body: ok({ postcode, outcode, latitude, longitude, district }) };
  }
  if (lookup.reason === 'INVALID') {
    return { status: 400, body: err('VALIDATION_FAILED', 'Enter a UK postcode like LS1 4DY') };
  }
  if (lookup.reason === 'NOT_FOUND') {
    return { status: 404, body: err('NOT_FOUND', 'We could not find that postcode. Check it and try again') };
  }
  return { status: 503, body: err('UNKNOWN', 'We could not check that postcode just now. Try again in a moment') };
}
