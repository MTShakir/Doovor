import { expect, test as setup } from '@playwright/test';
import { authFile, cookieAnswer, roles, type RoleKey } from '../support/accounts';
import { signInThroughForm } from '../support/sign-in';

/**
 * M0 Definition of Done: sign in as every seeded role and land on the right portal.
 * Each session is saved for the specs that follow.
 */
for (const role of Object.keys(roles) as RoleKey[]) {
  setup(`${role} signs in and lands on ${roles[role].landing}`, async ({ page }) => {
    await signInThroughForm(page, roles[role].email);
    await expect(page).toHaveURL(new RegExp(`${roles[role].landing}$`));
    await expect(page.getByRole('heading', { level: 1, name: roles[role].heading })).toBeVisible();
    // Saved with the cookie question already answered, as every other project starts (M6-08).
    await page.evaluate(({ name, value }) => { window.localStorage.setItem(name, value); }, cookieAnswer);
    await page.context().storageState({ path: authFile(role) });
  });
}
