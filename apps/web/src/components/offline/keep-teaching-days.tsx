'use client';

import { useEffect } from 'react';
import { keepDays } from '@/lib/offline/kept-days';

/** Reading the day again more often than this adds nothing an instructor would see. */
const atMostEvery = 60_000;

/**
 * Keeps today's and tomorrow's lessons on the phone while there is signal (PRG-09, M4-09): when
 * the instructor portal opens, when the signal comes back, and when the app is looked at again,
 * which is when a phone that has been in a pocket is likeliest to be out of date.
 */
export function KeepTeachingDays() {
  useEffect(() => {
    let lastRead = 0;
    const read = (evenIfRecent = false) => {
      if (!navigator.onLine || (!evenIfRecent && Date.now() - lastRead < atMostEvery)) return;
      lastRead = Date.now();
      // Storage switched off, as in some private windows: nothing is kept, and the screens still work.
      keepDays().catch(() => undefined);
    };
    const lookedAt = () => {
      if (document.visibilityState === 'visible') read();
    };
    // Signal back after a spell without is exactly when the kept copy is likeliest to be behind.
    const backOnline = () => {
      read(true);
    };

    read();
    window.addEventListener('online', backOnline);
    document.addEventListener('visibilitychange', lookedAt);
    return () => {
      window.removeEventListener('online', backOnline);
      document.removeEventListener('visibilitychange', lookedAt);
    };
  }, []);

  return null;
}
