import { expect, test, type Page } from '@playwright/test';
import { bookLesson, makeSchool, withDatabase, type MadeSchool } from '../support/database';
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
