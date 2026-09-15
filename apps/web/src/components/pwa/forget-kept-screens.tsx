'use client';

import { useEffect } from 'react';
import { forgetKeptDays } from '@/lib/offline/kept-days';
import { offlineCaches } from '@/lib/pwa/offline-pages';

/**
 * Takes what was kept on the device for no signal off it (PRD 8.1, M4-08, M4-09): the copies of
 * screens and the lessons kept for today and tomorrow. They have learners' names and pickups in
 * them, so they go whenever somebody lands on sign in: after signing out, or when a session has
 * ended, and before anybody else signs in on the same device. The build's files and the page saying
 * there is no connection hold nothing about anybody, and stay.
 */
export function ForgetKeptScreens() {
  useEffect(() => {
    if ('caches' in window) void caches.delete(offlineCaches.pages);
    forgetKeptDays().catch(() => undefined);
  }, []);
  return null;
}
