import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { auditActionsAbout } from '../support/database';
import { expectAccessible, settled, snap } from '../support/helpers';

/**
 * Everything we hold about somebody, for them to take away (NFR-PRV-03, M6-11, D-148).
 *
 * The last test signs in as the payer, a learner whose exports no other test makes, because it
 * counts what the audit trail says about them.
 */
const payer = 'polly.payne@example.com';

test.describe('your own data (NFR-PRV-03, M6-11)', () => {
  test('a learner reads it, prints it and downloads it', async ({ browser }, testInfo) => {
    const context = await browser.newContext({ storageState: authFile('learner') });
    try {
      const page = await context.newPage();
      await page.goto('/account');
      const card = page.getByRole('region', { name: 'Your data' });
      await expect(card).toContainText('Everything we hold about you');

      await card.getByRole('link', { name: 'See your data' }).click();
      await expect(page).toHaveURL(/\/account\/data$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Your data' })).toBeVisible();

      // Their own account, and the sections a learner has.
      const account = page.getByRole('region', { name: 'Account' });
      await expect(account.getByText('Jack Taylor')).toBeVisible();
      await expect(page.getByRole('region', { name: 'Learner' })).toBeVisible();
      // Nothing about teaching, because they do not teach.
      await expect(page.getByRole('region', { name: 'Instructor' })).toHaveCount(0);

      // It can be saved as a PDF, the way a receipt already can.
      await expect(page.getByRole('button', { name: 'Save as PDF' })).toBeVisible();
      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, 'your-data');

      // And the same thing as a file.
      const file = await page.request.get('/account/data.json');
      expect(file.status()).toBe(200);
      expect(file.headers()['content-disposition']).toContain('attachment; filename="');
      const data = (await file.json()) as { account: { full_name: string }; learner: { lessons: unknown[] } };
      expect(data.account.full_name).toBe('Jack Taylor');
      expect(Array.isArray(data.learner.lessons)).toBe(true);
    } finally {
      await context.close();
    }
  });

  test('an instructor gets what they hold, and nothing of a learner they teach', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('instructor') });
    try {
      const page = await context.newPage();
      const file = await page.request.get('/account/data.json');
      expect(file.status()).toBe(200);
      const data = (await file.json()) as {
        account: { full_name: string };
        instructor?: { profiles: { display_name: string }[]; lessons_taught: unknown[] };
        learner?: unknown;
      };
      expect(data.account.full_name).toBe('Sarah Khan');
      expect(data.instructor?.profiles[0]?.display_name).toBe('Sarah Khan');
      expect(data.instructor?.lessons_taught.length).toBeGreaterThan(0);
      // The lessons they taught are theirs; the learners in them are not.
      expect(JSON.stringify(data.instructor?.lessons_taught)).not.toContain('Jack Taylor');
      // They are not a learner, so there is no learner section.
      expect(data.learner).toBeUndefined();
    } finally {
      await context.close();
    }
  });

  test('nobody signed in gets nothing', async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    try {
      const page = await context.newPage();
      // Sent to sign in, the way every private address is: nothing is handed over.
      const answer = await page.request.get('/account/data.json', { maxRedirects: 0 });
      expect(answer.status()).toBe(307);
      expect(answer.headers().location).toContain('/sign-in');
    } finally {
      await context.close();
    }
  });

  test('acceptance: every export is written down', async ({ browser }) => {
    const context = await browser.newContext({ storageState: authFile('payer') });
    try {
      const page = await context.newPage();
      const exports = async () => (await auditActionsAbout(payer)).filter((action) => action === 'account.data_exported').length;
      const before = await exports();
      const file = await page.request.get('/account/data.json');
      expect(file.status()).toBe(200);
      await expect.poll(exports, { message: 'the export is written down' }).toBe(before + 1);
    } finally {
      await context.close();
    }
  });
});
