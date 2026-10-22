import { expect, test } from '@playwright/test';
import { fillLearnerList, makeInstructor, openEveryDay } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const inDays = (days: number): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(Date.now() + days * 86_400_000));

/**
 * A full list on Free takes nobody new, and says so before anybody makes an account to book
 * (BOK-02, PUB-03, D-208, D-357). With a place free, a visitor who chooses a time is not asked
 * again what they are here for (D-358).
 */
test.describe('a full list (D-357, D-358)', () => {
  test('a visitor is told before choosing a time, and with a place free goes straight to making an account', async ({ page }, testInfo) => {
    const instructor = await makeInstructor(`Full List ${testInfo.project.name}`, inDays(400), { listed: false });
    await openEveryDay(instructor.slug);
    const list = await fillLearnerList(instructor.slug);
    try {
      await page.goto(`/instructors/leeds/${instructor.slug}`);
      await expect(page.getByText('Not taking new learners').filter({ visible: true })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Book a lesson' })).toHaveCount(0);
      await expect(page.getByRole('region', { name: 'Next free times' })).toHaveCount(0);

      await page.goto(`/book/${instructor.slug}`);
      await expect(page.getByText('Not taking new learners', { exact: true })).toBeVisible();
      await expect(page.getByText(`${instructor.name} has no room for anybody new at the moment. Already learning with them? Sign in to book.`)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Sign in to book' })).toHaveAttribute('href', `/sign-in?next=${encodeURIComponent(`/book/${instructor.slug}`)}`);
      await expect(page.getByRole('link', { name: 'Find another instructor near you' })).toHaveAttribute('href', /\/learners#find-an-instructor$/);
      await expect(page.getByLabel('Which day?')).toHaveCount(0);
      await expectAccessible(page);
      await snap(page, testInfo, 'booking-link-full-list');

      // The instructor is told what their link and profile now say.
      await signInThroughForm(page, instructor.email, { next: '/app/instructor/learners' });
      await expect(page.getByRole('region', { name: '10 of 10 learners' })).toContainText(
        'your booking link and profile tell anybody new you are not taking new learners',
      );
      await page.context().clearCookies();

      // A place comes free, and the link takes somebody new again.
      await list.freeOne();
      await page.goto(`/book/${instructor.slug}`);
      const times = page.getByRole('group', { name: /^Times on/ });
      await times.getByRole('button').first().click();
      await page.getByRole('button', { name: /^Continue with \d\d:\d\d$/ }).click();
      await expect(page).toHaveURL(/\/sign-up\?role=learner$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Create your learner account' })).toBeVisible();
    } finally {
      await list.remove();
      await instructor.remove();
    }
  });
});
