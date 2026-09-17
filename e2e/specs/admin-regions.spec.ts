import { expect, test, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import {
  cachePostcode,
  forgetRegion,
  joinWaitingList,
  makeInstructor,
  marketplaceRegion,
  openEveryDay,
  setSwitchOnRule,
  waitingListTold,
} from '../support/database';
import { addDays, expectAccessible, snap } from '../support/helpers';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/** The row for a postcode area on the Regions screen. */
function areaRow(page: Page, label: string) {
  return page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: label, exact: true }) });
}

// The admin portal is a desktop screen, and says so on a phone (PRD 8.2, portal-shells.spec.ts). Shetland
// is an area nothing else in the tests uses, so opening it changes nobody else's page.
test.describe('regions (ADM-04, PRD 4.2, M5-19)', { tag: '@desktop-only' }, () => {
  test('toggle audited: a super admin opens an area that meets the rule, its waiting list is told once, and closes it', async ({ browser }, testInfo) => {
    await forgetRegion('ZE');
    await cachePostcode({ postcode: 'ZE1 0AA', latitude: 60.1553, longitude: -1.1451, district: 'Shetland Islands' });
    const instructor = await makeInstructor('Zara Shetland', addDays(today(), 365), { postcode: 'ZE1 0AA' });
    await openEveryDay(instructor.slug);
    const putBackRule = await setSwitchOnRule({ instructors: 1, hours: 100 });
    const waiting = `wendy.shetland.${String(Date.now())}@example.com`;
    const leaveList = await joinWaitingList({ email: waiting, fullName: 'Wendy Shetland', postcode: 'ZE1 0AB' });
    const support = await browser.newContext({ storageState: authFile('support') });
    const admin = await browser.newContext({ storageState: authFile('admin') });
    try {
      // Support staff see the area ready to open, and cannot open it.
      const looking = await support.newPage();
      await looking.goto('/admin/regions');
      await expect(looking.getByRole('heading', { level: 1, name: 'Regions' })).toBeVisible();
      await expect(areaRow(looking, 'ZE, Shetland')).toContainText('Ready to open');
      await expect(areaRow(looking, 'ZE, Shetland').getByRole('button')).toHaveCount(0);
      await expect(looking.getByText('Only a super admin can open or close an area.')).toBeVisible();

      // A super admin opens it, having been told who hears about it.
      const staff = await admin.newPage();
      await staff.goto('/admin/regions');
      await expect(staff.getByText('at least 1 verified instructor covering it, with at least 100 free hours between them')).toBeVisible();
      const row = areaRow(staff, 'ZE, Shetland');
      await expect(row).toContainText('1 of 1');
      await expect(row).toContainText('Enough');
      await expectAccessible(staff);
      await snap(staff, testInfo, 'admin-regions', { fullPage: false });
      await row.getByRole('button', { name: 'Open ZE, Shetland' }).click();
      const question = staff.getByRole('dialog', { name: 'Open the marketplace in ZE, Shetland?' });
      await expect(question).toContainText('Everybody on its waiting list or with a lesson request there is emailed once to say so.');
      await question.getByRole('button', { name: 'Open', exact: true }).click();
      await expect(staff.getByText('The marketplace is open in ZE, Shetland')).toBeVisible();
      await expect(areaRow(staff, 'ZE, Shetland').getByText('Open', { exact: true })).toBeVisible();

      // The database has it open, and asked for the waiting list to be told, which happens once.
      const opened = await marketplaceRegion('ZE');
      expect(opened.open).toBe(true);
      expect(opened.event?.payload).toEqual({ area: 'ZE' });
      expect(await (await staff.request.post('/dev/events', { data: opened.event })).json()).toEqual({ told: 1, refused: 0 });
      expect(await (await staff.request.post('/dev/events', { data: opened.event })).json()).toEqual({ told: 0, refused: 0 });
      expect(await waitingListTold(waiting)).toEqual({ told: true, left: true });

      // Closed again, nobody is emailed.
      await areaRow(staff, 'ZE, Shetland').getByRole('button', { name: 'Close ZE, Shetland' }).click();
      const closing = staff.getByRole('dialog', { name: 'Close the marketplace in ZE, Shetland?' });
      await expect(closing).toContainText('Nobody is emailed.');
      await closing.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(staff.getByText('The marketplace is closed in ZE, Shetland')).toBeVisible();
      expect((await marketplaceRegion('ZE')).open).toBe(false);
    } finally {
      await support.close();
      await admin.close();
      await putBackRule();
      await leaveList();
      await forgetRegion('ZE');
      await instructor.remove();
    }
  });
});
