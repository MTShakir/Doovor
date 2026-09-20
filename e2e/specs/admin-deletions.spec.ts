import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { makeLeaver } from '../support/database';
import { expectAccessible, snap, tapUntil } from '../support/helpers';

// The admin portal is a desktop screen, and says so on a phone (PRD 8.2, portal-shells.spec.ts).
test.describe('who has asked to leave (AUTH-09, ADM-02, D-175)', { tag: '@desktop-only' }, () => {
  test.use({ storageState: authFile('admin') });

  test('a super admin reads why they are going, reaches them, and calls it off', async ({ page }, testInfo) => {
    const leaver = await makeLeaver('Ruth', 'My instructor stopped replying to me');
    try {
      await page.goto('/admin/deletions');
      await expect(page.getByRole('heading', { level: 1, name: 'Leaving' })).toBeVisible();

      const card = page.getByRole('region', { name: leaver.name });
      await expect(card).toContainText('My instructor stopped replying to me');
      await expect(card).toContainText(/days left|Erased tomorrow|Due to be erased/);
      await expect(card).toContainText('unless it is called off');
      await expect(card.getByRole('link', { name: 'Email' })).toHaveAttribute('href', `mailto:${leaver.email}`);
      await expect(card.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+447700900321');
      await expectAccessible(page);
      await snap(page, testInfo, 'admin-deletions');

      // Put right, so the account stays: the note goes to the audit log with it.
      const sheet = page.getByRole('dialog', { name: `Keep ${leaver.name}?` });
      await tapUntil(card.getByRole('button', { name: 'They are staying' }), sheet);
      await sheet.getByRole('button', { name: 'Call the deletion off' }).click();
      await expect(sheet.getByText('Say what was sorted out')).toBeVisible();
      await sheet.getByLabel('What was sorted out?').fill('Moved them to another instructor, they are happy');
      await sheet.getByRole('button', { name: 'Call the deletion off' }).click();
      await expect(page.getByText(`${leaver.name} is staying`)).toBeVisible();
      await expect(page.getByRole('region', { name: leaver.name })).toHaveCount(0);
    } finally {
      await leaver.remove();
    }
  });

  test('support staff read the list but do not call anything off', async ({ browser }) => {
    const leaver = await makeLeaver('Owen', 'Moving abroad');
    const context = await browser.newContext({ storageState: authFile('support') });
    try {
      const page = await context.newPage();
      await page.goto('/admin/deletions');
      const card = page.getByRole('region', { name: leaver.name });
      await expect(card).toContainText('Moving abroad');
      await expect(card.getByRole('button', { name: 'They are staying' })).toHaveCount(0);
    } finally {
      await context.close();
      await leaver.remove();
    }
  });
});
