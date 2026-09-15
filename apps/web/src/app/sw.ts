/// <reference lib="webworker" />

/**
 * The service worker (NTF-01, PRG-09, PRD 8.1, M2-29, M4-08).
 *
 * Three jobs: keep the screens an instructor needs where there is no signal, answer any other
 * screen with a stand-in or a page saying there is no connection, and receive a push while the app
 * is closed. Everything else, the API and every Server Action included, goes to the network
 * untouched. Sending lesson records saved with no signal arrives in M4-11.
 */

import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  Serwist,
  StaleWhileRevalidate,
  type PrecacheEntry,
  type SerwistGlobalConfig,
  type SerwistPlugin,
} from 'serwist';
import {
  buildFilesIn,
  isBuildAsset,
  isKeptOffline,
  keptLessonPath,
  offlineCaches,
  offlineFallbackPath,
  offlineStandIn,
  todayPath,
} from '../lib/pwa/offline-pages';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    /** Written into the bundle by Serwist at build time. */
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const day = 24 * 60 * 60;

/**
 * Only a whole screen that opened is worth keeping. A redirect to sign in, an error, or a page the
 * network answered with something else would be served later as if it were the screen.
 */
const wholeScreensOnly: SerwistPlugin = {
  cacheWillUpdate: ({ response }) =>
    Promise.resolve(response.status === 200 && response.type === 'basic' && !response.redirected ? response : null),
};

/**
 * A kept screen is only any use with the build's files it runs on, so each one it names that the
 * device does not have yet is kept alongside it (M4-10). The screen for kept lessons is kept without
 * ever being drawn, so nothing else would have fetched the code for its components.
 */
const keepItsFiles: SerwistPlugin = {
  cacheDidUpdate: async ({ cacheName, request }) => {
    const page = await (await caches.open(cacheName)).match(request);
    if (page === undefined) return;
    const files = await caches.open(offlineCaches.assets);
    await Promise.all(
      buildFilesIn(await page.text()).map(async (path) => {
        if ((await files.match(path)) !== undefined) return;
        const answer = await fetch(path).catch(() => null);
        if (answer?.ok === true) await files.put(path, answer);
      }),
    );
  },
};

/** A request for a page rather than for data behind it: a navigation, or a copy asked for by a page. */
function asksForScreen(request: Request): boolean {
  return request.headers.get('RSC') !== '1' && (request.mode === 'navigate' || request.destination === '');
}

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A new worker takes over at once: an app that keeps yesterday's code is an app that
  // shows yesterday's diary.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  disableDevLogs: true,
  runtimeCaching: [
    {
      // Today and a lesson's screen: fresh while there is signal, the last copy when there is not.
      matcher: ({ request, url, sameOrigin }) =>
        sameOrigin && request.method === 'GET' && isKeptOffline(url.pathname) && asksForScreen(request),
      handler: new NetworkFirst({
        cacheName: offlineCaches.pages,
        networkTimeoutSeconds: 4,
        // A lesson opened to write its record carries a query; the copy of the screen is the same.
        matchOptions: { ignoreSearch: true, ignoreVary: true },
        plugins: [
          wholeScreensOnly,
          new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 3 * day, purgeOnQuotaError: true }),
          keepItsFiles,
        ],
      }),
    },
    {
      // Any other screen needs the network, and says so when there is none (the catch handler).
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate',
      handler: new NetworkOnly(),
    },
    {
      // The build's own files are named by their contents, so a copy is never out of date. While
      // developing, names stay put as their contents change, so the network comes first there.
      matcher: ({ url, sameOrigin }) => sameOrigin && isBuildAsset(url.pathname),
      handler:
        process.env.NODE_ENV === 'production'
          ? new CacheFirst({
              cacheName: offlineCaches.assets,
              plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * day, purgeOnQuotaError: true })],
            })
          : new NetworkFirst({ cacheName: offlineCaches.assets, networkTimeoutSeconds: 4 }),
    },
    {
      matcher: ({ url, sameOrigin }) => sameOrigin && (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest'),
      handler: new StaleWhileRevalidate({ cacheName: offlineCaches.icons }),
    },
  ],
});

/**
 * A screen with no connection and no copy kept: a lesson opens on the screen that draws the lessons
 * the phone keeps, the installed app's start opens Today, and anything else gets the page saying
 * there is no connection (M4-10).
 */
serwist.setCatchHandler(async ({ request, url }) => {
  if (request.destination === 'document') {
    const kept = await caches.open(offlineCaches.pages);
    const has = async (path: string) => (await kept.match(path, { ignoreSearch: true, ignoreVary: true })) !== undefined;
    const standIn = offlineStandIn(url, { today: await has(todayPath), keptLesson: await has(keptLessonPath) });
    if (standIn !== null) return Response.redirect(new URL(standIn, self.location.origin).href, 302);
    const page = await caches.match(offlineFallbackPath, { cacheName: offlineCaches.fallback });
    if (page) return page;
  }
  return Response.error();
});

// The page saying there is no connection is kept when the worker installs, while there is one.
self.addEventListener('install', (event: ExtendableEvent) => {
  event.waitUntil(
    caches.open(offlineCaches.fallback).then((cache) => cache.add(new Request(offlineFallbackPath, { cache: 'reload' }))),
  );
});

serwist.addEventListeners();

/** What the platform sends: the words are already decided (NTF-03, D-072). */
interface PushPayload {
  title?: string;
  body?: string;
  url?: string;
  /** So two pushes about the same lesson replace each other rather than stacking up. */
  tag?: string;
}

function payloadOf(event: PushEvent): PushPayload {
  if (!event.data) return {};
  try {
    return event.data.json() as PushPayload;
  } catch {
    return { body: event.data.text() };
  }
}

/** Tabs that are already open hear about it too, so an open app is never out of date. */
async function tellOpenTabs(payload: PushPayload): Promise<void> {
  const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of open) client.postMessage({ type: 'notification', ...payload });
}

self.addEventListener('push', (event: PushEvent) => {
  const payload = payloadOf(event);
  const title = payload.title ?? 'Something changed';

  event.waitUntil(
    (async () => {
      // The open app first, because that is the one somebody is looking at.
      await tellOpenTabs(payload);
      await self.registration.showNotification(title, {
        body: payload.body ?? '',
        icon: '/icons/192.png',
        tag: payload.tag,
        data: { url: payload.url ?? '/notifications' },
      });
    })(),
  );
});

/** Tapping it opens the screen it is about, in a tab that is already open where there is one. */
self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const data: unknown = event.notification.data;
  const url = typeof data === 'object' && data !== null && 'url' in data && typeof data.url === 'string'
    ? data.url
    : '/notifications';

  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = clients.find((client) => client.url.includes(url));
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
