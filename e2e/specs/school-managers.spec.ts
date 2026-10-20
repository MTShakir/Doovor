import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { withDatabase } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';

/**
 * The owner invites a manager (M9-26, D-293): the link says what a manager does, and the
 * invitation waits on the team as one to help run the school. Accepting it is the database's,
 * proved in pgTAP; the seeded school is shared, so nobody joins it here and the link is withdrawn.
 */
test.describe('inviting a manager (SCH-02, D-293)', () => {
  test.use({ storageState: authFile('schoolOwner') });

  test('the owner makes a link for a manager, which says what they will do', async ({ page, browser }, testInfo) => {
    let token: string | null = null;
    try {
      await page.goto('/app/school/instructors');
      await page.getByRole('button', { name: 'Invite a manager' }).click();
      const sheet = page.getByRole('dialog', { name: 'Invite a manager' });
      await expect(sheet).toContainText('They see its revenue only if you let them.');
      await sheet.getByLabel('Their name').fill(`Maya ${testInfo.project.name}`);
      await sheet.getByLabel('How will you send it?').selectOption('link');
      await sheet.getByRole('button', { name: 'Make the link' }).click();
      await expect(sheet.getByText('Whoever opens this link can help run your school')).toBeVisible();
      await expect(sheet.getByText('would like you to help run it')).toBeVisible();
      const link = await sheet.getByLabel('Their link').inputValue();
      token = new URL(link).pathname.split('/').pop() ?? null;
      await expectAccessible(page);
      await snap(page, testInfo, 'school-invite-manager');

      // Waiting on the team, as an invitation to help run the school.
      await page.keyboard.press('Escape');
      await expect(page.getByText(`Maya ${testInfo.project.name}`)).toBeVisible();
      await expect(page.getByText(/To help run the school, works until/).first()).toBeVisible();

      // Somebody signed out who opens it is asked to help run the school.
      const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const opened = await visitor.newPage();
      await opened.goto(new URL(link).pathname);
      await expect(opened.getByRole('heading', { level: 1, name: 'Quayside Driving School would like you to help run it' })).toBeVisible();
      await expect(opened.getByText('Create your account to help run Quayside Driving School.')).toBeVisible();
      await expectAccessible(opened);
      await visitor.close();
    } finally {
      if (token !== null) {
        const used = token;
        await withDatabase(async (sql) => {
          await sql`delete from public.invitations where token_hash = private.invitation_hash(${used})`;
        });
      }
    }
  });
});
