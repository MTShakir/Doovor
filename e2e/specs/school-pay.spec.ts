import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { makeSchool, withDatabase } from '../support/database';
import { addDays, expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/** The Monday of last week, in the UK. */
function lastMonday(): string {
  const now = today();
  const weekday = new Date(`${now}T12:00:00Z`).getUTCDay() || 7;
  return addDays(now, 1 - weekday - 7);
}

/**
 * What a school pays the instructors teaching under it, and a week's statement as a CSV file (M9-21,
 * M9-22, D-291). Each width has a school, an instructor and a learner of its own.
 */
test.describe('instructor pay (MNY-06, D-291)', () => {
  test('the school sets pay from last week, sees the week and downloads it, and the instructor sees theirs', async ({ browser }, testInfo) => {
    test.setTimeout(150_000);
    const label = `Pay ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const week = lastMonday();
    const learnerId = crypto.randomUUID();
    await withDatabase(async (sql) => {
      // The owner lets the manager see revenue, and with it pay.
      await sql`
        update public.memberships set permissions = coalesce(permissions, '{}'::jsonb) || '{"view_revenue": true}'::jsonb
         where business_id = ${school.businessId} and role = 'manager'`;
      await sql`select tests.create_user_with_id(${learnerId}::uuid, ${`lou.${learnerId.slice(0, 8)}@example.com`}, ${`Lou ${label}`})`;
      // Last Tuesday the school's instructor taught Lou for an hour.
      await sql`
        insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                     buffer_minutes, status, price_pence, source)
        select p.business_id, p.id, ${learnerId}, t.id,
               (${week}::date + 1 + time '10:00') at time zone 'Europe/London',
               (${week}::date + 1 + time '11:00') at time zone 'Europe/London', 30, 'completed', 4000, 'instructor'
          from public.instructor_profiles p
          join public.lesson_types t on t.business_id = p.business_id
         where p.business_id = ${school.businessId}`;
    });

    const managerContext = await browser.newContext({ acceptDownloads: true });
    const instructorContext = await browser.newContext();
    try {
      const manager = await managerContext.newPage();
      await signInThroughForm(manager, school.managerEmail, { next: `/app/school/money/pay?week=${week}` });
      const card = manager.getByRole('region', { name: school.instructor.name });
      await expect(card).toContainText('No pay set');
      await expect(card).toContainText(`Lou ${label}, 1h`);

      // £18 an hour, from last week.
      await card.getByRole('button', { name: 'Set pay' }).click();
      const sheet = manager.getByRole('dialog', { name: `Pay for ${school.instructor.name}` });
      await sheet.getByLabel('How they are paid').selectOption('hourly');
      await sheet.getByLabel('Rate an hour, £').fill('18');
      await sheet.getByLabel('Starting from the week of').fill(week);
      await sheet.getByRole('button', { name: 'Save pay' }).click();
      await expect(manager.getByText('Pay saved')).toBeVisible();
      await expect(card).toContainText('£18 an hour');
      await expect(card).toContainText('£18 to pay');
      await expectAccessible(manager);
      await snap(manager, testInfo, 'school-instructor-pay');

      // The week as a file payroll can read.
      const downloading = manager.waitForEvent('download');
      await manager.getByRole('link', { name: 'Download CSV' }).click();
      const download = await downloading;
      expect(download.suggestedFilename()).toBe(`pay-week-${week}.csv`);
      const file = await readFile(await download.path(), 'utf8');
      expect(file).toContain('Instructor,Date,Learner,Minutes,No-show,Lesson price,Pay');
      expect(file).toContain(`${school.instructor.name},`);
      expect(file).toContain(`Lou ${label},60,,40.00,18.00`);
      expect(file).toContain(`${school.instructor.name}, total`);

      // The instructor sees their own week.
      const instructor = await instructorContext.newPage();
      await signInThroughForm(instructor, school.instructor.email, { next: `/app/instructor/pay?week=${week}` });
      const own = instructor.getByRole('region', { name: school.instructor.name });
      await expect(own).toContainText('£18 to pay');
      await expect(own.getByRole('button', { name: 'Change pay' })).toHaveCount(0);
      await expectAccessible(instructor);
      await snap(instructor, testInfo, 'instructor-own-pay');
    } finally {
      await managerContext.close();
      await instructorContext.close();
      await withDatabase(async (sql) => {
        await sql`delete from public.bookings where learner_id = ${learnerId}`;
        await sql`delete from auth.users where id = ${learnerId}`;
      });
      await school.remove();
    }
  });
});
