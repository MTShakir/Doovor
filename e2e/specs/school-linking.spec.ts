import { expect, test } from '@playwright/test';
import { makeInstructor, makeSchool, withDatabase } from '../support/database';
import { addDays, expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/**
 * An instructor who runs their own business links it to a school that sends them pupils, and
 * leaves it again (M9-06, M9-07, D-282). Each width has a school and an instructor of its own.
 */
test.describe('linking an instructor\'s own business to a school (SCH-09, D-282)', () => {
  test('the school invites, the instructor links in one tap and sees the school, the school sees them, and they leave', async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const label = `Link ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const oli = await makeInstructor(`Oli ${testInfo.project.name}`, addDays(today(), 300), { listed: false });
    // A school whose instructors sell their own lessons, some of them at least (D-281).
    await withDatabase(async (sql) => {
      await sql`update public.businesses set lesson_seller = 'both' where id = ${school.businessId}`;
    });

    const managerContext = await browser.newContext();
    const oliContext = await browser.newContext();
    try {
      // The manager makes a link for an instructor who sells their own lessons.
      const manager = await managerContext.newPage();
      await signInThroughForm(manager, school.managerEmail, { next: '/app/school/instructors' });
      await expect(manager.getByRole('region', { name: 'Linked instructors' })).toContainText('Nobody linked yet');
      await manager.getByRole('button', { name: 'Invite an instructor' }).click();
      const sheet = manager.getByRole('dialog', { name: 'Invite an instructor' });
      await sheet.getByLabel('How will they work with you?').selectOption('link');
      await sheet.getByLabel('How will you send it?').selectOption('link');
      await sheet.getByRole('button', { name: 'Make the link' }).click();
      await expect(sheet.getByText('Whoever opens this link can link their business to your school')).toBeVisible();
      await expect(sheet.getByText('would like to send you pupils. Link your instructor business here')).toBeVisible();
      const link = await sheet.getByLabel('Their link').inputValue();
      await snap(manager, testInfo, 'school-invite-link');

      // Oli, signed in with a business of his own, links it in one tap.
      const instructor = await oliContext.newPage();
      await signInThroughForm(instructor, oli.email);
      await instructor.goto(new URL(link).pathname);
      await expect(instructor.getByRole('heading', { level: 1, name: `${school.name} would like to send you pupils` })).toBeVisible();
      await expect(instructor.getByText('You keep your own prices, payments and learners.')).toBeVisible();
      await expectAccessible(instructor);
      await snap(instructor, testInfo, 'school-link-invitation');
      await instructor.getByRole('button', { name: `Link Oli ${testInfo.project.name} Driving to ${school.name}` }).click();

      await expect(instructor).toHaveURL(/\/app\/instructor\/school$/);
      const yours = instructor.getByRole('region', { name: school.name });
      await expect(yours).toContainText(`Oli ${testInfo.project.name} Driving has been linked since`);
      await expect(yours).toContainText('Your plan includes Pro while you are linked');
      await expectAccessible(instructor);
      await snap(instructor, testInfo, 'instructor-your-school');

      // The school sees him by the business he runs, beside its own instructors.
      await manager.reload();
      const linked = manager.getByRole('region', { name: 'Linked instructors' });
      await expect(linked).toContainText(`Oli ${testInfo.project.name}`);
      await expect(linked).toContainText(`Oli ${testInfo.project.name} Driving, linked since`);
      await expect(manager.getByRole('region', { name: 'Teaching under the school' })).toContainText(school.instructor.name);
      await expectAccessible(manager);
      await snap(manager, testInfo, 'school-team-linked');

      // He leaves, and the school no longer has him.
      await instructor.getByRole('button', { name: `Leave ${school.name}` }).click();
      const dialog = instructor.getByRole('dialog', { name: `Leave ${school.name}?` });
      await expect(dialog).toContainText('stay yours');
      await dialog.getByRole('button', { name: `Leave ${school.name}` }).click();
      await expect(instructor.getByText(`You have left ${school.name}`)).toBeVisible();
      await expect(instructor.getByText('You are not linked to a school')).toBeVisible();
      await manager.reload();
      await expect(manager.getByRole('region', { name: 'Linked instructors' })).toContainText('Nobody linked yet');
    } finally {
      await managerContext.close();
      await oliContext.close();
      await school.remove();
      await oli.remove();
    }
  });
});
