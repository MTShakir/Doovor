'use client';

import { brand } from '@repo/config/brand';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { beginVisit, carriedHref, learnTags } from '@/lib/site/arrival';

/** Where the note goes: a route of the site's own, which no proxy redirects. */
export const visitsPath = '/api/visits';

/** The page last counted, so a page drawn twice in development is still one page view. */
let lastCounted: string | null = null;

interface CountedAnswer {
  tags?: { source: string | null; medium: string | null; campaign: string | null };
}

/**
 * Counts each page of the site as it opens, without cookies (D-413): the page, and once per visit
 * where the visit came from. Nothing is stored on the device. It also gives every link into the
 * app's getting started and sign-up the tags the visit came with, at the moment it is followed, so
 * a new account can say where it came from.
 */
export function VisitCounter({ appUrl }: { appUrl: string }) {
  const pathname = usePathname();

  useEffect(() => {
    if (lastCounted === pathname) return;
    lastCounted = pathname;
    const timing = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    const { arrival, entry } = beginVisit({
      path: pathname,
      search: window.location.search,
      referrer: document.referrer,
      navigation: timing?.type,
      ownHosts: [window.location.host, new URL(appUrl).host, brand.domain, brand.appHost],
    });
    const body = JSON.stringify({
      path: pathname,
      entry,
      landing: arrival.landing,
      search: arrival.search,
      referrer: arrival.referrer,
    });
    void fetch(visitsPath, { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } })
      .then((answer) => (answer.ok ? (answer.json() as Promise<CountedAnswer>) : null))
      .then((answer) => {
        if (entry && answer?.tags) learnTags(answer.tags);
      })
      // A page that could not be counted is never the visitor's problem.
      .catch(() => undefined);
  }, [pathname, appUrl]);

  useEffect(() => {
    const appOrigin = new URL(appUrl).origin;
    const carry = (event: MouseEvent) => {
      const target = event.target;
      const link = target instanceof Element ? target.closest('a[href]') : null;
      if (link instanceof HTMLAnchorElement) link.href = carriedHref(link.href, appOrigin);
    };
    // Before the link is followed: a click, a middle click, or Enter, which clicks.
    document.addEventListener('click', carry, true);
    document.addEventListener('auxclick', carry, true);
    return () => {
      document.removeEventListener('click', carry, true);
      document.removeEventListener('auxclick', carry, true);
    };
  }, [appUrl]);

  return null;
}
