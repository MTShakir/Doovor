import { expect, test } from '@playwright/test';
import { makeInstructor, makeSchool, withDatabase } from '../support/database';
import { addDays, expectAccessible, snap } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

const today = (): string => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

/**
 * An instructor with a business of their own joins a school to teach under it: the business
 * pauses, their learner chooses to move with them, and once the school has switched them off they
 * open their business again (M9-23, M9-25, D-292). Each width has a school, an instructor and a
 * learner of its own.
 */
test.describe('joining a school with a business of your own (AUTH-05, LRN-07, D-292)', () => {
  test('the business pauses, the learner moves, and leaving the school it opens again', async ({ browser }, testInfo) => {
    test.setTimeout(150_000);
    const label = `Join ${testInfo.project.name}`;
    const school = await makeSchool(label);
    const oli = await makeInstructor(`Oli ${label}`, addDays(today(), 300), { listed: false });
    const learnerId = crypto.randomUUID();
    const lizEmail = `liz.${learnerId.slice(0, 8)}@example.com`;
    await withDatabase(async (sql) => {
      await sql`select tests.create_user_with_id(${learnerId}::uuid, ${lizEmail}, ${`Liz ${label}`})`;
      await sql`insert into public.learner_profiles (user_id, transmission) values (${learnerId}, 'manual')`;
      await sql`
        insert into public.learner_relationships (business_id, learner_id, instructor_id)
        select p.business_id, ${learnerId}, p.id from public.instructor_profiles p where p.public_slug = ${oli.slug}`;
    });

    const managerContext = await browser.newContext();
    const oliContext = await browser.newContext();
    const lizContext = await browser.newContext();
    try {
      // The school makes a link for an instructor to teach under it.
      const manager = await managerContext.newPage();
      await signInThroughForm(manager, school.managerEmail, { next: '/app/school/instructors' });
      await manager.getByRole('button', { name: 'Invite an instructor' }).click();
      const sheet = manager.getByRole('dialog', { name: 'Invite an instructor' });
      await sheet.getByLabel('How will you send it?').selectOption('link');
      await sheet.getByRole('button', { name: 'Make the link' }).click();
      const link = await sheet.getByLabel('Their link').inputValue();

      // Oli, with a business of his own, is told what joining means, and joins.
      const instructor = await oliContext.newPage();
      await signInThroughForm(instructor, oli.email);
      await instructor.goto(new URL(link).pathname);
      await expect(instructor.getByText(`Joining pauses Oli ${label} Driving while you teach under ${school.name}`)).toBeVisible();
      await expectAccessible(instructor);
      await snap(instructor, testInfo, 'join-with-own-business');
      await instructor.getByRole('button', { name: `Join ${school.name}` }).click();
      await expect(instructor).toHaveURL(/\/onboarding/, { timeout: 20_000 });
      const paused = await withDatabase(async (sql) => {
        const [row] = await sql<{ status: string }[]>`
          select b.status::text as status from public.businesses b
            join public.instructor_profiles p on p.business_id = b.id
           where p.public_slug = ${oli.slug}`;
        return row?.status;
      });
      expect(paused).toBe('paused');

      // Liz is asked whether to move with him, and moves.
      const learner = await lizContext.newPage();
      await signInThroughForm(learner, lizEmail, { next: '/app/learner' });
      const move = learner.getByRole('region', { name: `Oli ${label} now teaches for ${school.name}` });
      await expect(move).toContainText('The lessons you have had stay on your record.');
      await expectAccessible(learner);
      await snap(learner, testInfo, 'learner-asked-to-move');
      await move.getByRole('button', { name: `Move to ${school.name}` }).click();
      await expect(learner.getByText(`Moved to ${school.name}`)).toBeVisible();
      await expect(move).toHaveCount(0);

      // The school switches him off; he opens his own business again.
      await withDatabase(async (sql) => {
        await sql`
          update public.memberships set status = 'deactivated'
           where business_id = ${school.businessId} and user_id = (select id from public.users where lower(email) = lower(${oli.email}))`;
      });
      await instructor.goto('/app/instructor');
      await expect(instructor.getByRole('heading', { level: 1, name: `Oli ${label} Driving is paused` })).toBeVisible({ timeout: 20_000 });
      await expectAccessible(instructor);
      await instructor.getByRole('button', { name: `Open Oli ${label} Driving again` }).click();
      await expect(instructor).toHaveURL(/\/app\/instructor/, { timeout: 20_000 });
      const open = await withDatabase(async (sql) => {
        const [row] = await sql<{ status: string }[]>`
          select b.status::text as status from public.businesses b
            join public.instructor_profiles p on p.business_id = b.id
           where p.public_slug = ${oli.slug}`;
        return row?.status;
      });
      expect(open).toBe('active');
    } finally {
      await managerContext.close();
      await oliContext.close();
      await lizContext.close();
      await school.remove();
      await oli.remove();
      await withDatabase(async (sql) => {
        await sql`delete from auth.users where id = ${learnerId}`;
      });
    }
  });
});
