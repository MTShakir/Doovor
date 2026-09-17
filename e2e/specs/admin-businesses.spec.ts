import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { makeInstructor } from '../support/database';
import { addDays, expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

// The admin portal is a desktop screen, and says so on a phone (PRD 8.2, portal-shells.spec.ts).
test.describe('Businesses for platform staff (ADM-02, M5-18)', { tag: '@desktop-only' }, () => {
  test('a suspended Business cannot book: a super admin suspends one, saying why, and reactivates it', async ({ page, browser }, testInfo) => {
    // Out of search, so the Leeds pages other tests read stay as the seed has them.
    const instructor = await makeInstructor('Sid Suspended', addDays(today(), 365), { listed: false });
    const business = `${instructor.name} Driving`;
    const admin = await browser.newContext({ storageState: authFile('admin') });
    const staff = await admin.newPage();
    const own = await browser.newContext();
    try {
      // Before: a learner can book through the instructor's link.
      await page.goto(`/book/${instructor.slug}`);
      await expect(page.getByLabel('Which lesson?')).toBeVisible();

      // Found by the instructor's email, and opened.
      await staff.goto('/admin/businesses');
      await expect(staff.getByRole('heading', { level: 1, name: 'Businesses' })).toBeVisible();
      await staff.getByLabel('Search Businesses').fill(instructor.email);
      await staff.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(staff.getByText('1 Business found')).toBeVisible();
      await staff.getByRole('button', { name: new RegExp(`^${business}`) }).click();
      const panel = staff.getByRole('dialog', { name: business });
      await expect(panel).toContainText('In good standing');
      await expect(panel.getByText(`Owner, verified · ${instructor.email}`)).toBeVisible();
      await panel.getByRole('button', { name: 'Suspend' }).click();

      // Asked first, and asked why.
      const question = staff.getByRole('dialog', { name: `Suspend ${business}?` });
      await question.getByRole('button', { name: 'Suspend' }).click();
      await expect(question.getByRole('alert')).toHaveText('Say why, so whoever looks at it next knows');
      await question.getByLabel('Why?').fill('The badge number belongs to another instructor.');
      await expectAccessible(staff);
      await snap(staff, testInfo, 'admin-business-suspend', { fullPage: false });
      await question.getByRole('button', { name: 'Suspend' }).click();
      await expect(staff.getByText(`${business} is suspended`)).toBeVisible();

      // The panel says when, by whom and why, and the list says so too.
      const suspended = staff.getByRole('dialog', { name: business });
      await expect(suspended.getByText(/^Suspended on \w{3} \d{1,2} \w{3} by /)).toBeVisible();
      await expect(suspended).toContainText('The badge number belongs to another instructor.');
      await expect(suspended.getByRole('button', { name: 'Reactivate' })).toBeVisible();
      await expectAccessible(staff);
      await snap(staff, testInfo, 'admin-business-suspended', { fullPage: false });
      await suspended.getByRole('button', { name: 'Close' }).click();
      await expect(staff.getByRole('button', { name: new RegExp(`^${business}`) })).toContainText('Suspended');

      // Nobody can book it: its link takes nobody (M5-18).
      await page.goto(`/book/${instructor.slug}`);
      await expect(page.getByText('This link is not taking bookings')).toBeVisible();
      await expect(page.getByLabel('Which lesson?')).toHaveCount(0);

      // Its instructor signs in to be told so, and their portal stays closed.
      const theirs = await own.newPage();
      await signInThroughForm(theirs, instructor.email);
      await expect(theirs).toHaveURL(/\/suspended$/);
      await expect(theirs.getByRole('heading', { level: 1, name: `${business} is suspended` })).toBeVisible();
      await expectAccessible(theirs);
      await snap(theirs, testInfo, 'business-suspended');
      await theirs.goto('/app/instructor');
      await expect(theirs).toHaveURL(/\/suspended$/);

      // Reactivated, it takes bookings again.
      await staff.getByRole('button', { name: new RegExp(`^${business}`) }).click();
      await staff.getByRole('dialog', { name: business }).getByRole('button', { name: 'Reactivate' }).click();
      await expect(staff.getByText(`${business} is in good standing again`)).toBeVisible();
      await expect(staff.getByRole('dialog', { name: business })).toContainText('In good standing');
      await page.goto(`/book/${instructor.slug}`);
      await expect(page.getByLabel('Which lesson?')).toBeVisible();
      await theirs.goto('/app/instructor');
      await expect(theirs).toHaveURL(/\/app\/instructor$/);
    } finally {
      await own.close();
      await admin.close();
      await instructor.remove();
    }
  });

  test('support staff find a Business and see who works there, but cannot suspend it', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: authFile('support') });
    const page = await context.newPage();
    await page.goto('/admin/businesses?q=Quayside');
    await expect(page.getByText('1 Business found')).toBeVisible();
    await page.getByRole('button', { name: /^Quayside Driving School/ }).click();
    const panel = page.getByRole('dialog', { name: 'Quayside Driving School' });
    await expect(panel).toContainText('David Okafor');
    await expect(panel).toContainText('Lucy Grant');
    await expect(panel.getByText('Only a super admin can suspend or reactivate a Business.')).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Suspend' })).toHaveCount(0);
    await expectAccessible(page);
    await snap(page, testInfo, 'admin-business-support', { fullPage: false });
    await context.close();
  });
});
