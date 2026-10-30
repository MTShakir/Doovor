import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { brand } from '@repo/config/brand';
import { authFile } from '../support/accounts';
import { withDatabase } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { agreeToTerms, uniqueEmail } from '../support/sign-up';

/**
 * Visits to the site, counted without cookies, and where sign-ups came from (D-413).
 *
 * Each test tags its links with a campaign of its own, so the visits other tests make at the same
 * moment are never counted with its own.
 */

/** A phone opening a link inside Instagram, as a real one says it is. */
const instagramOnAPhone =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 Instagram 389.0.0.29.87 (iPhone15,3; iOS 18_6; en_GB; en-GB; scale=3.00; 1290x2796; 752427463)';

function campaignFor(testInfo: TestInfo, label: string): string {
  return `e2e-${label}-${testInfo.project.name}-${Date.now().toString(36)}`.toLowerCase();
}

/** The next note a page of the site sends as it opens. */
function nextCount(page: Page) {
  return page.waitForResponse((response) => response.url().endsWith('/api/visits') && response.request().method() === 'POST');
}

test.describe('visits to the site (D-413)', () => {
  test.use({ userAgent: instagramOnAPhone, extraHTTPHeaders: { 'x-vercel-ip-country': 'GB', 'x-vercel-ip-city': 'Belvedere' } });

  test('a page opened from a tagged link is counted with nothing about the person, and the page after it carries the visit on', async ({ page }, testInfo) => {
    const campaign = campaignFor(testInfo, 'site');

    const landed = nextCount(page);
    await page.goto(`/join?utm_source=card&utm_campaign=${campaign}`);
    const first = await landed;
    expect(await first.json()).toEqual({ counted: true, tags: { source: 'card', medium: 'print', campaign } });
    // Counted without a cookie: nothing is set by it.
    expect(first.headers()['set-cookie']).toBeUndefined();

    // A page reached from that one, in the same visit.
    const next = nextCount(page);
    await page.getByRole('banner').getByRole('link', { name: brand.name }).click();
    await expect(page).toHaveURL(/\/$/);
    await next;

    const rows = await withDatabase(
      (sql) => sql`select path, entry, landing, channel, source, medium, campaign, referrer, country, city, device, browser, system, app
                     from public.site_visits where campaign = ${campaign} order by entry desc`,
    );
    const visit = { channel: 'print', source: 'card', medium: null, campaign, referrer: null, country: 'GB', city: 'Belvedere', device: 'phone', browser: 'Instagram app', system: 'iOS', app: 'instagram' };
    expect([...rows]).toEqual([
      { path: '/join', entry: true, landing: '/join', ...visit },
      { path: '/', entry: false, landing: '/join', ...visit },
    ]);
  });

  test('a sign-up carries the link it came on, and says how they heard about us', async ({ page }, testInfo) => {
    const campaign = campaignFor(testInfo, 'signup');
    await page.goto(`/instructors-software?utm_source=leaflet&utm_campaign=${campaign}`);
    await page
      .getByRole('link', { name: /^(Claim your free|Create your free account)/ })
      .first()
      .click();

    await expect(page).toHaveURL(new RegExp(`/sign-up\\?role=instructor&utm_source=leaflet&utm_campaign=${campaign}$`));
    const question = page.getByLabel('How did you hear about us?');
    // It starts where the link points, so a tap would confirm it.
    await expect(question).toHaveValue('print');
    await question.selectOption({ label: 'Somewhere else' });
    await page.getByLabel('Where?').fill('A leaflet on the test centre noticeboard');
    await expectAccessible(page);
    await snap(page, testInfo, 'sign-up-heard-about');

    const email = uniqueEmail(testInfo, 'heard');
    await page.getByLabel('Full name').fill('Lee Leaflet');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('a long pass phrase');
    await agreeToTerms(page);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

    const origin = await withDatabase(
      (sql) => sql`select o.source, o.medium, o.campaign, o.channel, o.heard_about, o.heard_about_other
                     from public.account_origins o join public.users u on u.id = o.user_id where u.email = ${email}`,
    );
    expect([...origin]).toEqual([
      { source: 'leaflet', medium: null, campaign, channel: 'print', heard_about: 'other', heard_about_other: 'A leaflet on the test centre noticeboard' },
    ]);
  });
});

// The admin portal is a desktop screen, and says so on a phone (PRD 8.2).
test.describe('the Visitors screen (D-413)', { tag: '@desktop-only' }, () => {
  test.use({ storageState: authFile('admin') });

  test('shows the visits, narrows them by anything in its lists, and downloads what it shows', async ({ page }, testInfo) => {
    const campaign = campaignFor(testInfo, 'admin');
    // Three pages in two visits this hour: a card scanned on a phone in Belvedere and read on, and a
    // search from a computer in London.
    await withDatabase(
      (sql) => sql`insert into public.site_visits (path, entry, landing, channel, source, campaign, country, city, device, browser, system) values
        ('/join', true, '/join', 'print', 'card', ${campaign}, 'GB', 'Belvedere', 'phone', 'Safari', 'iOS'),
        ('/pricing', false, '/join', 'print', 'card', ${campaign}, 'GB', 'Belvedere', 'phone', 'Safari', 'iOS'),
        ('/instructors-software', true, '/instructors-software', 'search', 'google', ${campaign}, 'GB', 'London', 'computer', 'Edge', 'Windows')`,
    );

    await page.goto(`/admin/visitors?range=today&campaign=${campaign}`);
    await expect(page.getByRole('heading', { level: 1, name: 'Visitors' })).toBeVisible();
    await expect(page.locator('dl[aria-label="Visitors at a glance"] > div').filter({ hasText: /^Visits/ }).locator('dd > span').first()).toHaveText('2');
    await expect(page.locator('dl[aria-label="Visitors at a glance"] > div').filter({ hasText: /^Page views/ }).locator('dd > span').first()).toHaveText('3');
    await expect(page.getByRole('navigation', { name: 'Filters chosen' })).toContainText(`Campaign: ${campaign}`);

    const sources = page.getByRole('region', { name: 'Sources' });
    await expect(sources.getByRole('link', { name: /^Business card/ })).toBeVisible();
    await expect(sources.getByRole('link', { name: /^Google/ })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'admin-visitors');

    // Choosing a device narrows everything to it, and the filter can be taken away again.
    await page.getByRole('region', { name: 'Devices' }).getByRole('link', { name: /^Phone/ }).click();
    await expect(page).toHaveURL(/device=phone/);
    await expect(page.locator('dl[aria-label="Visitors at a glance"] > div').filter({ hasText: /^Visits/ }).locator('dd > span').first()).toHaveText('1');
    await expect(page.getByRole('region', { name: 'Towns' })).not.toContainText('London');
    await page.getByRole('navigation', { name: 'Filters chosen' }).getByRole('link', { name: /^Device: Phone/ }).click();
    await expect(page).not.toHaveURL(/device=phone/);

    // The spreadsheet holds the same visits.
    const download = page.getByRole('link', { name: 'Download as a spreadsheet' });
    await expect(download).toHaveAttribute('href', new RegExp(`campaign=${campaign}`));
    const file = await page.request.get((await download.getAttribute('href')) ?? '');
    expect(file.headers()['content-type']).toContain('text/csv');
    const lines = (await file.text()).trim().split('\r\n');
    expect(lines[0]).toContain('Hour,Page,First page of the visit');
    expect(lines).toHaveLength(4);
  });
});
