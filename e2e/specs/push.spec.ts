import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import { clearPushSubscriptions, countPushSubscriptions } from '../support/database';

/**
 * Web push (NTF-01, M2-29).
 *
 * Two halves, because a test browser has no push service behind it: signing up for push, and
 * receiving one. The first stands a fake subscription in for what a push service would hand
 * back, so everything from the button to the row in the database is real. The second delivers
 * a push straight to the service worker through the devtools protocol, which is how a push
 * arrives anyway: the worker cannot tell the difference.
 *
 * What the second cannot check is the banner itself. The browser Playwright drives has no
 * notification UI at all, so `showNotification` is refused there whatever permission is
 * granted. What it does check is that the push reached the worker and the worker acted on it,
 * which is the part this milestone wrote.
 */
test.describe('web push (NTF-01, M2-29)', () => {
  test.use({ storageState: authFile('schoolOwner') });

  const origin = 'http://localhost:3000';

  /**
   * The worker is compiled the first time it is asked for, and two browsers asking at the
   * same moment on a cold server race each other. One warm-up first, as a warm server is.
   */
  test.beforeAll(async () => {
    const response = await fetch(`${origin}/sw.js`);
    expect(response.status).toBe(200);
  });

  /**
   * A push service, and a browser that shows notifications: this one has neither. The
   * component asks the same questions either way, so the answers are stood in for here.
   */
  const fakePushService = async (page: Page): Promise<void> => {
    await page.addInitScript(() => {
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
      Object.defineProperty(Notification, 'requestPermission', {
        configurable: true,
        value: () => Promise.resolve('granted'),
      });
      const subscription = {
        endpoint: 'https://push.example.com/subscription/e2e-test',
        expirationTime: null,
        toJSON: () => ({
          endpoint: 'https://push.example.com/subscription/e2e-test',
          keys: { p256dh: 'BN0Testkeythatislongenoughtopass0000000000', auth: 'authTestKey12345' },
        }),
        unsubscribe: () => Promise.resolve(true),
      };
      Object.defineProperty(PushManager.prototype, 'subscribe', {
        configurable: true,
        value: () => Promise.resolve(subscription),
      });
      Object.defineProperty(PushManager.prototype, 'getSubscription', {
        configurable: true,
        value: () => Promise.resolve(null),
      });
    });
  };

  /** The id the devtools protocol knows this origin's service worker by. */
  const registrationIdFor = async (context: BrowserContext, page: Page): Promise<string> => {
    const session = await context.newCDPSession(page);
    const found = new Promise<string>((resolve) => {
      session.on('ServiceWorker.workerRegistrationUpdated', (event) => {
        const live = event.registrations.find((one) => one.scopeURL.startsWith(origin) && !one.isDeleted);
        if (live) resolve(live.registrationId);
      });
    });
    await session.send('ServiceWorker.enable');
    const registrationId = await found;
    return registrationId;
  };

  test('somebody turns push on, and this browser is written down @desktop-only', async ({ browser }) => {
    const email = roles.schoolOwner.email;
    await clearPushSubscriptions(email);

    const context = await browser.newContext({ storageState: authFile('schoolOwner') });
    await context.grantPermissions(['notifications'], { origin });
    const page = await context.newPage();
    await fakePushService(page);

    await page.goto('/notifications/settings');
    const push = page.getByRole('region', { name: 'Push notifications' });
    await expect(push).toContainText('This browser');

    await push.getByRole('button', { name: 'Turn on' }).click();
    await expect(page.getByText('Push is on for this browser')).toBeVisible();
    await expect(push).toContainText('Push is on here.');

    expect(await countPushSubscriptions(email)).toBe(1);
    await clearPushSubscriptions(email);
    await context.close();
  });

  test('a push reaches the service worker, which passes it on @desktop-only', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('schoolOwner') });
    await context.grantPermissions(['notifications'], { origin });
    const page = await context.newPage();

    await page.goto('/notifications/settings');
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;
      // Whatever the worker passes on is kept where the test can read it.
      const seen: string[] = [];
      Object.defineProperty(window, '__pushed', { value: seen, configurable: true });
      navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as { type?: string; title?: string; body?: string };
        if (data.type === 'notification') seen.push(`${data.title ?? ''}|${data.body ?? ''}`);
      });
    });

    const registrationId = await registrationIdFor(context, page);
    const session = await context.newCDPSession(page);
    await session.send('ServiceWorker.enable');
    await session.send('ServiceWorker.deliverPushMessage', {
      origin,
      registrationId,
      data: JSON.stringify({
        title: 'Lesson cancelled',
        body: 'Wed 16 Sep at 09:00 with Sarah Khan.',
        url: '/notifications',
        tag: 'booking.cancelled',
      }),
    });

    // The push handler ran, in the worker, and told the open app about it.
    await expect
      .poll(
        () => page.evaluate(() => (window as unknown as { __pushed: string[] }).__pushed),
        { timeout: 15_000 },
      )
      .toContain('Lesson cancelled|Wed 16 Sep at 09:00 with Sarah Khan.');

    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await registration.unregister();
    });
    await context.close();
  });
});
