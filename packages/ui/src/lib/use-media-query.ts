'use client';

import { useSyncExternalStore } from 'react';

/** Matches the Tailwind md breakpoint used for "mobile vs desktop" layouts. */
export const DESKTOP_QUERY = '(min-width: 768px)';

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export function useIsDesktop(): boolean {
  return useMediaQuery(DESKTOP_QUERY);
}
