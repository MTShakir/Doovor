import { expect, test } from '@playwright/test';
import { makeInstructor, makeSchool, withDatabase } from '../support/database';
import { addDays, expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/**
 * A new pupil offered to a linked instructor, who accepts and sees who they are, and another given
 * to one of the school's own instructors (M9-17, M9-18, D-289). Each width has a school and an
 * instructor of its own.
 */
test.describe('finding a new pupil an instructor (SCH-03, D-289)', () => {
  test('the school offers one to a linked instructor who accepts, and gives another to its own', async ({ browser }, testInfo) => {
    test.setTimeout(150_000);
    const label = `Offers ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const oli = await makeInstructor(`Oli ${label}`, addDays(today(), 300), { listed: false });
    const pat = `Pat ${label}`;
    const rae = `Rae ${label}`;
    const raeEmail = `rae.${testInfo.project.name}.${Date.now().toString(36)}@example.com`;
    await withDatabase(async (sql) => {
      await sql`update public.businesses set lesson_seller = 'both' where id = ${school.businessId}`;
      await sql`
        insert into public.school_links (school_id, business_id)
        select ${school.businessId}, p.business_id from public.instructor_profiles p where p.public_slug = ${oli.slug}`;
      await sql`
        insert into public.school_enquiries (school_id, full_name, email, postcode, transmission, note, source, consent_wording)
        values (${school.businessId}, ${pat}, ${`pat.${testInfo.project.name}@example.com`}, 'M1 2QF', 'manual', 'Weekday evenings', 'public', 'I agree.'),
               (${school.businessId}, ${rae}, ${raeEmail}, 'M1 2QF', null, null, 'office', 'They agreed.')`;
    });

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
      await expect(yours.getByRole('link', { name: `pat.${testInfo.project.name}@example.com` })).toBeVisible();

      // The school sees who took them.
      await manager.goto('/app/school/pupils?status=taken');
      await expect(manager.getByRole('list', { name: 'Taken pupils' }).getByRole('listitem').filter({ hasText: pat })).toContainText(
        `Taken by Oli ${label} Driving`,
      );

      // Rae is given to the school's own instructor.
      await manager.goto('/app/school/pupils');
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
      await oliContext.close();
      await school.remove();
      await oli.remove();
      await withDatabase(async (sql) => {
        await sql`delete from auth.users where lower(email) = lower(${raeEmail})`;
      });
    }
  });
});
