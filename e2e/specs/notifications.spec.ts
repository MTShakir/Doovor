import { expect, test } from '@playwright/test';
import { authFile, roles, type RoleKey } from '../support/accounts';
import { clearNotifications, notify } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';

/**
 * The notification core (NTF-01, NTF-04, M2-27): what somebody has been told, and what they
 * want to hear about.
 *
 * An account of its own for every test and every width. Clearing an inbox and marking it read
 * are both about the whole inbox, and everything here runs at the same time as everything
 * else. So none of these is an account whose inbox another test reads: a lesson record tells
 * Jack Taylor, and a disputed no-show tells Sarah Khan.
 */
test.describe('notifications (NTF-01, NTF-04, M2-27)', () => {
  const accounts: Record<string, RoleKey[]> = {
    mobile: ['schoolOwner', 'schoolInstructor'],
    desktop: ['schoolManager', 'trainee'],
  };
  const who = (project: string, nth: number): RoleKey => accounts[project]?.[nth] ?? 'schoolOwner';

  test('shows what somebody has been told, and clears it', async ({ browser }, testInfo) => {
    const role = who(testInfo.project.name, 0);
    const email = roles[role].email;
    await clearNotifications(email);
    await notify(email, {
      kind: 'booking.confirmed',
      category: 'bookings',
      title: 'Lesson booked',
      body: 'Wed 16 Sep at 09:00 with Sarah Khan.',
      link: '/notifications/settings',
    });
    await notify(email, {
      kind: 'booking.cancelled',
      category: 'bookings',
      title: 'Lesson cancelled',
      body: 'Thu 17 Sep at 09:00 with Sarah Khan. A fee of £42 applies.',
    });

    const context = await browser.newContext({ storageState: authFile(role) });
    const page = await context.newPage();
    await page.goto('/notifications');

    await expect(page.getByRole('heading', { level: 1, name: 'Notifications' })).toBeVisible();
    // By title, not by count: the job runner writes real ones whenever it is running.
    const cancelled = page.getByRole('article').filter({ hasText: 'Lesson cancelled' });
    await expect(cancelled).toContainText('A fee of £42 applies');
    await expect(page.getByRole('article').filter({ hasText: 'Lesson booked' })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'notifications');

    await page.getByRole('button', { name: /^Mark all as read/ }).click();
    await expect(page.getByText('All marked as read')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Mark all as read/ })).toBeHidden();
    await context.close();
  });

  test('switches a channel off, and it stays off', async ({ browser }, testInfo) => {
    const role = who(testInfo.project.name, 1);
    await clearNotifications(roles[role].email);

    const context = await browser.newContext({ storageState: authFile(role) });
    const page = await context.newPage();
    await page.goto('/notifications/settings');

    await expect(page.getByRole('heading', { level: 1, name: 'What you hear about' })).toBeVisible();
    // A lesson somebody booked always reaches the list, so there is no switch for that.
    const lessons = page.getByRole('region', { name: 'Lessons' });
    await expect(lessons).toContainText('Always on');

    const email = lessons.getByRole('switch', { name: 'Email' });
    await expect(email).toBeChecked();
    await expectAccessible(page);
    await snap(page, testInfo, 'notification-settings');

    // The switch moves at once and saves behind it, so wait for the save, not the movement.
    const saved = page.waitForResponse(
      (response) => response.request().method() === 'POST' && response.url().includes('/notifications/settings'),
    );
    await email.click();
    await expect(email).not.toBeChecked();
    await saved;

    // It was really saved, not only moved on screen.
    await page.reload();
    await expect(page.getByRole('region', { name: 'Lessons' }).getByRole('switch', { name: 'Email' })).not.toBeChecked();
    await context.close();
  });
});
