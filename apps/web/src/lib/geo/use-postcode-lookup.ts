'use client';

import { normalisePostcode } from '@repo/core/postcode';
import type { Point } from '@repo/providers/map';
import { useEffect, useState } from 'react';

export interface PostcodeLookup {
  /** Where the postcode is, once it has been found. */
  place: Point | null;
  /** What to say when it could not be found, or nothing while it is fine. */
  problem: string | undefined;
}

/**
 * Looks a postcode up as it is typed (COV-03), so the map moves before anything is submitted.
 * Waits for a pause in typing, and asks only about something that is shaped like a postcode.
 */
export function usePostcodeLookup(typed: string, initial: { postcode: string | null; place: Point | null }): PostcodeLookup {
  const [place, setPlace] = useState<Point | null>(initial.place);
  const [found, setFound] = useState<string | null>(initial.postcode);
  const [problem, setProblem] = useState<string | undefined>(undefined);

  useEffect(() => {
    const postcode = normalisePostcode(typed);
    if (postcode === null || postcode === found) return undefined;

    const timer = setTimeout(() => {
      void (async () => {
        const response = await fetch(`/api/geo/postcode?postcode=${encodeURIComponent(postcode)}`);
        const body: unknown = await response.json();
        if (response.ok && typeof body === 'object' && body !== null && 'data' in body) {
          const { latitude, longitude } = body.data as Point;
          setPlace({ latitude, longitude });
          setFound(postcode);
          setProblem(undefined);
        } else if (response.status === 404) {
          setPlace(null);
          setProblem('We could not find that postcode. Check it and try again');
        }
      })();
    }, 400);
    return () => { clearTimeout(timer); };
  }, [typed, found]);

  return { place, problem };
}
