import { expect, type Page, type TestInfo } from '@playwright/test';

/** A fresh address for every run, so sign-up specs never collide. */
export function uniqueEmail(testInfo: TestInfo, label: string): string {
  return `e2e.${label}.${testInfo.project.name}.${String(Date.now())}@example.com`;
}

export async function chooseRoleAndCreateAccount(
  page: Page,
  role: { card: string; heading: string },
  details: { fullName: string; email: string; schoolName?: string },
): Promise<void> {
  await page.goto('/start');
  await page.getByText(role.card).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByRole('heading', { name: role.heading })).toBeVisible();
  await page.getByLabel('Full name').fill(details.fullName);
  if (details.schoolName) await page.getByLabel('School name').fill(details.schoolName);
  await page.getByLabel('Email').fill(details.email);
  await page.getByLabel('Password', { exact: true }).fill('a long pass phrase');
  await agreeToTerms(page);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
}

/**
 * Ticks the terms and the privacy notice, which nobody can sign up without (D-265). A tick clicked
 * before the page is running goes nowhere, as it would for a person, so it is clicked again until
 * it holds, and only ever while it is unticked, so a second click can never take it off.
 */
export async function agreeToTerms(page: Page): Promise<void> {
  const tick = page.getByRole('checkbox', { name: /^I agree to the / });
  await expect(async () => {
    if (!(await tick.isChecked())) await tick.click();
    await expect(tick).toBeChecked({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}
