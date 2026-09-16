import { expect, test } from '@playwright/test';
import { captureEvent, lessonRequestEntry, waitingListEntry } from '../support/database';
import { expectAccessible, settled, snap } from '../support/helpers';

/**
 * Coming soon (MKT-10, M5-10). The database counts each caller's address, so every test comes from
 * an address of its own and a rerun is never turned away for an earlier one.
 */
test.use({ extraHTTPHeaders: { 'x-forwarded-for': `203.0.113.${String(1 + Math.floor(Math.random() * 250))}` } });

test.describe('coming soon: the waiting list and lesson requests (MKT-10, M5-10)', () => {
  test('a learner with no account checks their area, joins its waiting list with consent, and the email removes it', async ({
    page,
  }, testInfo) => {
    const email = `waiting.${testInfo.project.name}.${String(Date.now())}@example.com`;
    await page.goto('/learners#find-an-instructor');
    const finder = page.getByRole('region', { name: 'Find an instructor near you' });
    await finder.getByLabel('Your postcode').fill('ls6 3qs');
    await finder.getByRole('button', { name: 'Check my area' }).click();

    await expect(finder.getByRole('heading', { name: 'Finding instructors near LS6 3QS is coming soon' })).toBeFocused();
    await expect(finder.getByRole('link', { name: /^See the \d+ instructors? we have checked in Leeds$/ })).toHaveAttribute('href', '/driving-lessons/leeds');
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'coming-soon-area', { fullPage: false });

    await finder.getByRole('button', { name: 'Join the waiting list' }).click();
    await expect(finder.getByRole('heading', { name: 'Join the waiting list for LS' })).toBeFocused();
    await finder.getByLabel('Your name').fill('Wendy Waiting');
    await finder.getByLabel('Your email').fill(email);
    await finder.getByRole('button', { name: 'Join the waiting list' }).click();
    // Nothing is kept without the box ticked.
    await expect(finder.getByText('Tick the box so we may keep this and email you about it')).toBeVisible();
    expect(await waitingListEntry(email)).toBeNull();

    const consent = 'Keep my details and email me when I can find and book driving instructors near LS. I can leave the list at any time.';
    await finder.getByRole('checkbox', { name: consent }).click();
    await expectAccessible(page);
    await finder.getByRole('button', { name: 'Join the waiting list' }).click();
    await expect(finder.getByRole('heading', { name: 'You are on the waiting list for LS' })).toBeFocused();
    await settled(page);
    await snap(page, testInfo, 'coming-soon-joined', { fullPage: false });

    // Kept with the words agreed to, and confirmed by email once.
    const entry = await waitingListEntry(email);
    expect(entry?.consentWording).toBe(consent);
    const event = await captureEvent(entry?.id ?? '');
    expect(event?.payload).toEqual({ kind: 'waiting_list', id: entry?.id });
    expect(await (await page.request.post('/dev/events', { data: event })).json()).toEqual({ sent: true });
    expect(await (await page.request.post('/dev/events', { data: event })).json()).toEqual({ sent: false, reason: 'already_sent' });
    expect((await waitingListEntry(email))?.confirmationSentAt).not.toBeNull();

    // The email's button leads to the details, and one press removes them.
    await page.goto(`/your-details/${entry?.token ?? ''}`);
    await expect(page.getByRole('list', { name: 'What we keep' }).getByRole('listitem')).toHaveText(['A place on the waiting list for LS']);
    await expectAccessible(page);
    await snap(page, testInfo, 'your-details');
    await page.getByRole('button', { name: 'Remove my details' }).click();
    await expect(page.getByText('Your details are removed.')).toBeVisible();
    expect((await waitingListEntry(email))?.removedAt).not.toBeNull();
    await page.reload();
    await expect(page.getByText('We keep nothing for this email address now')).toBeVisible();

    await page.goto('/your-details/not-a-token');
    await expect(page.getByText('This link is not one of ours.')).toBeVisible();
  });

  test('a lesson request says what the learner needs, when and for how much', async ({ page }, testInfo) => {
    const email = `request.${testInfo.project.name}.${String(Date.now())}@example.com`;
    await page.goto('/learners#find-an-instructor');
    const finder = page.getByRole('region', { name: 'Find an instructor near you' });
    await finder.getByLabel('Your postcode').fill('M13 9PL');
    await finder.getByRole('button', { name: 'Check my area' }).click();
    await expect(finder.getByRole('heading', { name: 'Finding instructors near M13 9PL is coming soon' })).toBeVisible();

    await finder.getByRole('button', { name: 'Post a lesson request' }).click();
    await expect(finder.getByRole('heading', { name: 'Tell us the lessons you need near M' })).toBeFocused();
    await finder.getByLabel('Your name').fill('Rory Request');
    await finder.getByLabel('Your email').fill(email);
    await finder.getByLabel('Which gearbox?').selectOption('automatic');
    await finder.getByLabel('How far along are you?').selectOption('none');
    await finder.getByRole('button', { name: 'Post my request' }).click();
    await expect(finder.getByText('Choose at least one day')).toBeVisible();
    await expect(finder.getByText('Choose at least one time of day')).toBeVisible();

    const days = finder.getByRole('group', { name: 'Which days suit you?' });
    await days.getByRole('button', { name: 'Mon' }).click();
    await days.getByRole('button', { name: 'Sat' }).click();
    await expect(days.getByRole('button', { name: 'Sat' })).toHaveAttribute('aria-pressed', 'true');
    await finder.getByRole('group', { name: 'What time of day?' }).getByRole('button', { name: 'Evenings' }).click();
    await finder.getByLabel('When would you like to start?').selectOption('this_month');
    await finder.getByLabel('The most you would pay for an hour').fill('42.50');
    await finder
      .getByRole('checkbox', {
        name: 'Keep my lesson request and email me about it when instructors near M can take bookings through the app. I can withdraw it at any time.',
      })
      .click();
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'coming-soon-request');
    await finder.getByRole('button', { name: 'Post my request' }).click();
    await expect(finder.getByRole('heading', { name: 'Your lesson request is in' })).toBeFocused();

    expect(await lessonRequestEntry(email)).toMatchObject({ days: [1, 6], times: ['evening'], budgetPence: 4250, startWhen: 'this_month', removedAt: null });
    await expect(finder.getByRole('button', { name: 'Join the waiting list as well' })).toBeVisible();
  });
});
