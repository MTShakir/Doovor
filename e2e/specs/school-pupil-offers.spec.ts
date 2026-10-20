import { expect, test } from '@playwright/test';
import { bookLesson, makeInstructor, makeSchool, withDatabase } from '../support/database';
import { addDays, expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/** Somebody who asked a school for lessons, as the page or the office would have left them. */
async function askedSchool(schoolId: string, name: string, email: string, source: 'public' | 'office'): Promise<void> {
  await withDatabase(async (sql) => {
    await sql`
      insert into public.school_enquiries (school_id, full_name, email, postcode, transmission, note, source, consent_wording)
      values (${schoolId}, ${name}, ${email}, 'M1 2QF', ${source === 'public' ? 'manual' : null}, ${source === 'public' ? 'Weekday evenings' : null},
              ${source}, ${source === 'public' ? 'I agree.' : 'They agreed.'})`;
  });
}

/**
 * Finding a new pupil an instructor (M9-17 to M9-20, D-289, D-290): one offered to a linked
 * instructor, who accepts, sees who they are and puts them on their own list, where they show as
 * introduced by the school, whose fee for them falls due with their first lesson; and one given to
 * the school's own instructor. Each test and width has a school of its own.
 */
test.describe('finding a new pupil an instructor (SCH-03, D-289)', () => {
  test('a linked instructor accepts a pupil the school offers, and owes the fee for them', async ({ browser }, testInfo) => {
    test.setTimeout(150_000);
    const label = `Offers ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const oli = await makeInstructor(`Oli ${label}`, addDays(today(), 300), { listed: false });
    const pat = `Pat ${label}`;
    const patEmail = `pat.${testInfo.project.name}.${Date.now().toString(36)}@example.com`;
    await withDatabase(async (sql) => {
      await sql`update public.businesses set lesson_seller = 'both' where id = ${school.businessId}`;
      await sql`
        insert into public.school_links (school_id, business_id, pupil_fee_pence)
        select ${school.businessId}, p.business_id, 2000 from public.instructor_profiles p where p.public_slug = ${oli.slug}`;
    });
    await askedSchool(school.businessId, pat, patEmail, 'public');

    const managerContext = await browser.newContext();
    const oliContext = await browser.newContext();
    try {
      // Pat is offered to Oli for a day.
      const manager = await managerContext.newPage();
      await signInThroughForm(manager, school.managerEmail, { next: '/app/school/pupils' });
      const waiting = manager.getByRole('list', { name: 'New pupils' });
      await waiting.getByRole('listitem').filter({ hasText: pat }).getByRole('button', { name: 'Offer to instructors' }).click();
      const offer = manager.getByRole('dialog', { name: `Offer ${pat}` });
      await offer.getByRole('checkbox', { name: new RegExp(`Oli ${label}`) }).click();
      await offer.getByRole('button', { name: 'Offer to 1 instructor' }).click();
      await expect(manager.getByText('Offered', { exact: true }).last()).toBeVisible();
      await manager.getByRole('link', { name: /^Offered/ }).click();
      const offered = manager.getByRole('list', { name: 'Offered pupils' }).getByRole('listitem').filter({ hasText: pat });
      await expect(offered).toContainText(`Offered to Oli ${label} Driving, until`);
      await expectAccessible(manager);
      await snap(manager, testInfo, 'school-pupil-offered');

      // Oli sees a first name and the area, and accepts.
      const instructor = await oliContext.newPage();
      await signInThroughForm(instructor, oli.email, { next: '/app/instructor/school' });
      const pupils = instructor.getByRole('region', { name: `Pupils from ${school.name}` });
      const card = pupils.getByRole('listitem').filter({ hasText: 'Pat' });
      await expect(card.getByRole('heading', { name: 'Pat, M1' })).toBeVisible();
      await expect(card).toContainText('Answer by');
      await expect(card).not.toContainText('@example.com');
      await expectAccessible(instructor);
      await snap(instructor, testInfo, 'linked-pupil-offer');
      await card.getByRole('button', { name: 'Accept' }).click();
      await expect(instructor.getByText('Pat is yours')).toBeVisible();
      const yours = pupils.getByRole('listitem').filter({ hasText: pat });
      await expect(yours.getByRole('heading', { name: pat })).toBeVisible();
      await expect(yours.getByRole('link', { name: patEmail })).toBeVisible();

      // He puts Pat on his own list, where Pat shows as introduced by the school.
      await yours.getByRole('button', { name: 'Add to my learners' }).click();
      await expect(instructor.getByText('Added to your learners')).toBeVisible();
      await expect(yours).toContainText('On your list of learners.');
      await instructor.goto('/app/instructor/learners');
      await instructor.getByRole('link', { name: new RegExp(pat) }).first().click();
      // The learner's page can be its first compile on a dev server, so it is given longer.
      await expect(instructor.getByText(`Introduced by ${school.name}`)).toBeVisible({ timeout: 20_000 });

      // Pat's first lesson raises the school's fee for introducing them, and the school sees who took Pat.
      await bookLesson(oli.name, patEmail, addDays(today(), testInfo.project.name === 'mobile' ? 9 : 11), '10:00');
      await manager.goto('/app/school/money/fees');
      const fees = manager.getByRole('region', { name: oli.name });
      await expect(fees).toContainText(`A pupil introduced: ${pat}`);
      await expect(fees).toContainText('£20 owed');
      await manager.goto('/app/school/pupils?status=taken');
      await expect(manager.getByRole('list', { name: 'Taken pupils' }).getByRole('listitem').filter({ hasText: pat })).toContainText(
        `Taken by Oli ${label} Driving`,
      );
    } finally {
      await managerContext.close();
      await oliContext.close();
      // A Business keeps its lessons, so Pat's go before Oli's Business does.
      await withDatabase(async (sql) => {
        await sql`delete from public.bookings where learner_id in (select id from public.users where lower(email) = lower(${patEmail}))`;
      });
      await school.remove();
      await oli.remove();
      await withDatabase(async (sql) => {
        await sql`delete from auth.users where lower(email) = lower(${patEmail})`;
      });
    }
  });

  test("the school gives a pupil to one of its own instructors, who becomes the school's learner", async ({ browser }, testInfo) => {
    test.setTimeout(120_000);
    const label = `Give ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const rae = `Rae ${label}`;
    const raeEmail = `rae.${testInfo.project.name}.${Date.now().toString(36)}@example.com`;
    await askedSchool(school.businessId, rae, raeEmail, 'office');

    const managerContext = await browser.newContext();
    try {
      const manager = await managerContext.newPage();
      await signInThroughForm(manager, school.managerEmail, { next: '/app/school/pupils' });
      await manager.getByRole('list', { name: 'New pupils' }).getByRole('listitem').filter({ hasText: rae }).getByRole('button', { name: 'Give to an instructor' }).click();
      const give = manager.getByRole('dialog', { name: `Give ${rae} to an instructor` });
      await give.getByRole('radio', { name: school.instructor.name }).check();
      await give.getByRole('button', { name: `Give to ${school.instructor.name}` }).click();
      await expect(manager.getByText(`Given to ${school.instructor.name}`).first()).toBeVisible();
      await manager.goto('/app/school/pupils?status=taken');
      await expect(manager.getByRole('list', { name: 'Taken pupils' }).getByRole('listitem').filter({ hasText: rae })).toContainText(
        `Given to ${school.instructor.name}`,
      );
      await manager.goto('/app/school/learners');
      await expect(manager.getByText(rae).first()).toBeVisible();
    } finally {
      await managerContext.close();
      await school.remove();
      await withDatabase(async (sql) => {
        await sql`delete from auth.users where lower(email) = lower(${raeEmail})`;
      });
    }
  });
});
