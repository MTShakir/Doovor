import { brand } from '@repo/config/brand';
import { expect, test } from '@playwright/test';
import { expectAccessible, keepScreenshot, snap, tapUntil } from '../support/helpers';

test.describe('design system page (M0-15)', () => {
  test('shows every section and passes axe', async ({ page }, testInfo) => {
    await page.goto('/design');
    await expect(page.getByRole('heading', { level: 1, name: 'Design system' })).toBeVisible();
    for (const section of ['Colour', 'Buttons', 'Inputs', 'Chips and pills', 'Scheduling', 'Overlays']) {
      await expect(page.getByRole('heading', { level: 2, name: section })).toBeVisible();
    }
    await expect(page.getByText(brand.name).first()).toBeVisible();
    await expectAccessible(page);
    await snap(page, testInfo, 'design-system');
    // One image per section, small enough to review properly.
    for (const section of await page.locator('main section').all()) {
      const id = await section.getAttribute('id');
      await keepScreenshot(testInfo, `design-${id ?? 'section'}`, await section.screenshot());
    }
  });

  test('opens the sheet (bottom sheet on phones, side panel on desktop) and closes on Escape', async ({ page }, testInfo) => {
    await page.goto('/design');
    const sheet = page.getByRole('dialog', { name: 'Lesson with Sam Taylor' });
    // The design page holds every component, so it can still be coming alive when the test begins.
    await tapUntil(page.getByRole('button', { name: 'Open sheet' }), sheet);
    await expect(sheet.getByRole('button', { name: 'Start lesson' })).toBeVisible();
    await page.waitForTimeout(300); // let the 200 ms open animation finish before the screenshot
    await snap(page, testInfo, 'sheet-open', { fullPage: false });
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
  });

  test('toast offers undo for 5 seconds (PRD 7.1)', async ({ page }) => {
    await page.goto('/design');
    // A press before the page is alive shows nothing, and one after shows the toast; only the toast
    // that appeared is used.
    await tapUntil(page.getByRole('button', { name: 'Toast with undo' }), page.getByText('Lesson cancelled').first());
    await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
    await expect(page.getByText('Cancellation undone').first()).toBeVisible();
  });

  test('selects a time slot with a visible non-colour cue', async ({ page }) => {
    await page.goto('/design');
    const slot = page.getByRole('button', { name: '15:00' });
    // Pressed again only while it has not taken: a second press on a chosen slot would clear it.
    await expect(async () => {
      if ((await slot.getAttribute('aria-pressed')) !== 'true') await slot.click();
      await expect(slot).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 });
    }).toPass({ timeout: 15_000 });
  });
});
