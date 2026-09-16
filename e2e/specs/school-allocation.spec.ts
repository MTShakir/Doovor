import { expect, test } from '@playwright/test';
import { authFile } from '../support/accounts';
import { learnerTeacherAtSchool, makeSchoolInstructor, makeSchoolLearner } from '../support/database';
import { expectAccessible, snap, tapUntil } from '../support/helpers';

test.describe('learner allocation (SCH-03, LRN-06, M5-14)', () => {
  test('suggests who suits a learner best, says why, and gives the learner to them', async ({ browser }, testInfo) => {
    // A learner and an automatic instructor of this test's own, near each other and with time free.
    const lily = await makeSchoolLearner(`Lily ${testInfo.project.name}`, { postcode: 'M13 9PL', transmission: 'automatic' });
    const zara = await makeSchoolInstructor(`Zara ${testInfo.project.name}`, 'Quayside Driving School', {
      transmission: 'automatic',
      postcode: 'M13 9PL',
      workingHours: true,
    });
    const context = await browser.newContext({ storageState: authFile('schoolOwner') });
    const page = await context.newPage();
    try {
      await page.goto(`/app/school/learners?q=${encodeURIComponent(lily.name)}`);
      const row = page.locator('article').filter({ hasText: lily.name });
      await expect(row.getByText('Nobody yet')).toBeVisible();

      const sheet = page.getByRole('dialog', { name: `Who teaches ${lily.name}?` });
      await tapUntil(row.getByRole('button', { name: 'Assign' }), sheet);
      const suggested = sheet.getByRole('region', { name: 'Suggested' });
      const choices = suggested.getByRole('button');
      await expect(choices.first()).toBeVisible();

      // Only instructors who teach automatic are suggested, each with its reasons.
      const count = await choices.count();
      for (let index = 0; index < count; index += 1) {
        await expect(choices.nth(index)).toContainText(/Teaches (automatic|manual and automatic)/);
        await expect(choices.nth(index)).toContainText(/in the next 2 weeks/);
      }
      await expect(suggested.getByRole('button', { name: /^Tom Walsh/ })).toHaveCount(0);
      await expect(sheet.getByRole('region', { name: 'Everybody else' }).getByRole('button', { name: /^Tom Walsh/ })).toBeVisible();

      // Zara is checked, based in M13 and free all week, so she is among the few suggested.
      const zaraChoice = suggested.getByRole('button', { name: new RegExp(`^${zara.name}`) });
      await expect(zaraChoice).toContainText('Covers M13, under 0.1 miles away');
      await expect(zaraChoice).toContainText(/\d+ free hours in the next 2 weeks/);
      await expectAccessible(page);
      await snap(page, testInfo, 'school-allocation', { fullPage: false });

      await zaraChoice.click();
      await expect(page.getByText(`${lily.name} is with ${zara.name} now`)).toBeVisible();
      await expect(row.getByText(`With ${zara.name}`)).toBeVisible();
      expect(await learnerTeacherAtSchool(lily.email)).toBe(zara.name);
    } finally {
      await context.close();
      await lily.remove();
      await zara.remove();
    }
  });
});
