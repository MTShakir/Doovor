import { expect, test } from '@playwright/test';
import { makeInstructor, makeSchool, withDatabase } from '../support/database';
import { addDays, expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/**
 * The school's diary shows when the instructors linked to it are busy, and nothing of whom with
 * (M9-08, D-284). Each width has a school, an instructor and a learner of its own.
 */
test.describe('a linked instructor on the school diary (SCH-02, D-284)', () => {
  test('the school sees when they are busy and away, never who with', async ({ page }, testInfo) => {
    const label = `Linked diary ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const oli = await makeInstructor(`Oli ${label}`, addDays(today(), 300), { listed: false, transmission: 'automatic' });
    const day = addDays(today(), 12);
    const learnerId = crypto.randomUUID();
    const learnerName = `Lara ${label}`;
    await withDatabase(async (sql) => {
      await sql`update public.businesses set lesson_seller = 'both' where id = ${school.businessId}`;
      await sql`
        insert into public.school_links (school_id, business_id)
        select ${school.businessId}, p.business_id from public.instructor_profiles p where p.public_slug = ${oli.slug}`;
      await sql`select tests.create_user_with_id(${learnerId}::uuid, ${`lara.${learnerId.slice(0, 8)}@example.com`}, ${learnerName})`;
      // A lesson of his own at ten, with somebody the school has never met, and the afternoon off.
      await sql`
        insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                     buffer_minutes, status, payment_mode, price_pence, source)
        select p.business_id, p.id, ${learnerId}, t.id,
               (${day}::date + time '10:00') at time zone 'Europe/London',
               (${day}::date + time '11:00') at time zone 'Europe/London',
               30, 'confirmed', 'offline', 4500, 'instructor'
          from public.instructor_profiles p
          join public.lesson_types t on t.business_id = p.business_id
         where p.public_slug = ${oli.slug}`;
      await sql`
        insert into public.availability_exceptions (business_id, instructor_id, kind, starts_at, ends_at, reason)
        select p.business_id, p.id, 'blocked',
               (${day}::date + time '13:00') at time zone 'Europe/London',
               (${day}::date + time '16:00') at time zone 'Europe/London', 'Dentist'
          from public.instructor_profiles p
         where p.public_slug = ${oli.slug}`;
    });

    try {
      await signInThroughForm(page, school.managerEmail, { next: `/app/school/diary?date=${day}` });
      await expect(page.getByRole('heading', { level: 1, name: 'Diary' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 2, name: 'Teaching under the school' })).toBeVisible();
      await expect(page.getByRole('heading', { level: 3, name: school.instructor.name })).toBeVisible();

      const linked = page.getByRole('region', { name: 'Linked instructors' });
      await expect(linked.getByRole('heading', { level: 3, name: oli.name })).toBeVisible();
      await expect(linked).toContainText(`${oli.name} Driving`);
      await expect(linked).toContainText('Busy for 4 hours');
      await expect(linked).toContainText('10:0011:00Booked');
      await expect(linked).toContainText('13:0016:00Away');
      // What his lesson is, who it is with and what it costs are his alone.
      await expect(page.getByText(learnerName)).toHaveCount(0);
      await expect(linked).not.toContainText('Dentist');
      await expect(linked).not.toContainText('£45');
      await expectAccessible(page);
      await snap(page, testInfo, 'school-diary-linked');

      // The filters narrow to him, as they do to the school's own.
      await page.getByLabel('Instructor', { exact: true }).selectOption({ label: oli.name });
      await expect(page).toHaveURL(/instructor=/);
      await expect(page.getByRole('heading', { name: school.instructor.name })).toBeHidden();
      await expect(linked.getByRole('heading', { level: 3, name: oli.name })).toBeVisible();
      await page.getByLabel('Instructor', { exact: true }).selectOption('');
      await page.getByLabel('Transmission', { exact: true }).selectOption('manual');
      await expect(page).toHaveURL(/transmission=manual/);
      await expect(page.getByRole('region', { name: 'Linked instructors' })).toBeHidden();
    } finally {
      // A Business keeps its lessons, so they go before it does.
      await withDatabase(async (sql) => {
        await sql`delete from public.bookings where learner_id = ${learnerId}`;
        await sql`
          delete from public.availability_exceptions
           where instructor_id = (select id from public.instructor_profiles where public_slug = ${oli.slug})`;
      });
      await school.remove();
      await oli.remove();
      await withDatabase(async (sql) => {
        await sql`delete from auth.users where id = ${learnerId}`;
      });
    }
  });
});
