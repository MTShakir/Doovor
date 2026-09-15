/**
 * What the service worker keeps on the device, shared by the worker and the pages that talk to it
 * (PRD 8.1, PRG-09, M4-08). Plain TypeScript with no framework in it, because the worker is
 * bundled on its own.
 */

/** The caches the worker fills. `pages` holds screens with people's names in them. */
export const offlineCaches = {
  pages: 'offline-pages',
  assets: 'offline-assets',
  icons: 'app-icons',
  fallback: 'offline-fallback',
} as const;

/** What a screen that needs a connection is answered with when there is none. */
export const offlineFallbackPath = '/offline';

const lessonScreen = /^\/app\/instructor\/lessons\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The screens an instructor needs where there is no signal (PRD 8.1): Today, and a lesson's own
 * screen with its timer and record. A copy of each is kept every time it opens with signal, and
 * nothing else anybody reads is kept on the device.
 */
export function isKeptOffline(pathname: string): boolean {
  return pathname === '/app/instructor' || lessonScreen.test(pathname);
}

/** Files the app is built from, named by their contents, so a copy never goes out of date. */
export function isBuildAsset(pathname: string): boolean {
  return pathname.startsWith('/_next/static/');
}
