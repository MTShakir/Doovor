/// <reference lib="webworker" />

/**
 * The service worker (NTF-01, PRG-09, M2-29).
 *
 * Two jobs, and only two for now: keep the static shell available, and receive a push while
 * the app is closed. Offline lesson records and the rest of the caching arrive with the
 * offline work in M4, so nothing here decides what a page does.
 */

import { Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    /** Written into the bundle by Serwist at build time. */
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // A new worker takes over at once: an app that keeps yesterday's code is an app that
  // shows yesterday's diary.
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
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
      // No icon yet: the app's icons come with the manifest in M5, and a broken icon looks
      // worse than the browser's own.
      await self.registration.showNotification(title, {
        body: payload.body ?? '',
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
