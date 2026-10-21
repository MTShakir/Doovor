import { expect, test } from '@playwright/test';
import { makeInstructor, makeSchool, withDatabase } from '../support/database';
import { addDays, dayLabel, expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/**
 * What a linked instructor pays the school (M9-11 to M9-13, D-287): the school sets a weekly fee,
 * the fee falls due, the school marks it paid, and the instructor sees the same record. Each width
 * has a school and an instructor of its own.
 */
test.describe('fees from a linked instructor (SCH-09, MNY-06, D-287)', () => {
  test('a fee still owed when the link ends stays on both screens, until it is settled (D-313)', async ({ browser }, testInfo) => {
    test.setTimeout(150_000);
    const label = `Owed ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const oli = await makeInstructor(`Oli ${label}`, addDays(today(), 300), { listed: false });
    await withDatabase(async (sql) => {
      await sql`update public.businesses set lesson_seller = 'both' where id = ${school.businessId}`;
      await sql`
        insert into public.school_links (school_id, business_id, fee_period, fee_pence, fees_start_on)
        select ${school.businessId}, p.business_id, 'weekly', 5000, ${today()}::date
          from public.instructor_profiles p where p.public_slug = ${oli.slug}`;
      await sql`select public.system_raise_school_fees()`;
      // The school lets Oli go with the week's fee still owed.
      await sql`update public.school_links set status = 'ended', ended_at = now(), end_reason = 'let_go' where school_id = ${school.businessId}`;
    });

    const managerContext = await browser.newContext();
    const oliContext = await browser.newContext();
    try {
      const manager = await managerContext.newPage();
      await signInThroughForm(manager, school.managerEmail, { next: '/app/school/money/fees' });
      const card = manager.getByRole('region', { name: oli.name });
      await expect(card).toContainText(`Oli ${label} Driving, no longer linked since ${dayLabel(today())}`);
      await expect(card).toContainText('£50 owed');
      await expect(card).toContainText('No new fees are raised. Mark what is still owed paid, or write it off.');
      await expect(card.getByRole('button', { name: /fees$/ })).toHaveCount(0);
      await expectAccessible(manager);
      await snap(manager, testInfo, 'school-fees-still-owed');

      const instructor = await oliContext.newPage();
      await signInThroughForm(instructor, oli.email, { next: '/app/instructor/school' });
      const owed = instructor.getByRole('region', { name: `Still owed to ${school.name}` });
      await expect(owed).toContainText(`£50 owed. Linked until ${dayLabel(today())}, so no new fees are raised.`);
      await expectAccessible(instructor);

      // Paid in cash: nothing is owed any more, and the card goes.
      await card.getByRole('button', { name: 'Mark paid' }).click();
      const dialog = manager.getByRole('dialog', { name: 'Mark £50 paid?' });
      await dialog.getByLabel('How was it paid?').fill('Cash');
      await dialog.getByRole('button', { name: 'Mark paid' }).click();
      await expect(manager.getByText('£50 marked paid')).toBeVisible();
      await manager.reload();
      await expect(manager.getByRole('heading', { level: 1, name: 'Fees' })).toBeVisible();
      await expect(card).toHaveCount(0);
      await instructor.reload();
      await expect(owed).toHaveCount(0);
    } finally {
      await managerContext.close();
      await oliContext.close();
      await school.remove();
      await oli.remove();
    }
  });

  test('the school sets a fee, it falls due, the school marks it paid, and both see it', async ({ browser }, testInfo) => {
    test.setTimeout(150_000);
    const label = `Fees ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const oli = await makeInstructor(`Oli ${label}`, addDays(today(), 300), { listed: false });
    await withDatabase(async (sql) => {
      await sql`update public.businesses set lesson_seller = 'both' where id = ${school.businessId}`;
      await sql`
        insert into public.school_links (school_id, business_id)
        select ${school.businessId}, p.business_id from public.instructor_profiles p where p.public_slug = ${oli.slug}`;
    });

    const managerContext = await browser.newContext();
    const oliContext = await browser.newContext();
    try {
      const manager = await managerContext.newPage();
      await signInThroughForm(manager, school.managerEmail, { next: '/app/school/money' });
      await manager.getByRole('link', { name: /Fees from linked instructors/ }).click();
      await expect(manager.getByRole('heading', { level: 1, name: 'Fees' })).toBeVisible();
      const card = manager.getByRole('region', { name: oli.name });
      await expect(card).toContainText('No fees');

      // £50 a week from today, and £20 for each pupil the school introduces.
      await card.getByRole('button', { name: 'Set fees' }).click();
      const sheet = manager.getByRole('dialog', { name: `Fees for ${oli.name}` });
      await sheet.getByLabel('How often').selectOption('weekly');
      await sheet.getByLabel('Fee a week, £').fill('50');
      await sheet.getByLabel('Starts on').fill(today());
      await sheet.getByLabel('Fee for each pupil you introduce, £').fill('20');
      await sheet.getByRole('button', { name: 'Save fees' }).click();
      await expect(manager.getByText('Fees saved')).toBeVisible();
      await expect(card).toContainText(`£50 a week, the first due ${dayLabel(today())}`);
      await expect(card).toContainText('£20 for each pupil the school introduces');

      // The hourly job raises the week's fee.
      await withDatabase(async (sql) => {
        await sql`select public.system_raise_school_fees()`;
      });
      await manager.reload();
      await expect(card).toContainText('£50 owed');
      await expect(card.getByRole('list', { name: 'Fees' })).toContainText(`Week from ${dayLabel(today())}`);
      await expectAccessible(manager);
      await snap(manager, testInfo, 'school-fees');

      // Paid by bank transfer, said once, undone, and said again.
      await card.getByRole('button', { name: 'Mark paid' }).click();
      const dialog = manager.getByRole('dialog', { name: 'Mark £50 paid?' });
      await dialog.getByLabel('How was it paid?').fill('Bank transfer');
      await dialog.getByRole('button', { name: 'Mark paid' }).click();
      // The undo lasts five seconds, so it is pressed as soon as it shows, whatever else is loading.
      await expect(manager.getByText('£50 marked paid')).toBeVisible();
      await manager.getByRole('button', { name: 'Undo' }).click();
      await expect(card).toContainText('£50 owed');
      await card.getByRole('button', { name: 'Mark paid' }).click();
      await dialog.getByLabel('How was it paid?').fill('Bank transfer');
      await dialog.getByRole('button', { name: 'Mark paid' }).click();
      await expect(card).toContainText('Nothing owed');
      await expect(card).toContainText('Bank transfer');

      // Oli sees the same record on Your school.
      const instructor = await oliContext.newPage();
      await signInThroughForm(instructor, oli.email, { next: '/app/instructor/school' });
      const fees = instructor.getByRole('region', { name: 'Fees', exact: true });
      await expect(fees).toContainText(`Nothing owed. You pay ${school.name} yourself`);
      await expect(fees).toContainText('£50 a week');
      await expect(fees.getByRole('list', { name: 'Fees' })).toContainText('Paid');
      await expect(fees).toContainText('Bank transfer');
      await expect(fees.getByRole('button', { name: 'Mark paid' })).toHaveCount(0);
      await expectAccessible(instructor);
      await snap(instructor, testInfo, 'instructor-fees');
    } finally {
      await managerContext.close();
      await oliContext.close();
      await school.remove();
      await oli.remove();
    }
  });
});
