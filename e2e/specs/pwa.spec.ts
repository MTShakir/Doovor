import { expect, test, type Page } from '@playwright/test';
import { answeredCookies, authFile } from '../support/accounts';
import { bookLesson, lessonIdAt, removeLesson } from '../support/database';
import { addDays, expectAccessible, settled, snap } from '../support/helpers';
import { keptLessons, keptScreens, londonTime, readyWithNoSignal, type KeptLesson } from '../support/offline';
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

/** Safari on an iPhone, which has no install prompt to hand over. */
const iphoneSafari = {
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
};

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
    const context = await browser.newContext({ ...iphoneSafari, storageState: authFile('learner') });
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

  test('the school Overview offers it too', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: authFile('schoolManager') });
    try {
      const page = await context.newPage();
      await page.goto('/app/school');
      await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
      await expect.poll(() => handOverPrompt(page, 'accepted')).toBe(true);
      const offer = page.getByRole('region', { name: /on your home screen$/ });
      await expect(offer).toContainText("The school's diary, instructors and learners, one tap away.");
      await settled(page);
      await snap(page, testInfo, 'install-offer-school');
      await offer.getByRole('button', { name: 'Install' }).click();
      await expect.poll(() => page.evaluate(() => window.__installPrompted)).toBe(1);
    } finally {
      await context.close();
    }
  });

  test.describe('from the menu, which keeps it after not now (D-160)', () => {
    test('says not now to the card on Today, and installs from More', { tag: '@phone-only' }, async ({ browser }, testInfo) => {
      const context = await browser.newContext({ storageState: authFile('instructor') });
      try {
        const page = await context.newPage();
        await page.goto('/app/instructor');
        await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
        await expect.poll(() => handOverPrompt(page, 'accepted')).toBe(true);
        const offer = page.getByRole('region', { name: /on your home screen$/ });
        await offer.getByRole('button', { name: 'Not now' }).click();
        await expect(offer).toBeHidden();

        // The card has gone, the way to install has not, and the browser's prompt is still there.
        await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click();
        await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
        await page.getByRole('link', { name: 'Install the app' }).click();
        await expect(page).toHaveURL(/\/account\/install$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Install the app' })).toBeVisible();
        const install = page.getByRole('region', { name: 'Install it from here' });
        await expect(install).toBeVisible();
        await expectAccessible(page);
        await settled(page);
        await snap(page, testInfo, 'install-page');

        await install.getByRole('button', { name: 'Install' }).click();
        await expect.poll(() => page.evaluate(() => window.__installPrompted)).toBe(1);
        await expect(page.getByRole('status').filter({ hasText: 'You have the app' })).toBeVisible();

        // Installed, the menu has nothing more to offer.
        await page.goBack();
        await expect(page.getByRole('heading', { level: 1, name: 'More' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Account and security' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Install the app' })).toHaveCount(0);
      } finally {
        await context.close();
      }
    });

    test('the learner\'s Account has it, with the browser\'s menu until there is a prompt', { tag: '@desktop-only' }, async ({ browser }, testInfo) => {
      const context = await browser.newContext({ storageState: authFile('learner') });
      try {
        const page = await context.newPage();
        await page.goto('/app/learner/account');
        await page.getByRole('link', { name: 'Install the app' }).click();
        await expect(page).toHaveURL(/\/account\/install$/);

        // No prompt from the browser yet, so its own menu is the way.
        const menu = page.getByRole('region', { name: "From your browser's menu" });
        await expect(menu).toContainText('Install app, or Add to Home screen');
        await expectAccessible(page);
        await settled(page);
        await snap(page, testInfo, 'install-page-menu');

        // Once the browser hands one over, the page offers it; told no, it points to the menu again.
        await expect.poll(() => handOverPrompt(page, 'dismissed')).toBe(true);
        await page.getByRole('region', { name: 'Install it from here' }).getByRole('button', { name: 'Install' }).click();
        await expect.poll(() => page.evaluate(() => window.__installPrompted)).toBe(1);
        await expect(menu).toBeVisible();
      } finally {
        await context.close();
      }
    });

    test('on an iPhone, gives Safari\'s steps, and is left out inside the app', { tag: '@phone-only' }, async ({ browser }, testInfo) => {
      const context = await browser.newContext({ ...iphoneSafari, storageState: authFile('learner') });
      try {
        const page = await context.newPage();
        await page.goto('/app/learner/account');
        await page.getByRole('link', { name: 'Install the app' }).click();
        const steps = page.getByRole('region', { name: 'Three taps in Safari' });
        await expect(steps).toContainText('Add to Home Screen');
        await expect(steps).toContainText('only once it is on the home screen');
        await expect(page.getByRole('button', { name: 'Install' })).toHaveCount(0);
        await expectAccessible(page);
        await settled(page);
        await snap(page, testInfo, 'install-page-iphone');

        // Opened from the home screen, Safari says so on the navigator.
        await context.addInitScript(() => {
          Object.defineProperty(navigator, 'standalone', { value: true });
        });
        await page.goto('/app/learner/account');
        await expect(page.getByRole('link', { name: 'Account and security' })).toBeVisible();
        await expect(page.getByRole('link', { name: 'Install the app' })).toHaveCount(0);
      } finally {
        await context.close();
      }
    });
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

  test('draws Today from the phone\'s copy of the day under a banner, and opens a lesson from it (M4-10)', async ({ page, context }, testInfo) => {
    // An hour of its own for each width, clear of the other tests' lessons and the seed's.
    const hour = testInfo.project.name === 'mobile' ? '00:30' : '13:00';
    await removeLesson('Emma Clarke', learner.email, today(), hour);

    try {
      await page.goto('/app/instructor');
      await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
      await expect.poll(() => keptScreens(page), { timeout: 30_000 }).toEqual(expect.arrayContaining(['/app/instructor', '/app/instructor/lessons/offline']));
      // The screen for kept lessons has never been drawn here: it is kept with the code it runs on.
      await expect.poll(() => readyWithNoSignal(page, '/app/instructor/lessons/offline'), { timeout: 30_000 }).toBe(true);

      // Booked after Today's screen was kept, and read into the phone's copy when the signal comes back.
      await bookLesson('Emma Clarke', learner.email, today(), hour);
      const bookingId = await lessonIdAt('Emma Clarke', today(), hour);
      await context.setOffline(true);
      await context.setOffline(false);
      await expect.poll(async () => (await keptLessons(page)).some((one) => one.id === bookingId), { timeout: 30_000 }).toBe(true);

      await context.setOffline(true);
      try {
        await page.reload();
        const banner = page.getByRole('status').filter({ hasText: 'No signal.' });
        await expect(banner).toContainText('Today and its lessons still open');
        // The kept screen never had this lesson; the phone's copy of the day does.
        await expect(page.getByRole('list', { name: "Today's lessons" }).getByRole('article', { name: `${hour} ${learner.name}` })).toBeVisible();
        await expect(page.getByText(/^Lessons as of \d\d:\d\d$/)).toBeVisible();
        await expectAccessible(page);
        await settled(page);
        await snap(page, testInfo, 'today-no-signal-kept-day');

        // A lesson whose own screen was never opened opens from the phone's copy.
        await page.goto(`/app/instructor/lessons/${bookingId}`);
        await expect(page).toHaveURL(new RegExp(`/app/instructor/lessons/offline\\?lesson=${bookingId}$`));
        await expect(page.getByRole('heading', { level: 1, name: learner.name })).toBeVisible();
        await expect(banner).toBeVisible();
        await settled(page);
        await snap(page, testInfo, 'kept-lesson-no-signal');

        // The installed app opens on its start page, which with no signal is Today.
        await page.goto('/start');
        await expect(page).toHaveURL(/\/app\/instructor$/);
        await expect(page.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
      } finally {
        await context.setOffline(false);
      }

      await expect(page.getByRole('status').filter({ hasText: 'No signal.' })).toBeHidden();
    } finally {
      await removeLesson('Emma Clarke', learner.email, today(), hour);
    }
  });

  test('signing out takes the kept screens and lessons off the device', async ({ browser }, testInfo) => {
    // A lesson of its own to be kept, clear of the other test's today: a buffer follows each lesson.
    const hour = testInfo.project.name === 'mobile' ? '02:30' : '04:00';
    await bookLesson('Emma Clarke', learner.email, today(), hour);
    // A session of its own: signing out ends the one it signs out of, which other tests share.
    const context = await browser.newContext({ storageState: answeredCookies });
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
