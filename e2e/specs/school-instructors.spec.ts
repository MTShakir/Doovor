import { expect, test, type Locator, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { makeSchoolInstructor, schoolMemberState } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/** Opens the sheet with what can be changed about one person, from their row in a section. */
async function openMember(page: Page, section: Locator, name: string): Promise<Locator> {
  await section.getByRole('button', { name: new RegExp(`^${name},`) }).click();
  const sheet = page.getByRole('dialog', { name, exact: true });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('school instructors (SCH-02, M5-13)', () => {
  test('the owner invites and cancels, lets an instructor set prices, and switches them off and on', async ({ browser }, testInfo) => {
    test.slow();
    const nia = await makeSchoolInstructor(`Nia ${testInfo.project.name}`);
    const wrong = `Wrong Number ${testInfo.project.name}`;
    const context = await browser.newContext({ storageState: authFile('schoolOwner') });
    const page = await context.newPage();
    try {
      await page.goto('/app/school/instructors');
      await expect(page.getByRole('heading', { level: 1, name: 'Instructors' })).toBeVisible();
      const instructors = page.getByRole('region', { name: 'Instructors', exact: true });
      for (const name of ['Emma Clarke', 'Tom Walsh', nia.name]) {
        await expect(instructors.getByText(name, { exact: true })).toBeVisible();
      }
      await expectAccessible(page);
      await snap(page, testInfo, 'school-instructors-owner');

      // The owner decides whether a manager sees revenue.
      const lucy = await openMember(page, page.getByRole('region', { name: 'Managers', exact: true }), 'Lucy Grant');
      await expect(lucy.getByRole('switch', { name: /Sees revenue/ })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(lucy).toBeHidden();

      // A link made for the wrong person is cancelled, and stops working.
      await page.getByRole('button', { name: 'Invite an instructor' }).click();
      const invite = page.getByRole('dialog', { name: 'Invite an instructor' });
      await invite.getByLabel('Their name').fill(wrong);
      await invite.getByLabel('How will you send it?').selectOption('link');
      await invite.getByRole('button', { name: 'Make the link' }).click();
      await expect(invite.getByLabel('Their link')).toHaveValue(/\/invite\/[A-Za-z0-9_-]+$/);
      const link = await invite.getByLabel('Their link').inputValue();
      await page.keyboard.press('Escape');
      await expect(invite).toBeHidden();
      const waiting = page.getByRole('region', { name: 'Invitations waiting', exact: true });
      await waiting.getByRole('button', { name: `Cancel the invitation for ${wrong}` }).click();
      await expect(page.getByText('Invitation cancelled. The link no longer works')).toBeVisible();
      await expect(page.getByText(wrong, { exact: true })).toHaveCount(0);
      const stranger = await browser.newContext();
      const strangerPage = await stranger.newPage();
      await strangerPage.goto(link);
      await expect(strangerPage.getByRole('heading', { level: 1, name: 'This link has expired' })).toBeVisible();
      await stranger.close();

      // Pricing control: Nia sets her own prices.
      const sheet = await openMember(page, instructors, nia.name);
      await sheet.getByRole('switch', { name: /Sets their own prices/ }).click();
      await expect(page.getByText(`${nia.name} sets their own prices`)).toBeVisible();
      await expect(sheet.getByRole('switch', { name: /Sets their own prices/ })).toBeChecked();
      await expect.poll(async () => (await schoolMemberState(nia.email))?.setOwnPrices).toBe(true);
      await expectAccessible(page);
      await snap(page, testInfo, 'school-instructor-sheet', { fullPage: false });

      // Switching her off says what happens first.
      await sheet.getByRole('button', { name: 'Switch off' }).click();
      const confirm = page.getByRole('dialog', { name: `Switch off ${nia.name}?` });
      await expect(confirm).toContainText('their profile comes off the public site');
      await expectAccessible(page);
      await snap(page, testInfo, 'school-instructor-switch-off', { fullPage: false });
      await confirm.getByRole('button', { name: 'Switch off' }).click();
      await expect(page.getByText(`${nia.name} is switched off`)).toBeVisible();
      const off = page.getByRole('region', { name: 'Switched off', exact: true });
      await expect(off.getByText(nia.name, { exact: true })).toBeVisible();
      expect(await schoolMemberState(nia.email)).toMatchObject({ status: 'deactivated', slug: null });

      // Nia signs in and the school has gone: no diary, nothing to open.
      const niaContext = await browser.newContext();
      const niaPage = await niaContext.newPage();
      await signInThroughForm(niaPage, nia.email);
      await expect(niaPage).toHaveURL(/\/start$/);
      await niaPage.goto('/app/instructor');
      await expect(niaPage).not.toHaveURL(/\/app\/instructor/);
      await niaContext.close();

      // And back on.
      const again = await openMember(page, off, nia.name);
      await again.getByRole('button', { name: 'Switch back on' }).click();
      await expect(page.getByText(`${nia.name} is switched back on`)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(instructors.getByText(nia.name, { exact: true })).toBeVisible();
      expect(await schoolMemberState(nia.email)).toMatchObject({ status: 'active' });
      expect((await schoolMemberState(nia.email))?.slug).not.toBeNull();
    } finally {
      await context.close();
      await nia.remove();
    }
  });

  test('a manager runs the instructors but not the managers, and opens their diaries', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: authFile('schoolManager') });
    const page = await context.newPage();
    await page.goto('/app/school/instructors');

    const managers = page.getByRole('region', { name: 'Managers', exact: true });
    await expect(managers.getByText('Manager, this is you')).toBeVisible();
    await expect(managers.getByRole('button')).toHaveCount(0);
    await expectAccessible(page);
    await snap(page, testInfo, 'school-instructors-manager');

    const emma = await openMember(page, page.getByRole('region', { name: 'Instructors', exact: true }), 'Emma Clarke');
    await expect(emma.getByRole('switch', { name: /Sets their own prices/ })).toBeVisible();
    await expect(emma.getByRole('button', { name: 'Switch off' })).toBeVisible();
    await emma.getByRole('link', { name: 'Open their diary' }).click();
    await expect(page).toHaveURL(/\/app\/school\/diary\?instructor=[0-9a-f-]{36}$/);
    await context.close();
  });
});
