import { expect, test } from '@playwright/test';
import { totp } from '../../packages/db/src/testing/totp';
import { authFile } from '../support/accounts';
import { makeSchool, membershipsOf, schoolInvitationPath, schoolOwnedBy, withDatabase } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { jpegWithGps } from '../support/images';
import { linkFromEmail } from '../support/mailpit';
import { enterCode } from '../support/sign-in';
import { agreeToTerms, chooseRoleAndCreateAccount, uniqueEmail } from '../support/sign-up';

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
    // Nothing is chosen for the school: who sells its lessons is its own to say (D-281). This one
    // sells them itself, through the instructors it invites next.
    for (const answer of ['We sell the lessons', 'Our instructors sell their own', 'Some of each']) {
      await expect(page.getByRole('radio', { name: new RegExp(`^${answer}`) })).not.toBeChecked();
    }
    await page.getByText('We sell the lessons').click();
    await expect(page.getByRole('radio', { name: /^We sell the lessons/ })).toBeChecked();
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
    await agreeToTerms(nia);
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
    await expect(nia.getByLabel('First name')).toHaveValue('Nia');
    await expect(nia.getByLabel('Last name')).toHaveValue('Newcomer');
    // A school's name is not theirs to change, so they are never asked for one (D-196).
    await expect(nia.getByLabel('Your business name')).toHaveCount(0);
    await expect(nia.getByRole('button', { name: 'Continue' })).toBeEnabled();
    await nia.getByRole('button', { name: 'Continue' }).click();

    await expect(nia).toHaveURL(/\/onboarding\/badge$/);
    await expect(nia.getByText('Step 2 of 4')).toBeVisible();
    // The school vouches for its instructors, so there is no photo to send and nobody to check it (D-280).
    await expect(nia.getByText(`${schoolName} vouches for you`, { exact: false })).toBeVisible();
    await expect(nia.getByText('Photo of your badge')).toHaveCount(0);
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

  test('an instructor with a business of their own is told joining pauses it (D-292)', async ({ browser }, testInfo) => {
    const path = await schoolInvitationPath('Quayside Driving School');
    const context = await browser.newContext({ storageState: authFile('instructor') });
    const page = await context.newPage();
    await page.goto(path);
    await expect(page.getByText(/^Joining pauses .* while you teach under Quayside Driving School/)).toBeVisible();
    await expect(page.getByText('It can pause with no lessons still to come and no learner with hours left to use.', { exact: false })).toBeVisible();
    // Not pressed: the seeded instructor's business is every other test's.
    await expect(page.getByRole('button', { name: 'Join Quayside Driving School' })).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'school-invite-own-business');
    await context.close();
  });

  test('an account that teaches for a school is told another school\'s link is not for it', async ({ browser }, testInfo) => {
    const other = await makeSchool(`Elsewhere ${testInfo.project.name}`);
    const context = await browser.newContext({ storageState: authFile('schoolInstructor') });
    try {
      // A school of its own, whose manager made the link: it has no owner to have sent one.
      const token = crypto.randomUUID().replaceAll('-', '');
      await withDatabase(async (sql) => {
        await sql`
          insert into public.invitations (business_id, kind, role, channel, token_hash, invited_by)
          select m.business_id, 'member', 'instructor', 'link', private.invitation_hash(${token}), m.user_id
            from public.memberships m where m.business_id = ${other.businessId} and m.role = 'manager'`;
      });
      const path = `/invite/${token}`;
      const page = await context.newPage();
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1, name: 'This account already teaches' })).toBeVisible();
      await expect(page.getByText(new RegExp(`To join ${other.name}, sign out and create a new account`))).toBeVisible();
      await expect(page.getByRole('button', { name: /^Join / })).toHaveCount(0);
      await expectAccessible(page);
      await snap(page, testInfo, 'school-invite-teaches-elsewhere');
    } finally {
      await context.close();
      await other.remove();
    }
  });
});
