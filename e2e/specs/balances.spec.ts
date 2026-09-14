import { expect, test } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import { bookLesson, clearPaymentsAccount, giveCredit, holdPaymentsBusiness, userIdOf } from '../support/database';
import { dayLabel, expectAccessible, settled, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/**
 * A learner's balance, the same on both sides (PAY-05, PAY-06, M3-16).
 *
 * Emma Clarke's learners, one for each width. Only this file and the payments file change their
 * credit, and the two take turns through the same lock.
 */
test.describe.configure({ mode: 'serial' });

let letGo: (() => Promise<void>) | undefined;

test.beforeAll(async () => {
  test.setTimeout(10 * 60_000);
  letGo = await holdPaymentsBusiness();
});

test.afterAll(async () => {
  await letGo?.();
});

test.describe('what a learner has and owes (PAY-06, M3-16)', () => {
  const owner = roles.schoolOwner.email;
  const school = 'Quayside Driving School';
  const learnerFor = (project: string) =>
    project === 'mobile'
      ? { email: 'isla.roberts@example.com', name: 'Isla Roberts' }
      : { email: 'amelia.evans@example.com', name: 'Amelia Evans' };

  /** Some days back for each width, so the lesson has been owed long enough to be overdue. */
  const pastDay = (project: string): string => {
    const day = new Date();
    day.setDate(day.getDate() - (project === 'mobile' ? 3 : 4));
    return day.toISOString().slice(0, 10);
  };

  test('the learner and their instructor see the same balance, and what the instructor records shows on both', async ({
    page,
    browser,
  }, testInfo) => {
    const learner = learnerFor(testInfo.project.name);
    const day = pastDay(testInfo.project.name);
    // A school that takes no cards, whatever another test left behind, so what is owed is paid in person.
    await clearPaymentsAccount(owner);
    await giveCredit(learner.email, owner, 90, 5700);
    // Before the seed's first lesson of any day, so nothing else is at that time.
    await bookLesson('Emma Clarke', learner.email, day, '07:00');

    // The learner, on Payments.
    await signInThroughForm(page, learner.email, { next: '/app/learner/payments' });
    const theirs = page.getByRole('region', { name: `Balance with ${school}` });
    const theirLines = theirs.getByRole('list', { name: 'Balance' }).getByRole('listitem');
    await expect(theirLines.first()).toContainText('of credit');
    const learnerSees = await theirLines.allTextContents();
    const theirOwed = theirs.getByRole('list', { name: 'Lessons owed for' }).getByRole('listitem');
    const owedCount = await theirOwed.count();
    const early = theirOwed.filter({ hasText: `${dayLabel(day)} at 07:00` });
    await expect(early.getByText('Overdue', { exact: true })).toBeVisible();
    await expect(early.getByRole('link', { name: /^Pay £/ })).toHaveCount(0);
    await expectAccessible(page);
    await settled(page);
    await snap(page, testInfo, 'learner-balance');

    // Their instructor, on the learner card: the same lines, the same lessons.
    const instructor = await browser.newContext({ storageState: authFile('schoolInstructor') });
    const card = await instructor.newPage();
    await card.goto(`/app/instructor/learners/${await userIdOf(learner.email)}`);
    const money = card.getByRole('region', { name: 'Money' });
    const cardLines = money.getByRole('list', { name: 'Balance' }).getByRole('listitem');
    await expect(cardLines).toHaveText(learnerSees);
    const cardOwed = money.getByRole('list', { name: 'Lessons owed for' }).getByRole('listitem');
    await expect(cardOwed).toHaveCount(owedCount);
    await expectAccessible(card);

    // A package paid for in cash, recorded from the card.
    const sale = card.getByRole('dialog', { name: 'Package paid in person' });
    await expect(async () => {
      await money.getByRole('button', { name: 'Record a package paid in person' }).click();
      await expect(sale).toBeVisible({ timeout: 5000 });
    }).toPass({ timeout: 20_000 });
    await sale.getByLabel('Package').selectOption({ label: '5 hours, £195' });
    await expectAccessible(card);
    await snap(card, testInfo, 'sell-package');
    await sale.getByRole('button', { name: 'Paid in cash' }).click();
    await expect(card.getByText(`5 hours of credit added for ${learner.name}`)).toBeVisible();

    // And the overdue lesson, marked paid from the card in two taps.
    const lesson = cardOwed.filter({ hasText: `${dayLabel(day)} at 07:00` });
    await lesson.getByRole('button', { name: 'Mark paid' }).click();
    await card.getByRole('dialog', { name: `How did ${learner.name} pay?` }).getByRole('button', { name: 'Cash' }).click();
    await expect(lesson).toHaveCount(0);
    await expect(cardOwed).toHaveCount(owedCount - 1);
    await expect(money).toContainText('5 hours of credit bought');
    const instructorSees = await cardLines.allTextContents();
    await settled(card);
    await snap(card, testInfo, 'instructor-balance');
    await instructor.close();

    // The learner sees exactly that too.
    await page.reload();
    await expect(theirLines).toHaveText(instructorSees);
    await expect(theirOwed).toHaveCount(owedCount - 1);
    await expect(theirs).toContainText('5 hours of credit bought');
  });
});
