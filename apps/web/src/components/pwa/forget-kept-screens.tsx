'use client';

import { useEffect } from 'react';
import { offlineCaches } from '@/lib/pwa/offline-pages';

/**
 * Takes the copies of screens kept for no signal off the device (PRD 8.1, M4-08). They have
 * learners' names and pickups in them, so they go whenever somebody lands on sign in: after signing
 * out, or when a session has ended, and before anybody else signs in on the same device. The
 * build's files and the page saying there is no connection hold nothing about anybody, and stay.
 */
export function ForgetKeptScreens() {
  useEffect(() => {
    if ('caches' in window) void caches.delete(offlineCaches.pages);
  }, []);
  return null;
}
