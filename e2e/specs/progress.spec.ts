import { expect, test, type Locator, type Page } from '@playwright/test';
import { authFile } from '../support/accounts';
import { recordLessons, userIdOf, type RecordedLessonSeed } from '../support/database';
import { addDays, dayLabel, expectAccessible, settled, snap } from '../support/helpers';

/**
 * A learner's progress, and their instructor's view of it (PRD 10.3 step 4, PRG-03, M4-06, M4-07).
 *
 * Jack Taylor learns with Sarah Khan. Each test writes its own run of lessons with records, weeks
 * before the seed's lessons, on days and at an hour of its own for each width, and rates an area
 * of the map that nothing else rates. Other tests add records for Jack while these run, so each
 * test reads only what it wrote: its own records wherever they fall in the timeline, and its own
 * area on the map.
 */
test.describe('progress: lesson records and the skill map (PRG-03, M4-06, M4-07)', () => {
  const learner = 'jack.taylor@example.com';
  const today = (): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());

  /** How a record's card is named: "Tue 15 Sep at 07:00", with the year for a lesson in another year. */
  const cardName = (date: string, time: string): string =>
    `${dayLabel(date)}${date.slice(0, 4) === today().slice(0, 4) ? '' : ` ${date.slice(0, 4)}`} at ${time}`;

  /** Pages back through the timeline until a record shows, the way somebody scrolling for it would. */
  const showOlderUntil = async (page: Page, record: Locator) => {
    const shown = page.getByRole('list', { name: 'Lesson records' }).getByRole('listitem');
    // The first page, before looking for anything on it.
    await expect(shown.first()).toBeVisible();
    for (let pages = 0; pages < 10 && !(await record.isVisible()); pages += 1) {
      const before = await shown.count();
      await page.getByRole('button', { name: 'Show older records' }).click();
      await expect(shown).not.toHaveCount(before);
    }
    await expect(record).toBeVisible();
  };

  test.describe('the learner', () => {
    test.use({ storageState: authFile('learner') });

    test('reads each lesson record, newest first, a page at a time, and the skill map they make', async ({
      page,
    }, testInfo) => {
      const mobile = testInfo.project.name === 'mobile';
      const time = mobile ? '07:00' : '06:00';
      // Twelve lessons a day apart, more than a page: 8 to 19 days ago, or 22 to 33.
      const days = Array.from({ length: 12 }, (_, index) =>
        addDays(today(), -((mobile ? 8 : 22) + index)),
      );
      const area = mobile
        ? { code: 'DUALCW', name: 'Dual carriageways and fast roads' }
        : { code: 'RURAL', name: 'Rural roads' };
      const [newest = '', , third = ''] = days;
      const oldest = days.at(-1) ?? '';

      const lessons: RecordedLessonSeed[] = days
        // The third newest lesson's record comes last, as one sent late from a phone with no signal would.
        .filter((day) => day !== third)
        .map((day) => ({
          date: day,
          time,
          summary: `A lesson on ${day}, ${testInfo.project.name}.`,
          ratings: { JUNCTIONS: 3 },
        }));
      lessons[0] = {
        date: newest,
        time,
        summary: `Joined the ${mobile ? 'A64' : 'A61'} at speed and kept to the left lane.`,
        ratings: { [area.code]: 4, JUNCTIONS: 3 },
        nextFocus: 'Leaving at the right exit',
        homework: 'Read the Highway Code rules on motorways',
      };
      lessons.push({
        date: third,
        time,
        summary: `Sent late, ${testInfo.project.name}.`,
        ratings: { [area.code]: 5 },
      });
      await recordLessons('Sarah Khan', learner, lessons);

      await page.goto('/app/learner/progress');
      await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();

      // The newest of this run: what was said, each skill at its rating, and what comes next.
      const records = page.getByRole('list', { name: 'Lesson records' });
      const latest = records.getByRole('article', { name: cardName(newest, time) });
      await showOlderUntil(page, latest);
      await expect(latest).toContainText(
        `Joined the ${mobile ? 'A64' : 'A61'} at speed and kept to the left lane.`,
      );
      await expect(
        latest.getByRole('img', { name: `${area.name}: 4 of 5, Seldom prompted` }),
      ).toBeVisible();
      await expect(latest.getByRole('img', { name: 'Junctions: 3 of 5, Prompted' })).toBeVisible();
      await expect(latest.getByRole('definition')).toHaveText([
        'Leaving at the right exit',
        'Read the Highway Code rules on motorways',
      ]);
      await expect(latest).toContainText('Sarah Khan');

      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, 'progress-records');

      // Older records come a page at a time, under the ones already there, the latest lesson first.
      await showOlderUntil(page, records.getByRole('article', { name: cardName(oldest, time) }));
      expect(await records.getByRole('article').count()).toBeGreaterThan(10);
      const order = await records.getByRole('heading', { level: 3 }).allTextContents();
      const mine = days.map((day) => order.indexOf(cardName(day, time)));
      expect(
        mine.every((at) => at >= 0),
        'every record of this run is shown',
      ).toBe(true);
      expect(mine, 'newest lesson first, whatever order the records arrived in').toEqual(
        [...mine].sort((a, b) => a - b),
      );

      // The skill map: every area, each at the rating from the lesson that happened last. The late
      // record rated the area 5, but its lesson came before the one that rated it 4.
      if (mobile) {
        await expect(page.getByRole('list', { name: 'Skill map' })).toBeHidden();
        await page.getByRole('tab', { name: 'Skill map' }).click();
        await expect(records).toBeHidden();
      } else {
        await expect(page.getByRole('tab', { name: 'Skill map' })).toBeHidden();
      }
      const map = page.getByRole('list', { name: 'Skill map' });
      await expect(map.getByRole('listitem')).toHaveCount(23);
      await expect(
        map.getByRole('img', { name: `${area.name}: 4 of 5, Seldom prompted` }),
      ).toBeVisible();
      await expect(map.getByRole('img', { name: 'Controls: 0 of 5, Not started' })).toBeVisible();
      // Other tests rate Jack too, so how many areas is theirs to say; that it is a count of 23 is this one's.
      await expect(page.getByText(/^\d+ of 23 areas worked on(, \d+ driven independently)?$/)).toBeVisible();

      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, 'progress-skill-map');
    });
  });

  test.describe('their instructor', () => {
    test.use({ storageState: authFile('instructor') });

    test('sees the progress of a learner of theirs, where nobody else who does not teach them can', async ({
      page,
      browser,
    }, testInfo) => {
      const mobile = testInfo.project.name === 'mobile';
      const time = mobile ? '07:00' : '06:00';
      const newest = addDays(today(), mobile ? -36 : -41);
      const older = addDays(today(), mobile ? -38 : -43);
      const area = mobile
        ? { code: 'ECO', name: 'Eco-safe driving' }
        : { code: 'PEDX', name: 'Pedestrian crossings' };
      const summary = `Planned well ahead on the ring road, ${testInfo.project.name}.`;
      await recordLessons('Sarah Khan', learner, [
        {
          date: older,
          time,
          summary: `Introduced it, ${testInfo.project.name}.`,
          ratings: { [area.code]: 1 },
        },
        { date: newest, time, summary, ratings: { [area.code]: 3 } },
      ]);
      const jack = await userIdOf(learner);

      await page.goto(`/app/instructor/learners/${jack}`);
      const progress = page.getByRole('region', { name: 'Progress' });
      await expect(progress).toContainText(/\d+ of 23 areas worked on/);
      await expect(progress).toContainText('Last record, ');
      await progress.getByRole('link', { name: 'See progress' }).click();

      await expect(page).toHaveURL(new RegExp(`/app/instructor/learners/${jack}/progress$`));
      await expect(page.getByRole('heading', { level: 1, name: 'Progress' })).toBeVisible();
      const record = page
        .getByRole('list', { name: 'Lesson records' })
        .getByRole('article', { name: cardName(newest, time) });
      await showOlderUntil(page, record);
      await expect(record).toContainText(summary);
      await expect(
        record.getByRole('img', { name: `${area.name}: 3 of 5, Prompted` }),
      ).toBeVisible();

      if (mobile) await page.getByRole('tab', { name: 'Skill map' }).click();
      await expect(
        page
          .getByRole('list', { name: 'Skill map' })
          .getByRole('img', { name: `${area.name}: 3 of 5, Prompted` }),
      ).toBeVisible();
      await expectAccessible(page);
      await settled(page);
      await snap(page, testInfo, 'learner-progress-instructor');

      await page.getByRole('main').getByRole('link', { name: 'Jack Taylor' }).click();
      await expect(page.getByRole('heading', { level: 1, name: 'Jack Taylor' })).toBeVisible();

      // An instructor at the school, who does not teach Jack, has no progress of Jack's to look at.
      const stranger = await browser.newContext({ storageState: authFile('schoolInstructor') });
      try {
        const theirs = await stranger.newPage();
        await theirs.goto(`/app/instructor/learners/${jack}/progress`);
        await expect(theirs.getByRole('heading', { name: 'Page not found' })).toBeVisible();
        const answer = await theirs.request.get(`/api/v1/lesson-records?learner=${jack}`);
        expect(await answer.json()).toEqual({ ok: true, data: { records: [], next: null } });
      } finally {
        await stranger.close();
      }
    });
  });
});
