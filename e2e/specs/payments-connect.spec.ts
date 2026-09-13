import { expect, test } from '@playwright/test';
import { authFile, roles } from '../support/accounts';
import { clearPaymentsAccount, paymentsAccountOf } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';

/**
 * Connecting a Business to its own payments account (PAY-01, M3-02).
 *
 * Local runs use the fake provider, whose onboarding is a page of this app rather than
 * Stripe's, so the whole round trip is walked here: set up, finish, come back, ready. The same
 * flow runs against Stripe test mode in M3-23.
 */
test.describe('connecting payments (PAY-01, M3-02)', () => {
  test('an owner sets it up, finishes, and comes back able to take cards', async ({ browser }, testInfo) => {
    // The school's owner, whose Business nothing else asserts about: connecting payments
    // changes what the instructor's own checklist says about theirs.
    const email = roles.schoolOwner.email;
    await clearPaymentsAccount(email);

    const context = await browser.newContext({ storageState: authFile('schoolOwner') });
    const page = await context.newPage();
    await page.goto('/app/school/money');

    const card = page.getByRole('region', { name: 'Card payments' });
    await expect(card).toContainText('Set this up once');
    await expect(card.getByText('Off', { exact: true })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'payments-off');

    // Off to the provider, which sends them back when they have finished. The button does
    // nothing until the page is interactive, so the proof it worked is where it lands (D-043).
    await expect(async () => {
      await card.getByRole('button', { name: 'Set up payments' }).click();
      await page.waitForURL(/connected=1/, { timeout: 5000 });
    }).toPass({ timeout: 20_000 });

    await expect(card.getByText('On', { exact: true })).toBeVisible();
    await expect(card).toContainText('You can take card, Apple Pay and Google Pay.');
    await snap(page, testInfo, 'payments-on');

    expect(await paymentsAccountOf(email), 'the account is written down against the Business').toMatch(/^fake_acct_/);

    // Left as it was found, so nothing else has to know this test ran.
    await clearPaymentsAccount(email);
    await context.close();
  });

  test('somebody who does not own the business is told so @desktop-only', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('schoolManager') });
    const page = await context.newPage();
    await page.goto('/app/school/money');

    const card = page.getByRole('region', { name: 'Card payments' });
    await expect(card).toContainText('Only the owner of the business can set payments up.');
    await expect(card.getByRole('button', { name: /Set up payments|Finish setting up/ })).toBeHidden();
    await context.close();
  });
});
