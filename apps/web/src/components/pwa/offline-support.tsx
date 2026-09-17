'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { listenForInstall } from '@/lib/pwa/install-store';
import { isBuildAsset, isKeptOffline, keptLessonPath, todayPath } from '@/lib/pwa/offline-pages';

// The install prompt comes once, early: listen from the moment this code runs.
listenForInstall();

/** Asks the worker to keep copies of these, once it is running to be asked. */
async function keep(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  const registration = await navigator.serviceWorker.ready;
  registration.active?.postMessage({ type: 'CACHE_URLS', payload: { urlsToCache: urls } });
}

/** The build's files this page has loaded so far, to draw it again with no signal. */
function loadedBuildFiles(): string[] {
  return performance.getEntriesByType('resource').flatMap((entry) => {
    const url = new URL(entry.name);
    return url.origin === window.location.origin && isBuildAsset(url.pathname) ? [url.href] : [];
  });
}

/**
 * Puts the service worker in place for the portals, and keeps what an instructor needs where there
 * is no signal (PRD 8.1, PRG-09, M4-08).
 *
 * The worker keeps a copy of Today and of a lesson's screen whenever one opens through it. The
 * first page a device ever opens arrives before the worker does, and a screen reached from another
 * one arrives as data rather than as a page, so for those this asks the worker for a copy too,
 * with the files the page was drawn with.
 */
/** Staff viewing as somebody keep none of their screens on this device (ADM-06, D-129). */
function viewingAsSomebody(): boolean {
  return document.cookie.split('; ').some((part) => part.startsWith('view_as='));
}

export function OfflineSupport() {
  const pathname = usePathname();
  const firstPath = useRef(pathname);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || viewingAsSomebody()) return;
    // Once the page has loaded, so fetching the worker never competes with the page itself.
    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
    };
    if (document.readyState === 'complete') {
      register();
      return;
    }
    window.addEventListener('load', register, { once: true });
    return () => {
      window.removeEventListener('load', register);
    };
  }, []);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !navigator.onLine || !isKeptOffline(pathname) || viewingAsSomebody()) return;
    // Today also keeps the screen its lessons open on with no signal, which nobody visits with signal.
    const alongside = pathname === todayPath ? [keptLessonPath] : [];
    // A page the worker already served has been kept on the way through.
    const servedByWorker = pathname === firstPath.current && navigator.serviceWorker.controller !== null;
    void keep(servedByWorker ? alongside : [pathname, ...alongside, ...loadedBuildFiles()]);
  }, [pathname]);

  return null;
}
