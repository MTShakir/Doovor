import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { bookLesson, removeLesson } from '../support/database';
import { addDays, expectAccessible, settled, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

declare global {
  interface Window {
    /** How many times the page showed the install prompt a test handed it. */
    __installPrompted?: number;
  }
}

/**
 * The app on a home screen, and Today where there is no signal (PRD 8.1, M4-08).
 *
 * Lighthouse no longer has an installable check, and the Chromium these tests run cannot answer
 * Chrome's own (D-104), so the first test checks each thing Chrome looks for: a manifest it can
 * read, a name, a start page that opens, a standalone display, and icons that are the size they say.
 */

/** The screens the service worker has kept, by path. The cache is named in apps/web/src/lib/pwa/offline-pages.ts. */
async function keptScreens(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    if (!(await caches.has('offline-pages'))) return [];
    const cache = await caches.open('offline-pages');
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
}

interface KeptLesson {
  id: string;
  day: string;
  startsAt: string;
  learnerName: string;
}

/**
 * The lessons kept on the device for no signal, read straight from IndexedDB. The database is named
 * in apps/web/src/lib/offline/kept-days.ts. One that does not exist yet is not made by looking.
 */
async function keptLessons(page: Page): Promise<KeptLesson[]> {
  return page.evaluate(
    () =>
      new Promise<KeptLesson[]>((resolve) => {
        const opening = indexedDB.open('kept-teaching');
        opening.onupgradeneeded = () => {
          opening.transaction?.abort();
        };
        opening.onerror = () => {
          resolve([]);
        };
        opening.onsuccess = () => {
          const db = opening.result;
          if (!db.objectStoreNames.contains('lessons')) {
            db.close();
            resolve([]);
            return;
          }
          const all = db.transaction('lessons').objectStore('lessons').getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result as KeptLesson[]);
          };
          all.onerror = () => {
            db.close();
            resolve([]);
          };
        };
      }),
  );
}

/** "07:30", as a lesson's start reads in London. */
const londonTime = (instant: string): string =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }).format(new Date(instant));

/** A PNG's width and height, from its header. */
function pngSize(bytes: Buffer): string {
  expect(bytes.subarray(0, 8).toString('hex'), 'a PNG').toBe('89504e470d0a1a0a');
  return `${String(bytes.readUInt32BE(16))}x${String(bytes.readUInt32BE(20))}`;
}

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  prefer_related_applications?: boolean;
  icons: { src: string; sizes: string; type: string; purpose: string }[];
}

test.describe('installing the app (PRD 8.1, M4-08)', () => {
  test('has everything a browser looks for before it offers to install an app', async ({ page, request }) => {
    await page.goto('/sign-in');

    // The manifest as Chrome itself fetched and read it.
    const cdp = await page.context().newCDPSession(page);
    const read = await cdp.send('Page.getAppManifest');
    expect(read.errors, 'Chrome read the manifest without a complaint').toEqual([]);
    expect(new URL(read.url).pathname).toBe('/manifest.webmanifest');
    const manifest = JSON.parse(read.data ?? '{}') as Manifest;

    expect(manifest.name).not.toBe('');
    expect(manifest.short_name).not.toBe('');
    expect(manifest.display).toBe('standalone');
    expect(manifest.prefer_related_applications).toBeUndefined();
    expect(new URL(manifest.start_url, read.url).pathname.startsWith(manifest.scope)).toBe(true);
    expect((await request.get(manifest.start_url)).status(), 'the start page opens').toBe(200);

    // Icons of 192 and 512 pixels that really are those sizes, and one Android may crop.
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    for (const icon of manifest.icons) {
      const answer = await request.get(icon.src);
      expect(answer.headers()['content-type'], icon.src).toBe('image/png');
      expect(pngSize(await answer.body()), icon.src).toBe(icon.sizes);
    }

    // Safari on an iPhone reads its own tags for the home screen.
    const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect(pngSize(await (await request.get(apple ?? '')).body())).toBe('180x180');
    await expect(page.locator('meta[name="apple-mobile-web-app-title"]')).toHaveAttribute('content', manifest.short_name);
  });

  test.describe('the offer on Today', () => {
    test.use({ storageState: authFile('instructor') });

    /** Hands the page an install prompt, the way Chrome does once it decides an app is worth offering. */
    const handOverPrompt = (page: Page, outcome: 'accepted' | 'dismissed') =>
      page.evaluate((choice) => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(event, {
          prompt: () => {
            window.__installPrompted = (window.__installPrompted ?? 0) + 1;
            return Promise.resolve();
          },
          userChoice: Promise.resolve({ outcome: choice }),
        });
        // The page takes the prompt for its own button by stopping the browser showing it.
        return !window.dispatchEvent(event);
      }, outcome);

    test('offers the browser\'s own install prompt, and stays away once somebody says not now', async ({ page }, testInfo) => {
      await page.goto('/app/instructor');
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
      const offer = page.getByRole('region', { name: /on your home screen$/ });
      // Nothing is offered until the browser has something to offer.
      await expect(offer).toHaveCount(0);

      await expect.poll(() => handOverPrompt(page, 'accepted')).toBe(true);
      await expect(offer).toContainText('Today still opens where there is no signal');
      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, 'install-offer');
      await offer.getByRole('button', { name: 'Install' }).click();
      await expect.poll(() => page.evaluate(() => window.__installPrompted)).toBe(1);
      await expect(offer).toBeHidden();

      await page.reload();
      await expect.poll(() => handOverPrompt(page, 'dismissed')).toBe(true);
      await offer.getByRole('button', { name: 'Not now' }).click();
      await expect(offer).toBeHidden();

      // Said once on this device, it is not offered again.
      await page.reload();
      await expect.poll(() => handOverPrompt(page, 'dismissed')).toBe(true);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(resolve)));
      await expect(offer).toHaveCount(0);
    });
  });

  test('on an iPhone, gives the two steps in words, since Safari has no prompt to show', { tag: '@phone-only' }, async ({ browser }, testInfo) => {
    const context = await browser.newContext({
      storageState: authFile('learner'),
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await context.newPage();
      await page.goto('/app/learner');
      const offer = page.getByRole('region', { name: /on your home screen$/ });
      await expect(offer).toContainText('Tap the Share button, then Add to Home Screen.');
      await expect(offer.getByRole('button', { name: 'Install' })).toHaveCount(0);
      await settled(page);
      await snap(page, testInfo, 'install-offer-iphone');

      await offer.getByRole('button', { name: 'Not now' }).click();
      await expect(offer).toBeHidden();
      await page.reload();
      await expect(page.getByRole('heading', { level: 1, name: 'Home' })).toBeVisible();
      // Once the page is running, the offer would be there by now if it were coming.
      await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration()) !== undefined);
      await expect(offer).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

test.describe('Today with no signal (PRD 8.1, PRG-09, M4-08)', () => {
  // Emma Clarke's early morning today is nobody else's in these tests.
  test.use({ storageState: authFile('schoolInstructor') });
  const learner = { email: 'amelia.evans@example.com', name: 'Amelia Evans' };

  test('opens from the copy kept when it last opened, and any other screen says there is no connection', async ({ page, context }, testInfo) => {
    const hour = testInfo.project.name === 'mobile' ? '05:30' : '07:30';
    await removeLesson('Emma Clarke', learner.email, today(), hour);

    await page.goto('/app/instructor');
    await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    await expect.poll(() => keptScreens(page), { timeout: 30_000 }).toContain('/app/instructor');

    // Booked once the copy was kept, as from another device: the copy cannot know about it.
    await bookLesson('Emma Clarke', learner.email, today(), hour);
    const booked = page.getByRole('list', { name: "Today's lessons" }).getByRole('article', { name: `${hour} ${learner.name}` });

    await context.setOffline(true);
    try {
      const kept = await page.reload();
      expect(kept?.fromServiceWorker(), 'answered by the service worker').toBe(true);
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
      await expect(booked).toHaveCount(0);
      await settled(page);
      await snap(page, testInfo, 'today-no-signal');

      await page.goto('/app/instructor/diary');
      await expect(page.getByRole('heading', { level: 1, name: 'No connection' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Try again' })).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'no-connection');
    } finally {
      await context.setOffline(false);
    }

    // With signal again, Today is the real one.
    await page.goto('/app/instructor');
    await expect(booked).toBeVisible();
    await removeLesson('Emma Clarke', learner.email, today(), hour);
  });

  test('keeps today\'s and tomorrow\'s lessons on the device, and they are still there with no signal (M4-09)', async ({ page, context }, testInfo) => {
    const hour = testInfo.project.name === 'mobile' ? '05:30' : '07:30';
    const tomorrow = addDays(today(), 1);
    await bookLesson('Emma Clarke', learner.email, tomorrow, hour);
    const isTomorrows = (kept: KeptLesson[]) =>
      kept.some((one) => one.day === tomorrow && one.learnerName === learner.name && londonTime(one.startsAt) === hour);

    try {
      await page.goto('/app/instructor');
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
      await expect.poll(async () => isTomorrows(await keptLessons(page)), { timeout: 30_000 }).toBe(true);
      // Today's too, under today.
      expect((await keptLessons(page)).every((one) => one.day === today() || one.day === tomorrow)).toBe(true);
      // Opening the app again with no signal needs its screen kept as well as its lessons.
      await expect.poll(() => keptScreens(page), { timeout: 30_000 }).toContain('/app/instructor');

      await context.setOffline(true);
      try {
        await page.reload();
        await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
        // The phone could not read them again, and what it kept is still there.
        await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
        expect(isTomorrows(await keptLessons(page))).toBe(true);
      } finally {
        await context.setOffline(false);
      }
    } finally {
      await removeLesson('Emma Clarke', learner.email, tomorrow, hour);
    }
  });

  test('signing out takes the kept screens and lessons off the device', async ({ browser }, testInfo) => {
    // A lesson of its own to be kept, clear of the other test's today: a buffer follows each lesson.
    const hour = testInfo.project.name === 'mobile' ? '02:30' : '04:00';
    await bookLesson('Emma Clarke', learner.email, today(), hour);
    // A session of its own: signing out ends the one it signs out of, which other tests share.
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      await signInThroughForm(page, 'emma.clarke@example.com', { next: '/app/instructor' });
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
      await expect.poll(() => keptScreens(page), { timeout: 30_000 }).toContain('/app/instructor');
      await expect
        .poll(async () => (await keptLessons(page)).some((one) => one.day === today() && londonTime(one.startsAt) === hour), { timeout: 30_000 })
        .toBe(true);

      if (testInfo.project.name === 'mobile') await page.goto('/app/instructor/more');
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect.poll(() => keptScreens(page)).toEqual([]);
      await expect.poll(() => keptLessons(page)).toEqual([]);
    } finally {
      await context.close();
      await removeLesson('Emma Clarke', learner.email, today(), hour);
    }
  });
});
