import { expect, test } from '@playwright/test';
import { totp } from '../../packages/db/src/testing/totp';
import { authFile } from '../support/accounts';
import { membershipsOf, schoolInvitationPath, schoolOwnedBy } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { jpegWithGps } from '../support/images';
import { linkFromEmail } from '../support/mailpit';
import { enterCode } from '../support/sign-in';
import { chooseRoleAndCreateAccount, uniqueEmail } from '../support/sign-up';

test.describe('school onboarding (AUTH-05, M5-11)', () => {
  test('an owner sets the school up and invites an instructor, who joins and sets up in four steps', async ({ page, browser }, testInfo) => {
    test.slow();
    const ownerEmail = uniqueEmail(testInfo, 'school-setup');
    const schoolName = `Northern Lights ${testInfo.project.name} ${String(Date.now())}`;
    await chooseRoleAndCreateAccount(
      page,
      { card: 'I run a driving school', heading: 'Create your school account' },
      { fullName: 'Sophie Owner', email: ownerEmail, schoolName },
    );
    await page.goto(await linkFromEmail(ownerEmail, 'Confirm your email'));

    // Two-step verification comes first, as it does for the school's portal (AUTH-08).
    await expect(page).toHaveURL(/\/mfa\?next=%2Fonboarding%2Fschool/);
    const secret = (await page.locator('.font-mono').innerText()).replace(/\s/g, '');
    await enterCode(page, totp(secret));

    await expect(page).toHaveURL(/\/onboarding\/school$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Tell us about your school' })).toBeVisible();
    await expect(page.getByText('Step 1 of 2')).toBeVisible();
    await expect(page.getByLabel('School name')).toHaveValue(schoolName);
    await expect(page.getByRole('button', { name: 'Add a logo' })).toBeVisible();

    // The portal waits for the school to be set up.
    await page.goto('/app/school');
    await expect(page).toHaveURL(/\/onboarding\/school$/);
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();

    const upload = page.waitForRequest((r) => r.url().includes('/storage/v1/object/avatars/businesses/') && r.method() === 'POST');
    await page.setInputFiles('input[type="file"]', { name: 'logo.jpg', mimeType: 'image/jpeg', buffer: await jpegWithGps(page) });
    await upload;
    await expect(page.getByRole('button', { name: 'Change logo' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await page.getByLabel('Main postcode').fill('m1 2qf');
    await page.getByLabel('How many instructors teach for you?').fill('6');
    await expectAccessible(page);
    await snap(page, testInfo, 'school-setup-details');
    await page.getByRole('button', { name: 'Continue' }).click();

    await expect(page).toHaveURL(/\/onboarding\/school\/invite$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Invite your instructors' })).toBeVisible();
    await expect(page.getByText('Step 2 of 2')).toBeVisible();
    const saved = await schoolOwnedBy(ownerEmail);
    expect(saved).toMatchObject({ name: schoolName, postcode: 'M1 2QF', located: true, expectedInstructors: 6, onboarded: false });
    expect(saved?.logoPath).toMatch(/^businesses\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/);

    // PRD 10.5: invited by phone number, with the text written and sent from the owner's own phone.
    await page.getByLabel('Their name').fill('Nia Newcomer');
    await expect(page.getByLabel('How will you send it?')).toHaveValue('sms');
    await page.getByLabel('Their mobile number').fill('07700 900555');
    await page.getByRole('button', { name: 'Make the link' }).click();
    const linkBox = page.getByLabel('Their link');
    await expect(linkBox).toHaveValue(/\/invite\/[A-Za-z0-9_-]+$/);
    const link = await linkBox.inputValue();
    await expect(page.getByRole('link', { name: 'Send it' })).toHaveAttribute('href', /^sms:\+447700900555\?&body=/);
    const invited = page.getByRole('region', { name: /Invited so far/ });
    await expect(invited).toContainText('1 of about 6');
    await expect(invited.getByText('Nia Newcomer')).toBeVisible();
    await expect(invited.getByText('Waiting')).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'school-setup-invite');

    // The owner checking the link is told it is for somebody else, and it stays unused.
    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: `You are already part of ${schoolName}` })).toBeVisible();

    await page.goto('/onboarding/school/invite');
    await page.getByRole('button', { name: 'Go to my school' }).click();
    await expect(page).toHaveURL(/\/app\/school$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
    await page.goto('/onboarding/school');
    await expect(page).toHaveURL(/\/app\/school$/);

    // The instructor opens the link on their own phone.
    const context = await browser.newContext();
    const nia = await context.newPage();
    await nia.goto(link);
    await expect(nia.getByRole('heading', { level: 1, name: `${schoolName} would like you to teach with them` })).toBeVisible();
    await expectAccessible(nia);
    await snap(nia, testInfo, 'school-invite-landing');

    await nia.getByRole('link', { name: 'Create my account' }).click();
    await expect(nia.getByRole('heading', { level: 1, name: 'Create your instructor account' })).toBeVisible();
    await expect(nia.getByLabel('Full name')).toHaveValue('Nia Newcomer');
    const niaEmail = uniqueEmail(testInfo, 'school-instructor');
    await nia.getByLabel('Email').fill(niaEmail);
    await nia.getByLabel('Password', { exact: true }).fill('a long pass phrase');
    await nia.getByRole('button', { name: 'Create account' }).click();
    await expect(nia.getByRole('heading', { name: 'Check your email' })).toBeVisible();
    await nia.goto(await linkFromEmail(niaEmail, 'Confirm your email'));

    // Mobile verification first, as for every instructor (AUTH-02); drama numbers are scarce (D-033).
    await expect(nia).toHaveURL(/\/verify-phone\?next=%2Fonboarding/);
    await nia.getByRole('link', { name: 'Do this later' }).click();

    // A member of the school, and not a Business of their own.
    expect(await membershipsOf(niaEmail)).toEqual([{ business: schoolName, role: 'instructor', onboarded: false }]);

    await expect(nia).toHaveURL(/\/onboarding\/name$/);
    await expect(nia.getByText('Step 1 of 4')).toBeVisible();
    await expect(nia.getByLabel('Your name')).toHaveValue('Nia Newcomer');
    await expect(nia.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await nia.getByRole('button', { name: 'Continue' }).click();

    await expect(nia).toHaveURL(/\/onboarding\/badge$/);
    await expect(nia.getByText('Step 2 of 4')).toBeVisible();
    await nia.getByRole('button', { name: 'Skip for now' }).click();
    await expect(nia).toHaveURL(/\/onboarding\/area$/);
    await expect(nia.getByText('Step 3 of 4')).toBeVisible();
    await nia.getByRole('button', { name: 'Skip for now' }).click();

    // The school sets the prices, so there is no prices step, even by its address.
    await expect(nia).toHaveURL(/\/onboarding\/hours$/);
    await expect(nia.getByText('Step 4 of 4')).toBeVisible();
    await expectAccessible(nia);
    await snap(nia, testInfo, 'school-instructor-hours');
    await nia.goto('/onboarding/prices');
    await expect(nia).toHaveURL(/\/onboarding\/hours$/);

    await nia.getByRole('button', { name: 'Skip for now' }).click();
    await expect(nia).toHaveURL(/\/app\/instructor$/);
    await expect(nia.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    expect(await membershipsOf(niaEmail)).toEqual([{ business: schoolName, role: 'instructor', onboarded: true }]);
    await context.close();

    // One use only.
    await page.goto(link);
    await expect(page.getByRole('heading', { level: 1, name: 'This link has expired' })).toBeVisible();
  });

  test('an account that already teaches is told a school link is not for it', async ({ browser }, testInfo) => {
    const path = await schoolInvitationPath('Quayside Driving School');
    const context = await browser.newContext({ storageState: authFile('instructor') });
    const page = await context.newPage();
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1, name: 'This account already teaches' })).toBeVisible();
    await expect(page.getByText(/To join Quayside Driving School, sign out and create a new account/)).toBeVisible();
    await expect(page.getByRole('button', { name: /^Join / })).toHaveCount(0);
    await expectAccessible(page);
    await snap(page, testInfo, 'school-invite-teaches-elsewhere');
    await context.close();
  });
});
