import { expect, test } from '@playwright/test';
import { enablePayments, makeInstructor, putOnPlan } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/**
 * Charging the saved card the day before is Pro (PAY-03, PRD 9.18, D-302).
 *
 * An instructor of their own at each width, made for the test and removed after it: the test moves
 * a Business between plans, which nobody else may see happen.
 */
test.describe('charging the day before is Pro (PAY-03, D-302)', () => {
  test('on Free it shows as Pro with the way to Pro, and a choice kept from Pro says what happens now', async ({ page }, testInfo) => {
    const instructor = await makeInstructor(`Day Before ${testInfo.project.name}`, '2030-01-01', { listed: false });
    try {
      await putOnPlan(instructor.slug, 'pro');
      await enablePayments(instructor.email, `fake_acct_day_before_${testInfo.project.name}_${String(Date.now())}`);
      await signInThroughForm(page, instructor.email, { next: '/app/instructor/money/setup' });

      // On Pro it is a choice like any other.
      const how = page.getByRole('region', { name: 'How learners pay' });
      const choice = how.getByLabel('Learners pay');
      await expect(choice.locator('option')).toHaveText(['When they book', 'The day before the lesson', 'After the lesson']);
      await expect(how.getByRole('link', { name: 'See what Pro includes' })).toHaveCount(0);
      await choice.selectOption('before_lesson');
      await expect(page.getByText('Learners now pay the day before the lesson')).toBeVisible();

      // Back on Free the choice is kept, shown as Pro, and the screen says what happens until then.
      await putOnPlan(instructor.slug, 'free');
      await page.reload();
      await expect(choice).toHaveValue('before_lesson');
      await expect(choice.locator('option')).toHaveText(['When they book', 'The day before the lesson (Pro)', 'After the lesson']);
      await expect(choice.locator('option[value="before_lesson"]')).toBeDisabled();
      await expect(how).toContainText('Until you are on Pro again, learners pay when they book.');
      await expect(how).toContainText('Charging the saved card the day before the lesson is part of Pro.');
      await expect(how.getByRole('link', { name: 'See what Pro includes' })).toHaveAttribute('href', '/app/instructor/plan');
      await expectAccessible(page);
      await snap(page, testInfo, 'payment-mode-on-free');

      // Everything else can still be chosen.
      await choice.selectOption('at_booking');
      await expect(page.getByText('Learners now pay when they book')).toBeVisible();
      await page.reload();
      await expect(choice).toHaveValue('at_booking');
      await expect(how).toContainText('The slot is held while they pay');
    } finally {
      await instructor.remove();
    }
  });
});
