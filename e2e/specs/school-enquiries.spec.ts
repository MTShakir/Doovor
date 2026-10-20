import { expect, test } from '@playwright/test';
import { makeSchool, withDatabase } from '../support/database';
import { expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/**
 * Somebody asks a school for lessons from its page, and the school finds them in New pupils, closes
 * one, opens it again and adds somebody who rang (M9-15, M9-16, D-288). Each width has a school of
 * its own.
 */
test.describe('new pupils for a school (SCH-03, GAP-01, D-288)', () => {
  test('a learner asks on the school page, and the school sees, closes, reopens and adds', async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const label = `Enquiries ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const slug = await withDatabase(async (sql) => {
      const [row] = await sql<{ slug: string }[]>`select slug from public.businesses where id = ${school.businessId}`;
      return row?.slug ?? '';
    });
    const pat = `Pat ${label}`;

    const visitorContext = await browser.newContext();
    const managerContext = await browser.newContext();
    try {
      // A visitor, signed out, asks from the school's page.
      const visitor = await visitorContext.newPage();
      await visitor.goto(`/schools/uk/${slug}`);
      await expect(visitor.getByRole('heading', { level: 1, name: school.name })).toBeVisible();
      const ask = visitor.getByRole('region', { name: 'Ask about lessons' });
      await ask.getByLabel('Your name').fill(pat);
      await ask.getByLabel('Email', { exact: true }).fill(`pat.${testInfo.project.name}@example.com`);
      await ask.getByLabel('Postcode', { exact: true }).fill('m1 1ae');
      await ask.getByLabel('Which gearbox?').selectOption('automatic');
      await ask.getByLabel('When suits').fill('Weekday evenings');
      await ask.getByRole('button', { name: 'Ask about lessons' }).click();
      await expect(ask.getByText('Tick this so the school can pass your details to an instructor')).toBeVisible();
      await ask.getByRole('checkbox', { name: new RegExp(`I agree to ${school.name} keeping these details`) }).click();
      await expectAccessible(visitor);
      await ask.getByRole('button', { name: 'Ask about lessons' }).click();
      await expect(ask.getByRole('status')).toContainText(`Thank you. ${school.name} has your details`);
      await snap(visitor, testInfo, 'school-ask-about-lessons');

      // The school finds them in New pupils, from Learners.
      const manager = await managerContext.newPage();
      await signInThroughForm(manager, school.managerEmail, { next: '/app/school/learners' });
      await manager.getByRole('link', { name: 'New pupils' }).click();
      await expect(manager.getByRole('heading', { level: 1, name: 'New pupils' })).toBeVisible();
      const waiting = manager.getByRole('list', { name: 'New pupils' });
      const card = waiting.getByRole('listitem').filter({ hasText: pat });
      await expect(card).toContainText('from your page');
      await expect(card).toContainText('M1 1AE');
      await expect(card).toContainText('Weekday evenings');
      await expect(card).toContainText('Automatic');
      await expectAccessible(manager);
      await snap(manager, testInfo, 'school-new-pupils');

      // Closed with why, and opened again.
      await card.getByRole('button', { name: 'Close' }).click();
      const dialog = manager.getByRole('dialog', { name: `Close ${pat}?` });
      await dialog.getByLabel('Why?').fill('Booked elsewhere');
      await dialog.getByRole('button', { name: 'Close', exact: true }).click();
      await expect(manager.getByText('Closed', { exact: true }).last()).toBeVisible();
      await manager.getByRole('link', { name: /^Closed/ }).click();
      const closed = manager.getByRole('list', { name: 'Closed pupils' }).getByRole('listitem').filter({ hasText: pat });
      await expect(closed).toContainText('Booked elsewhere');
      await closed.getByRole('button', { name: 'Open again' }).click();
      await expect(manager.getByText('Opened again')).toBeVisible();
      await manager.getByRole('link', { name: /^New/ }).click();
      await expect(manager.getByRole('list', { name: 'New pupils' })).toContainText(pat);

      // The office adds somebody who rang.
      await manager.getByRole('button', { name: 'Add a pupil' }).click();
      const sheet = manager.getByRole('dialog', { name: 'Add a pupil' });
      await sheet.getByLabel('Their name').fill(`Sam ${label}`);
      await sheet.getByLabel('Mobile', { exact: true }).fill('07700 900124');
      await sheet.getByLabel('Postcode', { exact: true }).fill('M14 5RL');
      await sheet.getByRole('checkbox', { name: /They agreed to/ }).click();
      await sheet.getByRole('button', { name: 'Add them' }).click();
      await expect(manager.getByText('Added to New')).toBeVisible();
      const sam = manager.getByRole('list', { name: 'New pupils' }).getByRole('listitem').filter({ hasText: `Sam ${label}` });
      await expect(sam).toContainText('added by the office');
      await expect(sam).toContainText('07700 900124');
    } finally {
      await visitorContext.close();
      await managerContext.close();
      await school.remove();
    }
  });
});
