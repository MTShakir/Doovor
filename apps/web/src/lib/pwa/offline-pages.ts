/**
 * What the service worker keeps on the device, shared by the worker and the pages that talk to it
 * (PRD 8.1, PRG-09, M4-08, M4-10). Plain TypeScript with no framework in it, because the worker is
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

/** Today, which the app's own start opens on with no signal. */
export const todayPath = '/app/instructor';

/**
 * The screen that draws any lesson the phone keeps, for a lesson whose own screen was never opened
 * with signal (M4-10). `?lesson=<id>`, and `&record=1` to open on the record.
 */
export const keptLessonPath = '/app/instructor/lessons/offline';

const lessonScreen = /^\/app\/instructor\/lessons\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/**
 * The screens an instructor needs where there is no signal (PRD 8.1): Today, a lesson's own screen
 * with its timer and record, and the screen that draws any kept lesson. A copy of each is kept every
 * time it opens with signal, and nothing else anybody reads is kept on the device.
 */
export function isKeptOffline(pathname: string): boolean {
  return pathname === todayPath || pathname === keptLessonPath || lessonScreen.test(pathname);
}

/** Files the app is built from, named by their contents, so a copy never goes out of date. */
export function isBuildAsset(pathname: string): boolean {
  return pathname.startsWith('/_next/static/');
}

const buildFile = /\/_next\/static\/[A-Za-z0-9_.~%@+\-[\]/]+/g;

/**
 * The build's files a kept screen needs, as its HTML names them: in its tags, and in the data it
 * comes alive from, which lists the code for each of its components (M4-10). A screen kept without
 * ever being drawn, like the one for kept lessons, would otherwise have nothing to run with no signal.
 */
export function buildFilesIn(html: string): string[] {
  return [...new Set(html.match(buildFile) ?? [])];
}

/** Which kept screens the device has. */
export interface KeptScreens {
  today: boolean;
  keptLesson: boolean;
}

/**
 * Where a screen that cannot open with no signal sends somebody instead (M4-10), or null for the
 * page saying there is no connection. A lesson whose screen was never kept opens on the screen
 * that draws kept lessons; the app's own start, which an installed app opens on, goes to Today.
 */
export function offlineStandIn(url: URL, kept: KeptScreens): string | null {
  const lesson = lessonScreen.exec(url.pathname)?.[1];
  if (lesson !== undefined && kept.keptLesson) {
    const query = new URLSearchParams({ lesson });
    if (url.searchParams.get('record') === '1') query.set('record', '1');
    return `${keptLessonPath}?${query.toString()}`;
  }
  if ((url.pathname === '/start' || url.pathname === '/') && kept.today) return todayPath;
  return null;
}
