import { brand } from '@repo/config/brand';
import { foundingOffer, freeTrial, plans } from '@repo/config/plans';
import { expect, test, type Page } from '@playwright/test';
import { withDatabase } from '../support/database';
import { expectAccessible, robotsOf, settled, snap } from '../support/helpers';

/** Whole pounds, as the site writes them. */
const pounds = (pence: number): string => `£${String(pence / 100)}`;

/** The words printed beside each piece's code, and the page's own for anybody who came another way. */
const headlines = {
  default: 'Less admin. More lessons. Paid on time.',
  card: 'Pro free for a year.',
  leaflet: 'Your last lesson ends at six. Your admin doesn’t.',
  flyer: 'Less admin. Paid on time.',
} as const;

/** The founding places as the database counts them, read after the page: it may be behind, never ahead. */
async function foundingPlaces(): Promise<{ limit: number; joined: number; open: boolean }> {
  return withDatabase(async (sql) => {
    const [row] = await sql<{ places: { instructorLimit: number; instructorsJoined: number } }[]>`
      select public.founding_places() as places`;
    if (!row) throw new Error('no founding places answer');
    const { instructorLimit: limit, instructorsJoined: joined } = row.places;
    return { limit, joined, open: joined < limit };
  });
}

/** The button's words while the founding places are open, and once they have gone (D-251). */
const actionFor = (open: boolean): string => (open ? 'Claim your founding place' : 'Create your free account');

/** The page's sign-up buttons: the opening's, one at the end of five parts, the founding offer's and the closing call's. */
const signUpButtons = 8;

/** A pattern for a string as it is, for building a RegExp around it. */
const literally = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, (character) => `\\${character}`);

/** Brings an element to the top of the screen, as somebody scrolling down to it would. */
async function scrollTo(page: Page, id: string): Promise<void> {
  await page.evaluate((target) => {
    document.getElementById(target)?.scrollIntoView({ block: 'start' });
  }, id);
}

/**
 * The page the printed QR codes open (PRD 8.3, 9.18, D-403): the card, the leaflet and the flyer
 * each open it on their own words, and sign-up carries on where somebody came from.
 */
test.describe('the page the printed pieces open (D-403)', () => {
  test('opens on each printed piece’s own words, and carries where it came from on to sign-up', async ({ page }, testInfo) => {
    const { open } = await foundingPlaces();
    for (const piece of ['card', 'leaflet', 'flyer'] as const) {
      await page.goto(`/join?utm_source=${piece}`);
      // The card's headline is the offer, so it is the page's own once the places have gone.
      const expected = piece === 'card' && !open ? headlines.default : headlines[piece];
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(expected);
      // Every one of the page's buttons carries it on, all the way down.
      const buttons = page.getByRole('link', { name: actionFor(open) });
      await expect(buttons).toHaveCount(signUpButtons);
      for (const button of await buttons.all()) {
        await expect(button).toHaveAttribute('href', new RegExp(`/sign-up\\?role=instructor&utm_source=${piece}$`));
      }
      // Over every headline but the card's, which already is the offer.
      const badge = page.getByText(/^Founding offer: Pro free for/);
      if (piece === 'card' && open) await expect(badge).toBeHidden();
      else if (open) await expect(badge).toBeVisible();
      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, `join-${piece}`, { fullPage: false });
    }

    // Anybody else gets the page's own opening, and any other source is still carried on.
    await page.goto('/join?utm_source=linkedin');
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(headlines.default);
    await expect(page.getByRole('link', { name: actionFor(open) }).first()).toHaveAttribute('href', /\/sign-up\?role=instructor&utm_source=linkedin$/);
  });

  test('tells the story the leaflet tells, with every figure from the configuration', async ({ page }, testInfo) => {
    await page.goto('/join');
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(headlines.default);
    const { limit, joined, open } = await foundingPlaces();
    await expect(page.getByRole('link', { name: actionFor(open) }).first()).toHaveAttribute('href', /\/sign-up\?role=instructor$/);
    await expect(page.getByText('Free to start. No card needed. Set up in about 20 minutes.')).toBeVisible();

    // Out of search, which the page for instructors is in, at its one address.
    expect(await robotsOf(page)).toContain('noindex');
    expect(new URL((await page.locator('link[rel="canonical"]').getAttribute('href')) ?? '').pathname).toBe('/join');

    const oldWay = page.getByRole('region', { name: 'Sound familiar?' });
    await expect(oldWay).toContainText('I’ll transfer it tonight x');
    await expect(oldWay).toContainText('£2,080');
    await expect(oldWay).toContainText('a year, if one lesson a week cancels late at £40.');

    const fix = page.getByRole('region', { name: 'It’s a 20 minute fix.' });
    await expect(fix.getByRole('listitem')).toHaveCount(3);
    await expect(fix).toContainText('once we have checked your badge');

    // Each of the four jobs links to where it is shown, as it looks in the app.
    const jobs = page.getByRole('region', { name: 'Four jobs off your list' });
    for (const [title, id] of [
      ['Learners book themselves', 'bookings'],
      ['Paid before the lesson', 'payments'],
      ['Late cancels covered', 'late-cancels'],
      ['Records in under a minute', 'lesson-records'],
    ] as const) {
      await expect(jobs.getByRole('link', { name: title })).toHaveAttribute('href', `#${id}`);
      await expect(page.getByRole('region', { name: title })).toBeVisible();
    }
    // The reminders in the app's own words, and texts sold as Pro.
    const reminders = page.getByRole('region', { name: 'Late cancels covered' });
    await expect(reminders).toContainText('the day before and two hours before');
    await expect(reminders).toContainText('On Pro');

    const money = page.getByRole('region', { name: 'Fair, simple and local.' });
    const pro = plans.pro;
    await expect(money).toContainText(`Pro at ${pounds(pro.monthlyPricePence)} a month or ${pounds(pro.yearlyPricePence ?? 0)} a year`);
    await expect(money).toContainText(`for up to ${String(plans.free.entitlements.activeLearners)} learners at a time`);
    await expect(money).toContainText('about 1.5% plus 20p');
    await expect(money).toContainText(`${brand.name} takes nothing from lessons with your own learners`);
    if (open) await expect(money).toContainText(`Pro free, as one of the first ${String(foundingOffer.instructorLimit)} instructors.`);
    // The company, where anybody can check it.
    await expect(money.getByRole('link', { name: `company number ${brand.company.number}` })).toHaveAttribute(
      'href',
      `https://find-and-update.company-information.service.gov.uk/company/${brand.company.number}`,
    );
    await expect(money.getByRole('link', { name: brand.icoRegistration })).toHaveAttribute('href', `https://ico.org.uk/ESDWebPages/Entry/${brand.icoRegistration}`);

    const founder = page.getByRole('region', { name: 'Hi, I’m Talha.' });
    await expect(founder).toContainText('I passed my driving test in January 2025');
    await expect(founder).toContainText('I’ll set it up with you in person');

    // The objections, each opening onto its answer.
    const questions = page.getByRole('region', { name: 'What instructors ask me' });
    for (const question of [
      'I already use another app.',
      'What’s the catch?',
      'What if you shut down?',
      'My learners won’t use an app.',
      'I’m not good with tech.',
      open ? 'What happens after the year?' : 'What happens after your free time?',
      'Can I bring my learners?',
      'Does it work without signal?',
    ]) {
      await expect(questions.getByText(question, { exact: true })).toBeVisible();
    }
    const answer = questions.getByText('Your money never sits with us.', { exact: false });
    await expect(answer).toBeHidden();
    await questions.getByText('What if you shut down?', { exact: true }).click();
    await expect(answer).toBeVisible();

    // The founding places from the database's own count, never above it (D-243), and what comes after.
    const count = page.getByTestId('founding-count');
    await expect(count).toBeVisible();
    const headline = (await count.locator('span').first().textContent())?.trim() ?? '';
    const taken = /^(\d+)\/(\d+) joined$/.exec(headline);
    if (taken) {
      expect(Number(taken[2])).toBe(limit);
      expect(Number(taken[1])).toBeLessThanOrEqual(joined);
    } else if (open) {
      expect(headline).toBe(`${String(limit)} places open`);
    }
    if (open) {
      await expect(page.getByText(`After the first ${String(foundingOffer.instructorLimit)}, it’s ${String(freeTrial.longDays)} days free for the next ${String(freeTrial.first)}.`)).toBeVisible();
    }

    const closing = page.getByRole('region', { name: open ? 'Claim your founding place.' : 'Start free today.' });
    await expect(closing.getByRole('link', { name: actionFor(open) })).toHaveAttribute('href', /\/sign-up\?role=instructor$/);
    // A chat on WhatsApp, as the product owner agreed for this page (D-277, D-404), with the number
    // itself never written out.
    const whatsApp = new RegExp(`^${literally(brand.supportPhone.whatsApp)}\\?text=`);
    await expect(closing.getByRole('link', { name: 'Message Talha on WhatsApp' })).toHaveAttribute('href', whatsApp);
    await expect(page.getByRole('region', { name: 'Book a free onboarding call' }).getByRole('link', { name: 'Message Talha on WhatsApp' })).toHaveAttribute(
      'href',
      whatsApp,
    );
    await expect(page.getByText(brand.supportPhone.display)).toHaveCount(0);
    // And the button again at the end of each part, each to sign up.
    await expect(page.getByRole('link', { name: actionFor(open) })).toHaveCount(signUpButtons);

    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'join');
  });

  test('keeps its button at the foot of a phone’s screen between the opening and the founding offer @phone-only', async ({ page }, testInfo) => {
    await page.goto('/join?utm_source=flyer');
    const { open } = await foundingPlaces();
    const bar = page.locator('[data-sticky-action]');
    // At the top the opening's own button is in view.
    await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(headlines.flyer);
    await expect(bar).toBeHidden();
    await expect(bar).toHaveAttribute('inert', '');

    await scrollTo(page, 'with-us');
    await expect(bar).toBeVisible();
    await expect(bar).not.toHaveAttribute('inert');
    await expect(bar.getByRole('link', { name: actionFor(open) })).toHaveAttribute('href', /\/sign-up\?role=instructor&utm_source=flyer$/);
    await settled(page);
    await snap(page, testInfo, 'join-phone-bar', { fullPage: false });

    // Out of the way of every part's own button, the booking and the founding offer's.
    await scrollTo(page, 'action-stories');
    await expect(bar).toBeHidden();
    await scrollTo(page, 'onboarding-call');
    await expect(bar).toBeHidden();
    await scrollTo(page, 'founding-places');
    await expect(bar).toBeHidden();
    await scrollTo(page, 'claim');
    await expect(bar).toBeHidden();
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await expect(bar).toBeHidden();
    // And back again on the way up, where no other button is in view.
    await scrollTo(page, 'payments');
    await expect(bar).toBeVisible();
  });

  test('loads the setup video and the onboarding call only when somebody asks for them (D-405)', async ({ page }, testInfo) => {
    // Stand-ins for both, so the test asks neither company for anything, and a record of every
    // request that would have gone to either.
    const asked: string[] = [];
    page.on('request', (request) => {
      if (/(^|\.)(youtube-nocookie\.com|youtube\.com|ytimg\.com|calendly\.com)$/.test(new URL(request.url()).hostname)) asked.push(request.url());
    });
    await page.route(/^https:\/\/(www\.youtube-nocookie\.com|calendly\.com)\//, (route) =>
      route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Stand-in</title><p>Stand-in</p>' }),
    );
    await page.goto('/join');

    const video = page.getByRole('button', { name: /^Play the video, How to set up your driving instructor diary in .+, 6:31$/ });
    await expect(video).toBeVisible();
    const booking = page.getByRole('region', { name: 'Book a free onboarding call' });
    await expect(booking.getByRole('button', { name: 'Choose a time' })).toBeVisible();
    await expect(booking.getByRole('link', { name: /^Open the booking page/ })).toHaveAttribute('href', brand.onboardingCall);
    // Scanned as it opens, before anything from another company is in it.
    await expectAccessible(page);
    expect(asked, 'nothing went to YouTube or Calendly before anybody asked').toEqual([]);

    await video.click();
    await expect(page.locator('iframe[src*="youtube-nocookie.com"]')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/NXm0hbDlRlY?autoplay=1&rel=0');
    await booking.getByRole('button', { name: 'Choose a time' }).click();
    await expect(booking.locator('iframe')).toHaveAttribute(
      'src',
      `${brand.onboardingCall}?embed_domain=${encodeURIComponent(brand.domain)}&embed_type=Inline&hide_event_type_details=1`,
    );
    await expect(booking.locator('iframe')).toHaveAttribute('title', 'Choose a time for your free onboarding call');
    expect(asked.length, 'each was asked for once somebody asked').toBeGreaterThan(0);
    await booking.scrollIntoViewIfNeeded();
    await settled(page);
    await snap(page, testInfo, 'join-booking-open', { fullPage: false });
  });

  test('waits for the cookie question to be answered, which sits where it would @phone-only', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] }, viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    try {
      const page = await context.newPage();
      await page.goto('/join');
      const question = page.getByRole('dialog', { name: 'Cookies' });
      await expect(question).toBeVisible();
      await scrollTo(page, 'with-us');
      const bar = page.locator('[data-sticky-action]');
      await expect(bar).toBeHidden();
      await question.getByRole('button', { name: 'No thanks' }).click();
      await expect(question).toBeHidden();
      await expect(bar).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test('has no bar on a wide screen, where its buttons are never far @desktop-only', async ({ page }) => {
    await page.goto('/join');
    await scrollTo(page, 'with-us');
    await expect(page.locator('[data-sticky-action]')).toBeHidden();
  });

  test('opens and leads to sign-up without a script, on the page’s own words', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto('/join?utm_source=card');
      await expect(page.getByRole('heading', { level: 1 })).toHaveAccessibleName(headlines.default);
      const { open } = await foundingPlaces();
      await expect(page.getByRole('link', { name: actionFor(open) }).first()).toHaveAttribute('href', /\/sign-up\?role=instructor$/);
      // The questions are the browser's own, so they open without one too.
      await page.getByText('Can I bring my learners?', { exact: true }).click();
      await expect(page.getByText('Import them from a spreadsheet, or invite each one by WhatsApp, text or email.', { exact: false })).toBeVisible();
    } finally {
      await context.close();
    }
  });
});
