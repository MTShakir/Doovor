import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { auditActionsAbout, bookLesson, lessonStatus, makeSchoolLearner, removeLesson } from '../support/database';
import { dayLabel, expectAccessible, snap, tapUntil } from '../support/helpers';

/** A local day, however the machine running the tests is set (the browser is London). */
const londonDay = (inDays: number): string => {
  const day = new Date();
  day.setDate(day.getDate() + inDays);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(day);
};

// Staff start viewing from the admin portal, which is a desktop screen (PRD 8.2).
test.describe('viewing as somebody, read only (ADM-06, M5-21)', { tag: '@desktop-only' }, () => {
  test('writes refused while viewing as: support staff see a learner lessons as they do, change nothing, and stop', async ({ browser }, testInfo) => {
    const learner = await makeSchoolLearner('Vera Viewed', { postcode: 'M13 9PL', transmission: 'manual' });
    // Six weeks out at dawn: past the days the seed fills, and a time no other test books.
    const day = londonDay(42);
    await bookLesson('Tom Walsh', learner.email, day, '06:30');
    const context = await browser.newContext({ storageState: authFile('support') });
    try {
      const page = await context.newPage();
      await page.goto(`/admin/learners?q=${encodeURIComponent(learner.email)}`);
      await page.getByRole('button', { name: /^Vera Viewed/ }).click();
      await page.getByRole('dialog', { name: 'Vera Viewed' }).getByRole('button', { name: 'View as Vera Viewed' }).click();

      // Asked why, which goes in the audit log.
      const question = page.getByRole('dialog', { name: 'View as Vera Viewed?' });
      await question.getByRole('button', { name: 'View as them' }).click();
      await expect(question.getByRole('alert')).toHaveText('Say why you need to see what they see');
      await question.getByLabel('Why?').fill('She says her lesson in six weeks is missing.');
      await question.getByRole('button', { name: 'View as them' }).click();

      // Her portal, as she sees it, with the banner on every screen.
      await expect(page).toHaveURL(/\/app\/learner$/);
      const banner = page.getByRole('status').filter({ hasText: 'Viewing as Vera Viewed, read only, until' });
      await expect(banner).toBeVisible();
      await page.goto('/app/learner/lessons');
      await expect(banner).toBeVisible();
      const lesson = page.getByRole('region', { name: 'Coming up' }).getByRole('article').filter({ hasText: `${dayLabel(day)} at 06:30` });
      await expect(lesson).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'admin-view-as', { fullPage: false });

      // Nothing she could do changes anything while staff look.
      await tapUntil(lesson.getByRole('button', { name: 'Cancel' }), page.getByRole('dialog', { name: 'Cancel this lesson?' }));
      await page.getByRole('button', { name: 'Yes, cancel it' }).click();
      await expect(page.getByText('You are viewing as someone else. Changes are turned off.')).toBeVisible();
      expect(await lessonStatus('Tom Walsh', learner.email, day, '06:30')).toBe('confirmed');

      // Her account and devices are not staff's to open.
      await page.goto('/account');
      await expect(page).toHaveURL(/\/app\/learner$/);

      // Stopping goes back to the admin portal as themselves.
      await banner.getByRole('button', { name: 'Stop viewing' }).click();
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeVisible();
      await page.goto('/app/learner/lessons');
      await expect(page).toHaveURL(/\/admin$/);
      expect(await auditActionsAbout(learner.email)).toEqual(['impersonation.started', 'impersonation.ended']);
    } finally {
      await context.close();
      await removeLesson('Tom Walsh', learner.email, day, '06:30');
      await learner.remove();
    }
  });
});
