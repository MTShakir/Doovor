import { offlinePage } from '@/lib/pwa/offline-page';

/** The page the service worker keeps for a screen with no connection and no copy (M4-08). */
export function GET(): Response {
  return new Response(offlinePage(), {
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-robots-tag': 'noindex, nofollow' },
  });
}
