import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { aBadgeNumber, expectAccessible, snap } from '../support/helpers';
import { jpegWithGps } from '../support/images';
import { linkFromEmail } from '../support/mailpit';
import { chooseRoleAndCreateAccount, uniqueEmail } from '../support/sign-up';

/** A new instructor who has sent their badge in, waiting to be checked (INS-02). */
/** Signs somebody up and sends their badge in. Answers with the number it used, which is its own
 *  so that both widths can run at once against a platform where a badge belongs to one account. */
async function submitBadge(page: Page, email: string, name: string): Promise<string> {
  const badgeNumber = aBadgeNumber();
  await chooseRoleAndCreateAccount(
    page,
    { card: "I'm an instructor", heading: 'Create your instructor account' },
    { fullName: name, email },
  );
  await page.goto(await linkFromEmail(email, 'Confirm your email'));
  await page.getByRole('link', { name: 'Do this later' }).click();
  const [first, ...rest] = name.split(' ');
  await page.getByLabel('First name').fill(first ?? name);
  await page.getByLabel('Last name').fill(rest.join(' '));
  await page.getByRole('button', { name: 'Continue' }).click();
  // The name step has a file input of its own, so wait for the badge step before using one.
  await expect(page).toHaveURL(/\/onboarding\/badge$/);

  // A file picked before the page is ready goes nowhere: the submit button is disabled
  // until React is running, so that is the signal to wait for (D-043).
  await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
  const badge = await jpegWithGps(page);
  const upload = page.waitForRequest((r) => r.url().includes('/storage/v1/object/badges/') && r.method() === 'POST');
  await page.setInputFiles('input[type="file"]', { name: 'badge.jpg', mimeType: 'image/jpeg', buffer: badge });
  // The path is only sent once the upload has finished.
  await upload;
  await expect(page.getByRole('button', { name: 'Replace photo' })).toBeVisible();
  await page.getByLabel('Badge number').fill(badgeNumber);
  await page.getByLabel('Badge expiry date').fill('2029-06-30');
  await page.getByRole('checkbox', { name: 'I have a current enhanced DBS check' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/onboarding\/area$/);

  // The rest of onboarding is skipped: the portal is not open until it is finished.
  for (const step of ['prices', 'hours']) {
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page).toHaveURL(new RegExp(`/onboarding/${step}$`));
  }
  await page.getByRole('button', { name: 'Skip for now' }).click();
  await expect(page).toHaveURL(/\/app\/instructor$/);
  return badgeNumber;
}

// The queue is a desktop screen: the admin portal says so itself (PRD 8.2).
test.describe('verification queue (INS-02, ADM-03, M1-12)', { tag: '@desktop-only' }, () => {
  test('a badge sent in is checked by a person, and the tick follows', async ({ page, browser }, testInfo) => {
    const email = uniqueEmail(testInfo, 'queue-approve');
    const name = `Nina Queue ${testInfo.project.name}`;
    const badgeNumber = await submitBadge(page, email, name);

    // Support staff, on their own session.
    const staff = await browser.newContext({ storageState: authFile('support') });
    const admin = await staff.newPage();
    await admin.goto('/admin/verification');
    await expect(admin.getByRole('heading', { level: 1, name: 'Verification' })).toBeVisible();

    // Scoped to the page, because a toast is a list item too.
    const waiting = admin.getByRole('main').locator('li', { hasText: name });
    await expect(waiting).toContainText(`Badge ${badgeNumber}`);
    await expect(waiting).toContainText('expires Sat 30 Jun 2029');
    // The badge photo is private, so it is shown through a signed address.
    await expect(waiting.getByRole('img', { name: `The badge ${name} sent in` })).toHaveAttribute('src', /token=/);
    await expectAccessible(admin);
    await snap(admin, testInfo, 'admin-verification');

    await waiting.getByRole('button', { name: 'Approve' }).click();
    await expect(admin.getByText(`${name} is verified`)).toBeVisible();
    await expect(admin.getByRole('main').locator('li', { hasText: name })).toBeHidden();

    // The instructor sees the tick on their own profile.
    await page.goto('/app/instructor/profile');
    await expect(page.getByText('Verified')).toBeVisible();
    await expect(page.getByText('Learners see the blue tick on your profile.')).toBeVisible();
    await staff.close();
  });

  test('a rejection has to say why, and the instructor is told', async ({ page, browser }, testInfo) => {
    const email = uniqueEmail(testInfo, 'queue-reject');
    const name = `Rory Reject ${testInfo.project.name}`;
    await submitBadge(page, email, name);

    const staff = await browser.newContext({ storageState: authFile('support') });
    const admin = await staff.newPage();
    await admin.goto('/admin/verification');

    // Scoped to the page, because a toast is a list item too.
    const waiting = admin.getByRole('main').locator('li', { hasText: name });
    await waiting.getByRole('button', { name: 'Reject' }).click();
    await waiting.getByRole('button', { name: 'Reject' }).click();
    await expect(waiting.getByText('Say why, so the instructor knows what to fix')).toBeVisible();

    await waiting.getByLabel('Why not?').fill('The badge photo is too blurred to read the number.');
    await waiting.getByRole('button', { name: 'Reject' }).click();
    await expect(admin.getByText(`${name} was not approved`)).toBeVisible();

    await page.goto('/app/instructor/profile');
    await expect(page.getByText('Not approved')).toBeVisible();
    await staff.close();

    // Why, and a way to put it right, on the profile itself (D-262).
    await expect(page.getByText('The badge photo is too blurred to read the number.').first()).toBeVisible();
    await page.getByRole('button', { name: 'Send your badge again' }).click();
    const sheet = page.getByRole('dialog', { name: 'Send your badge again' });
    await expect(sheet.getByText('Why we could not verify it:')).toBeVisible();
    // A decision clears the photo it was made from, so a new one is asked for before anything is sent.
    await sheet.getByRole('checkbox', { name: 'I have a current enhanced DBS check' }).click();
    await sheet.getByRole('button', { name: 'Send for checking' }).click();
    await expect(sheet.getByText('Add a photo of your badge')).toBeVisible();

    const upload = page.waitForRequest((r) => r.url().includes('/storage/v1/object/badges/') && r.method() === 'POST');
    await sheet.locator('input[type="file"]').setInputFiles({ name: 'badge.jpg', mimeType: 'image/jpeg', buffer: await jpegWithGps(page) });
    await upload;
    await expect(sheet.getByRole('button', { name: 'Replace photo' })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'profile-send-badge-again');
    await sheet.getByRole('button', { name: 'Send for checking' }).click();
    await expect(page.getByText('Being checked')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send your badge again' })).toHaveCount(0);
  });
});
