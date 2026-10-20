import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { makeInstructor, makeSchool, withDatabase } from '../support/database';
import { addDays, dayLabel, expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/** The Monday of last week, in the UK. */
function lastMonday(): string {
  const now = today();
  const weekday = new Date(`${now}T12:00:00Z`).getUTCDay() || 7;
  return addDays(now, 1 - weekday - 7);
}

/** Somebody who asked a school for lessons, as its page or its office would have left them. */
async function askedSchool(schoolId: string, name: string, email: string): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      insert into public.school_enquiries (school_id, full_name, email, postcode, transmission, note, source, consent_wording)
      values (${schoolId}, ${name}, ${email}, 'M1 2QF', 'manual', 'Weekday evenings', 'public', 'I agree.')`;
  });
}

/**
 * M9's definition of done, each kind of school in one go (D-278): a franchise school links an
 * instructor who already has an account, sets a weekly fee, offers a new pupil who is accepted, and
 * both sides see the fee statement; a school that sells gives a pupil to a member and downloads that
 * member's weekly statement. Each step has its own spec; this is the whole of each, as a school
 * would go through it. Each width has schools and people of its own.
 */
test.describe("M9's definition of done (D-278)", () => {
  test('a franchise school links an instructor with an account, sets a weekly fee, offers a pupil who is accepted, and both see the fees', async ({
    browser,
  }, testInfo) => {
    test.setTimeout(240_000);
    const label = `Franchise ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const oli = await makeInstructor(`Oli ${label}`, addDays(today(), 300), { listed: false });
    const pat = `Pat ${label}`;
    const patEmail = `pat.${testInfo.project.name}.${Date.now().toString(36)}@example.com`;
    // A franchise school: its instructors sell their own lessons (D-281).
    await withDatabase(async (sql) => {
      await sql`update public.businesses set lesson_seller = 'instructors' where id = ${school.businessId}`;
    });
    await askedSchool(school.businessId, pat, patEmail);

    const managerContext = await browser.newContext();
    const oliContext = await browser.newContext();
    try {
      // The school makes a link for an instructor who runs their own business.
      const manager = await managerContext.newPage();
      await signInThroughForm(manager, school.managerEmail, { next: '/app/school/instructors' });
      await manager.getByRole('button', { name: 'Invite an instructor' }).click();
      const invite = manager.getByRole('dialog', { name: 'Invite an instructor' });
      await invite.getByLabel('How will you send it?').selectOption('link');
      await invite.getByRole('button', { name: 'Make the link' }).click();
      const link = await invite.getByLabel('Their link').inputValue();
      await manager.keyboard.press('Escape');

      // Oli already has an account and a business, and links it in one tap.
      const instructor = await oliContext.newPage();
      await signInThroughForm(instructor, oli.email);
      await instructor.goto(new URL(link).pathname);
      await expect(instructor.getByRole('heading', { level: 1, name: `${school.name} would like to send you pupils` })).toBeVisible();
      await instructor.getByRole('button', { name: `Link Oli ${label} Driving to ${school.name}` }).click();
      await expect(instructor).toHaveURL(/\/app\/instructor\/school$/);
      await expect(instructor.getByRole('region', { name: school.name, exact: true })).toContainText(`Oli ${label} Driving has been linked since`);

      // A weekly fee of £50 from today, and the week's fee falls due.
      await manager.goto('/app/school/money/fees');
      const card = manager.getByRole('region', { name: oli.name });
      await card.getByRole('button', { name: 'Set fees' }).click();
      const terms = manager.getByRole('dialog', { name: `Fees for ${oli.name}` });
      await terms.getByLabel('How often').selectOption('weekly');
      await terms.getByLabel('Fee a week, £').fill('50');
      await terms.getByLabel('Starts on').fill(today());
      await terms.getByRole('button', { name: 'Save fees' }).click();
      await expect(manager.getByText('Fees saved')).toBeVisible();
      await withDatabase(async (sql) => {
        await sql`select public.system_raise_school_fees()`;
      });

      // Pat asked the school for lessons, and is offered to Oli.
      await manager.goto('/app/school/pupils');
      await manager.getByRole('list', { name: 'New pupils' }).getByRole('listitem').filter({ hasText: pat }).getByRole('button', { name: 'Offer to instructors' }).click();
      const offer = manager.getByRole('dialog', { name: `Offer ${pat}` });
      await offer.getByRole('checkbox', { name: new RegExp(`Oli ${label}`) }).click();
      await offer.getByRole('button', { name: 'Offer to 1 instructor' }).click();
      await expect(manager.getByText('Offered', { exact: true }).last()).toBeVisible();
      await expectAccessible(manager);

      // Oli accepts, and Pat is his.
      await instructor.reload();
      const pupils = instructor.getByRole('region', { name: `Pupils from ${school.name}` });
      await pupils.getByRole('listitem').filter({ hasText: 'Pat' }).getByRole('button', { name: 'Accept' }).click();
      await expect(instructor.getByText('Pat is yours')).toBeVisible();
      await expect(pupils.getByRole('listitem').filter({ hasText: pat }).getByRole('link', { name: patEmail })).toBeVisible();

      // Both see the same fee statement.
      await manager.goto('/app/school/money/fees');
      await expect(card).toContainText('£50 owed');
      await expect(card.getByRole('list', { name: 'Fees' })).toContainText(`Week from ${dayLabel(today())}`);
      await expectAccessible(manager);
      await snap(manager, testInfo, 'm9-done-school-fees');

      await instructor.reload();
      const fees = instructor.getByRole('region', { name: 'Fees', exact: true });
      await expect(fees).toContainText(`£50 owed. You pay ${school.name} yourself`);
      await expect(fees.getByRole('list', { name: 'Fees' })).toContainText(`Week from ${dayLabel(today())}`);
      await expectAccessible(instructor);
      await snap(instructor, testInfo, 'm9-done-instructor-fees');
    } finally {
      await managerContext.close();
      await oliContext.close();
      await school.remove();
      await oli.remove();
      await withDatabase(async (sql) => {
        await sql`delete from auth.users where lower(email) = lower(${patEmail})`;
      });
    }
  });

  test("a school that sells gives a pupil to a member, and downloads that member's weekly statement", async ({ browser }, testInfo) => {
    test.setTimeout(180_000);
    const label = `Sells ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const rae = `Rae ${label}`;
    const raeEmail = `rae.${testInfo.project.name}.${Date.now().toString(36)}@example.com`;
    const week = lastMonday();
    await withDatabase(async (sql) => {
      // The owner lets the manager see the school's money, and with it pay.
      await sql`
        update public.memberships set permissions = coalesce(permissions, '{}'::jsonb) || '{"view_revenue": true}'::jsonb
         where business_id = ${school.businessId} and role = 'manager'`;
    });
    await askedSchool(school.businessId, rae, raeEmail);

    const managerContext = await browser.newContext({ acceptDownloads: true });
    try {
      // Rae asked the school, which gives her to its own instructor.
      const manager = await managerContext.newPage();
      await signInThroughForm(manager, school.managerEmail, { next: '/app/school/pupils' });
      await manager.getByRole('list', { name: 'New pupils' }).getByRole('listitem').filter({ hasText: rae }).getByRole('button', { name: 'Give to an instructor' }).click();
      const give = manager.getByRole('dialog', { name: `Give ${rae} to an instructor` });
      await give.getByRole('radio', { name: school.instructor.name }).check();
      await give.getByRole('button', { name: `Give to ${school.instructor.name}` }).click();
      await expect(manager.getByText(`Given to ${school.instructor.name}`).first()).toBeVisible();
      await expectAccessible(manager);

      // Last Tuesday the instructor taught her for an hour.
      await withDatabase(async (sql) => {
        const made = await sql`
          insert into public.bookings (business_id, instructor_id, learner_id, lesson_type_id, starts_at, ends_at,
                                       buffer_minutes, status, price_pence, source)
          select p.business_id, p.id, u.id, t.id,
                 (${week}::date + 1 + time '10:00') at time zone 'Europe/London',
                 (${week}::date + 1 + time '11:00') at time zone 'Europe/London', 30, 'completed', 4000, 'instructor'
            from public.instructor_profiles p
            join public.lesson_types t on t.business_id = p.business_id
            join public.users u on lower(u.email) = lower(${raeEmail})
           where p.business_id = ${school.businessId}`;
        if (made.count !== 1) throw new Error(`No lesson for ${rae}`);
      });

      // £18 an hour, from last week, and the week as a file payroll can read.
      await manager.goto(`/app/school/money/pay?week=${week}`);
      const card = manager.getByRole('region', { name: school.instructor.name });
      await expect(card).toContainText(`${rae}, 1h`);
      await card.getByRole('button', { name: 'Set pay' }).click();
      const pay = manager.getByRole('dialog', { name: `Pay for ${school.instructor.name}` });
      await pay.getByLabel('How they are paid').selectOption('hourly');
      await pay.getByLabel('Rate an hour, £').fill('18');
      await pay.getByLabel('Starting from the week of').fill(week);
      await pay.getByRole('button', { name: 'Save pay' }).click();
      await expect(card).toContainText('£18 to pay');
      await expectAccessible(manager);
      await snap(manager, testInfo, 'm9-done-school-pay');

      const downloading = manager.waitForEvent('download');
      await manager.getByRole('link', { name: 'Download CSV' }).click();
      const download = await downloading;
      expect(download.suggestedFilename()).toBe(`pay-week-${week}.csv`);
      const file = await readFile(await download.path(), 'utf8');
      expect(file).toContain(`${rae},60,,40.00,18.00`);
      expect(file).toContain(`${school.instructor.name}, total`);
    } finally {
      await managerContext.close();
      await withDatabase(async (sql) => {
        await sql`delete from public.bookings where learner_id in (select id from public.users where lower(email) = lower(${raeEmail}))`;
      });
      await school.remove();
      await withDatabase(async (sql) => {
        await sql`delete from auth.users where lower(email) = lower(${raeEmail})`;
      });
    }
  });
});
