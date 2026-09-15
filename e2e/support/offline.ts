import type { Page } from '@playwright/test';

/**
 * What the app keeps on the device for no signal, read the way the tests need it (PRD 8.1, PRG-09,
 * M4-08 to M4-11). The names of the caches, databases and stores are the app's own, in
 * apps/web/src/lib/pwa/offline-pages.ts and apps/web/src/lib/offline/.
 */

/** The screens the service worker has kept, by path. */
export async function keptScreens(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    if (!(await caches.has('offline-pages'))) return [];
    const cache = await caches.open('offline-pages');
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
}

/**
 * Whether a kept screen can be drawn with no signal: its copy is kept, and so is every build file
 * it names. The pattern is the one in apps/web/src/lib/pwa/offline-pages.ts.
 */
export async function readyWithNoSignal(page: Page, path: string): Promise<boolean> {
  return page.evaluate(async (screen) => {
    const copy = await (await caches.open('offline-pages')).match(screen, { ignoreSearch: true });
    if (copy === undefined) return false;
    const files = await caches.open('offline-assets');
    const named = (await copy.text()).match(/\/_next\/static\/[A-Za-z0-9_.~%@+\-[\]/]+/g) ?? [];
    const kept = await Promise.all(named.map(async (file) => (await files.match(file)) !== undefined));
    return kept.every(Boolean);
  }, path);
}

/** Every row of one IndexedDB store. A database that does not exist yet is not made by looking. */
async function storeRows<T>(page: Page, database: string, store: string): Promise<T[]> {
  return page.evaluate(
    ({ database: name, store: storeName }) =>
      new Promise<T[]>((resolve) => {
        const opening = indexedDB.open(name);
        opening.onupgradeneeded = () => {
          opening.transaction?.abort();
        };
        opening.onerror = () => {
          resolve([]);
        };
        opening.onsuccess = () => {
          const db = opening.result;
          if (!db.objectStoreNames.contains(storeName)) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction(storeName).objectStore(storeName).getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result as T[]);
          };
          all.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
    { database, store },
  );
}

export interface KeptLesson {
  id: string;
  day: string;
  startsAt: string;
  learnerName: string;
}

/** The lessons kept on the device for no signal (M4-09). */
export async function keptLessons(page: Page): Promise<KeptLesson[]> {
  return storeRows<KeptLesson>(page, 'kept-teaching', 'lessons');
}

/** Whose lessons the device holds, which is who records saved on it are sent for (M4-11). */
export async function keptOwnerOnDevice(page: Page): Promise<string | null> {
  const facts = await storeRows<{ key: string; value: string }>(page, 'kept-teaching', 'facts');
  return facts.find((one) => one.key === 'owner')?.value ?? null;
}

export interface KeptRecord {
  id: string;
  bookingId: string;
  state: 'waiting' | 'conflict' | 'refused';
  attempts: number;
  /** Exactly what the phone sends. */
  body: unknown;
}

/** The lesson records saved on the device and not yet on the server (M4-11). */
export async function outboxRecords(page: Page): Promise<KeptRecord[]> {
  return storeRows<KeptRecord>(page, 'lesson-outbox', 'records');
}

/** "07:30", as a lesson's start reads in London. */
export const londonTime = (instant: string): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(instant));
