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
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
}
