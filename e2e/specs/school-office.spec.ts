import { expect, test, type Page } from '@playwright/test';
import { bookLesson, makeSchool, makeSchoolInstructor, withDatabase, type MadeSchool } from '../support/database';
import { chooseDate, dayLabel, expectAccessible, openLearnerTab, snap, tapUntil } from '../support/helpers';
import { signInThroughForm } from '../support/sign-in';

/**
 * The office of a school works its learners from their own card and from the diary: books a lesson
 * with the instructor they are with, marks it paid, calls it off, hands the money back and reads
 * their progress, which PRD 6.2 gives the people who run a school (D-330).
 *
 * A school of the test's own, its manager the office, so nothing here meets another spec's lessons.
 */
test.describe("the school's office (PRD 6.2, LRN-02, D-330)", () => {
  /** A Wednesday three weeks on, inside the hours the test's instructor teaches. */
  const dayAhead = (): string => {
    const day = new Date();
    day.setDate(day.getDate() + 21);
    while (day.getDay() !== 3) day.setDate(day.getDate() + 1);
    return day.toISOString().slice(0, 10);
  };

  /** The school, its instructor teaching weekdays, and a learner given to them. */
  async function schoolWithLearner(label: string): Promise<{ school: MadeSchool; learner: { id: string; name: string; email: string } }> {
    const school = await makeSchool(label);
    const learner = { id: crypto.randomUUID(), name: `Lara ${label}`, email: '' };
    learner.email = `lara.${learner.id.slice(0, 8)}@example.com`;
    await withDatabase(async (sql) => {
      await sql`select tests.create_user_with_id(${learner.id}::uuid, ${learner.email}, ${learner.name})`;
      await sql`insert into public.learner_profiles (user_id, transmission) values (${learner.id}, 'manual')`;
      await sql`
        insert into public.learner_relationships (business_id, learner_id, instructor_id, status, source)
        select ${school.businessId}, ${learner.id}, p.id, 'active', 'manual'
          from public.instructor_profiles p where p.business_id = ${school.businessId}`;
      await sql`
        insert into public.working_hours (instructor_id, business_id, weekday, start_time, end_time)
        select p.id, p.business_id, day, '09:00', '17:00'
          from public.instructor_profiles p, generate_series(1, 5) as day
         where p.business_id = ${school.businessId}`;
    });
    return { school, learner };
  }

  async function removeLearner(id: string): Promise<void> {
    await withDatabase(async (sql) => {
      await sql`delete from auth.users where id = ${id}`;
    });
  }

  async function signInAsOffice(page: Page, school: MadeSchool): Promise<void> {
    await signInThroughForm(page, school.managerEmail, { next: '/app/school/learners' });
  }

  test("books a learner's lesson from their card, marks it paid, calls it off and hands the money back", async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const { school, learner } = await schoolWithLearner(`Office ${testInfo.project.name} ${crypto.randomUUID().slice(0, 4)}`);
    const teacher = school.instructor.name;
    const first = learner.name.split(' ')[0] ?? learner.name;
    const day = dayAhead();
    try {
      await signInAsOffice(page, school);
      await page.goto('/app/school/learners');
      await page.getByRole('link', { name: learner.name, exact: true }).click();
      await expect(page).toHaveURL(/\/app\/school\/learners\/[0-9a-f-]+$/);
      await expect(page.getByRole('heading', { level: 1, name: learner.name })).toBeVisible();
      await expect(page.getByText(`Taught by ${teacher}`)).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'school-learner-card');

      // Booked in the diary of the instructor they are with.
      const sheet = page.getByRole('dialog', { name: 'Book a lesson' });
      await tapUntil(page.getByRole('button', { name: `Book a lesson for ${first}` }), sheet);
      await expect(sheet).toContainText(`In ${teacher}'s diary.`);
      await expect(sheet.getByRole('checkbox', { name: 'No gap needed after the lesson before' })).toHaveCount(0);
      await chooseDate(sheet.getByLabel('Which day?'), day);
      await expect(sheet.getByText(`${teacher}'s hours`, { exact: true })).toBeVisible();
      const times = sheet.getByRole('group', { name: /^Times on/ });
      const slot = times.getByRole('button', { name: '10:00', exact: true });
      await slot.click();
      await sheet.getByRole('button', { name: /^Book 10:00 for £/ }).click();
      await expect(page.getByText(/^Booked for /)).toBeVisible();
      await expect(sheet).toBeHidden();

      // The lesson opens the sheet the diary opens, with what the office may do and no Start.
      await openLearnerTab(page, 'Lessons');
      const open = page.getByRole('region', { name: 'Lessons to come' }).getByRole('button', { name: `Open ${dayLabel(day)}, 10:00` });
      await open.click();
      const lesson = page.getByRole('dialog', { name: learner.name });
      await expect(lesson.getByRole('button', { name: 'Edit lesson' })).toBeVisible();
      await expect(lesson.getByRole('button', { name: 'Start lesson' })).toHaveCount(0);
      await expectAccessible(page);
      await snap(page, testInfo, 'school-lesson-sheet');

      // Moving it: the instructor's hours by name, no travel gap to waive (the instructor's own, D-187),
      // and the way to contact the learner stays in the school's portal.
      await lesson.getByRole('button', { name: 'Edit lesson' }).click();
      const edit = page.getByRole('dialog', { name: `Edit ${learner.name}'s lesson` });
      await expect(edit.getByRole('group', { name: /^Times on/ })).toBeVisible();
      await expect(edit.getByRole('checkbox', { name: 'No gap needed after the lesson before' })).toHaveCount(0);
      await edit.getByRole('group', { name: /^Times on/ }).getByRole('button', { name: '11:00', exact: true }).click();
      await edit.getByRole('button', { name: 'Move to 11:00' }).click();
      const told = page.getByRole('dialog', { name: `Have you told ${learner.name} about the change?` });
      await expect(told.getByRole('link', { name: 'Contact them now' })).toHaveAttribute('href', /^\/app\/school\/learners\/[0-9a-f-]+$/);
      await told.getByRole('button', { name: 'Discard' }).click();
      await expect(told).toBeHidden();

      await open.click();
      await lesson.getByRole('button', { name: 'Mark paid' }).click();
      await page.getByRole('dialog', { name: `How did ${learner.name} pay?` }).getByRole('button', { name: 'Cash' }).click();
      await expect(page.getByText('Marked paid (cash)')).toBeVisible();

      // Called off well ahead, so the cash is owed back in full, and the office hands it back.
      await open.click();
      await page.getByRole('dialog', { name: learner.name }).getByRole('button', { name: 'Cancel lesson' }).click();
      const cancel = page.getByRole('dialog', { name: `Cancel ${learner.name}?` });
      await cancel.getByLabel('Why?').fill(`${teacher} is unwell`);
      await cancel.getByRole('button', { name: 'Cancel the lesson' }).click();
      await expect(page.getByText(`Lesson with ${learner.name} cancelled`)).toBeVisible();

      await page.reload();
      await openLearnerTab(page, 'Payments');
      const owed = page.getByRole('list', { name: 'Owed back' }).getByRole('listitem').filter({ hasText: `For the lesson on ${dayLabel(day)}` });
      await owed.getByRole('button', { name: 'Mark handed back' }).click();
      await page.getByRole('button', { name: 'It is handed back' }).click();
      await expect(page.getByText(new RegExp(`^£[\\d.]+ handed back to ${learner.name}$`))).toBeVisible();

      // Their progress, read and never rated: a lesson's record is the instructor's to write.
      await openLearnerTab(page, 'Progress');
      await page.getByRole('link', { name: 'See progress' }).click();
      await expect(page).toHaveURL(/\/app\/school\/learners\/[0-9a-f-]+\/progress$/);
      await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
      await expect(page.getByRole('radiogroup')).toHaveCount(0);
      await expectAccessible(page);
      await snap(page, testInfo, 'school-learner-progress');
    } finally {
      await school.remove();
      await removeLearner(learner.id);
    }
  });

  test('gives a lesson to another instructor who is free then, and answers a request for one (D-397, D-399)', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const tag = `${testInfo.project.name} ${crypto.randomUUID().slice(0, 4)}`;
    const { school, learner } = await schoolWithLearner(`Cover ${tag}`);
    const cover = await makeSchoolInstructor(`Cara ${tag}`, school.name);
    const day = dayAhead();
    try {
      await bookLesson(school.instructor.name, learner.email, day, '10:00');
      await bookLesson(school.instructor.name, learner.email, day, '14:00');
      await withDatabase(async (sql) => {
        await sql`
          update public.bookings b set status = 'requested', expires_at = now() + interval '12 hours'
            from public.instructor_profiles p
           where p.id = b.instructor_id and p.business_id = ${school.businessId}
             and to_char(b.starts_at at time zone 'Europe/London', 'HH24:MI') = '14:00'`;
      });
      await signInAsOffice(page, school);
      await page.goto(`/app/school/diary?date=${day}`);

      // Covered: the ten o'clock goes to Cara, who is free then.
      await tapUntil(page.getByRole('button', { name: `Open 10:00 with ${learner.name}` }), page.getByRole('dialog', { name: learner.name }));
      const lesson = page.getByRole('dialog', { name: learner.name });
      await lesson.getByRole('button', { name: 'Give to another instructor' }).click();
      const give = page.getByRole('dialog', { name: 'Who teaches it instead?' });
      const choice = give.getByRole('button', { name: new RegExp(`^${cover.name}`) });
      await expect(choice).toContainText('Free then');
      await expectAccessible(page);
      await snap(page, testInfo, 'school-give-lesson');
      await choice.click();
      await expect(page.getByText(`${learner.name}'s lesson is with ${cover.name} now`)).toBeVisible();
      await expect.poll(async () =>
        withDatabase(async (sql) => {
          const [row] = await sql<{ name: string }[]>`
            select p.display_name as name from public.bookings b join public.instructor_profiles p on p.id = b.instructor_id
             where p.business_id = ${school.businessId} and to_char(b.starts_at at time zone 'Europe/London', 'HH24:MI') = '10:00'`;
          return row?.name;
        }),
      ).toBe(cover.name);

      // The two o'clock was asked for: the office answers it for the instructor.
      await page.reload();
      const asked = page.getByRole('article', { name: `14:00 ${learner.name}` });
      await asked.getByRole('button', { name: 'Accept' }).click();
      await expect(page.getByText(`Lesson with ${learner.name} confirmed`)).toBeVisible();
    } finally {
      await school.remove();
      await cover.remove();
      await removeLearner(learner.id);
    }
  });

  test('the learner books with the instructor the school gave them, from Home (BOK-02, D-395)', async ({ page }, testInfo) => {
    const { school, learner } = await schoolWithLearner(`Home ${testInfo.project.name} ${crypto.randomUUID().slice(0, 4)}`);
    try {
      await signInThroughForm(page, learner.email, { next: '/app/learner' });
      await expect(page.getByText(`Book your first lesson with ${school.instructor.name}, or they can book it for you.`)).toBeVisible();
      await expect(page.getByRole('link', { name: 'Book a lesson', exact: true })).toHaveAttribute('href', `/book/${school.instructor.slug}`);
      // They have an instructor, so they are not offered a search for one.
      await expect(page.getByText('Looking for an instructor?')).toHaveCount(0);
      await expectAccessible(page);
      await snap(page, testInfo, 'learner-home-book-own-instructor');
    } finally {
      await school.remove();
      await removeLearner(learner.id);
    }
  });

  test('opens a lesson from the school diary, and the card from the lesson', async ({ page }, testInfo) => {
    const { school, learner } = await schoolWithLearner(`Diary ${testInfo.project.name} ${crypto.randomUUID().slice(0, 4)}`);
    const day = dayAhead();
    try {
      await bookLesson(school.instructor.name, learner.email, day, '10:00');
      await signInAsOffice(page, school);
      await page.goto(`/app/school/diary?date=${day}`);
      await page.getByRole('button', { name: `Open 10:00 with ${learner.name}` }).click();
      const lesson = page.getByRole('dialog', { name: learner.name });
      await expect(lesson.getByRole('button', { name: 'Edit lesson' })).toBeVisible();
      await expect(lesson.getByRole('button', { name: 'Cancel lesson' })).toBeVisible();
      await expectAccessible(page);
      await snap(page, testInfo, 'school-diary-lesson');

      await lesson.getByRole('link', { name: `Open ${learner.name}'s card` }).click();
      await expect(page).toHaveURL(/\/app\/school\/learners\/[0-9a-f-]+$/);
      await expect(page.getByRole('heading', { level: 1, name: learner.name })).toBeVisible();
    } finally {
      await school.remove();
      await removeLearner(learner.id);
    }
  });
});
