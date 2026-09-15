'use client';

import { useEffect } from 'react';
import { keepDays, keptOwner } from '@/lib/offline/kept-days';
import { sendKeptRecords } from '@/lib/offline/send-kept-records';

/** Reading the day again more often than this adds nothing an instructor would see. */
const atMostEvery = 60_000;

/**
 * Keeps the phone and the server in step for where there is no signal (PRG-09, M4-09, M4-11):
 * when the instructor portal opens, when the signal comes back, and when the app is looked at again,
 * which is when a phone that has been in a pocket is likeliest to be behind. Records saved on the
 * phone go first, so the day read after them already shows them recorded. On an iPhone, which has
 * no Background Sync, this is what sends them.
 */
export function OfflineSync() {
  useEffect(() => {
    let lastRead = 0;
    const catchUp = (evenIfRecent = false) => {
      if (!navigator.onLine || (!evenIfRecent && Date.now() - lastRead < atMostEvery)) return;
      lastRead = Date.now();
      void (async () => {
        const owner = await keptOwner();
        if (owner !== null) await sendKeptRecords(owner, { locks: navigator.locks });
        await keepDays();
      })().catch(() => {
        // Storage switched off, as in some private windows: nothing is kept, and the screens still work.
      });
    };
    const lookedAt = () => {
      if (document.visibilityState === 'visible') catchUp();
    };
    // Signal back after a spell without is exactly when there is most to catch up on.
    const backOnline = () => {
      catchUp(true);
    };

    catchUp();
    window.addEventListener('online', backOnline);
    document.addEventListener('visibilitychange', lookedAt);
    return () => {
      window.removeEventListener('online', backOnline);
      document.removeEventListener('visibilitychange', lookedAt);
    };
  }, []);

  return null;
}
