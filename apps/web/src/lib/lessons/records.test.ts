import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: unknown[][] = [];
const answers = new Map<string, { data: unknown; error: unknown }>();

/** A query as the loaders build it: every step noted, and awaiting it gives the table's answer. */
function query(table: string) {
  calls.push(['from', table]);
  const chain = {
    select: (...args: unknown[]) => step('select', args),
    eq: (...args: unknown[]) => step('eq', args),
    or: (...args: unknown[]) => step('or', args),
    order: (...args: unknown[]) => step('order', args),
    limit: (...args: unknown[]) => step('limit', args),
    then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(answers.get(table)).then(resolve, reject),
  };
  function step(name: string, args: unknown[]) {
    calls.push([name, ...args]);
    return chain;
  }
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ from: query }) }));

const { learnerSkillMap, lessonRecordPage, recordsPerPage } = await import('./records');

const learner = '3d9a4c1e-7b2f-4e8a-9c6d-5f0e1a2b3c4d';

/** One record as the database hands it back. */
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'record-1',
  lesson_starts_at: '2026-09-12T06:00:00+00:00',
  summary: 'Good junctions today',
  next_focus: 'Roundabouts',
  homework: null,
  instructor_profiles: { display_name: 'Sarah Khan' },
  businesses: { name: 'Sarah Khan Driving', type: 'independent' },
  skill_ratings: [
    { skill_code: 'ROUNDABOUT', rating: 2 },
    { skill_code: 'CTRL', rating: 4 },
  ],
  ...overrides,
});

beforeEach(() => {
  calls.length = 0;
  answers.clear();
});

describe('a page of lesson records (PRG-03, M4-06)', () => {
  it('reads one learner\'s records, the latest lesson first, each skill in the order of the test report', async () => {
    answers.set('lesson_records', { data: [row()], error: null });

    const page = await lessonRecordPage(learner);

    expect(page).toEqual({
      records: [
        {
          id: 'record-1',
          lessonStartsAt: '2026-09-12T06:00:00+00:00',
          instructorName: 'Sarah Khan',
          schoolName: null,
          summary: 'Good junctions today',
          nextFocus: 'Roundabouts',
          homework: null,
          ratings: [
            { skillCode: 'CTRL', rating: 4 },
            { skillCode: 'ROUNDABOUT', rating: 2 },
          ],
        },
      ],
      next: null,
    });
    expect(calls).toContainEqual(['eq', 'learner_id', learner]);
    expect(calls.filter(([name]) => name === 'order')).toEqual([
      ['order', 'lesson_starts_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ]);
    // One more than a page, to know whether another comes after it.
    expect(calls).toContainEqual(['limit', recordsPerPage + 1]);
    expect(calls.some(([name]) => name === 'or')).toBe(false);
  });

  it('names the school a lesson was with, and not an independent instructor\'s own Business', async () => {
    answers.set('lesson_records', {
      data: [row({ instructor_profiles: { display_name: 'Emma Clarke' }, businesses: { name: 'Okafor School of Motoring', type: 'school' } })],
      error: null,
    });
    const [record] = (await lessonRecordPage(learner)).records;
    expect(record).toMatchObject({ instructorName: 'Emma Clarke', schoolName: 'Okafor School of Motoring' });
  });

  it('says where the next page starts only when there is one, from the last record shown', async () => {
    const rows = Array.from({ length: recordsPerPage + 1 }, (_, index) =>
      row({ id: `record-${String(index)}`, lesson_starts_at: `2026-08-${String(20 - index).padStart(2, '0')}T06:00:00.123456+00:00` }),
    );
    answers.set('lesson_records', { data: rows, error: null });

    const page = await lessonRecordPage(learner);

    expect(page.records).toHaveLength(recordsPerPage);
    expect(page.next).toBe('2026-08-11T06:00:00.123456+00:00_record-9');
  });

  it('starts after a cursor: an earlier lesson, or one at the same moment with a lower id', async () => {
    answers.set('lesson_records', { data: [], error: null });

    await lessonRecordPage(learner, { startsAt: '2026-08-11T06:00:00+00:00', id: '6f1c8b52-3a6e-4d1f-9b1e-2f4c5d6e7f80' });

    expect(calls).toContainEqual([
      'or',
      'lesson_starts_at.lt."2026-08-11T06:00:00+00:00",and(lesson_starts_at.eq."2026-08-11T06:00:00+00:00",id.lt.6f1c8b52-3a6e-4d1f-9b1e-2f4c5d6e7f80)',
    ]);
  });

  it('reads as few as it is asked for, for a card that shows only the latest', async () => {
    answers.set('lesson_records', { data: [row(), row({ id: 'record-2' })], error: null });
    const page = await lessonRecordPage(learner, undefined, 1);
    expect(calls).toContainEqual(['limit', 2]);
    expect(page.records.map((one) => one.id)).toEqual(['record-1']);
    expect(page.next).toBe('2026-09-12T06:00:00+00:00_record-1');
  });

  it('leaves out a rating for an area the map does not have', async () => {
    answers.set('lesson_records', { data: [row({ skill_ratings: [{ skill_code: 'PARKING', rating: 3 }, { skill_code: 'ECO', rating: 9 }, { skill_code: 'ECO', rating: 1 }] })], error: null });
    const [record] = (await lessonRecordPage(learner)).records;
    expect(record?.ratings).toEqual([{ skillCode: 'ECO', rating: 1 }]);
  });

  it('passes on a failed read for the page or route to answer', async () => {
    answers.set('lesson_records', { data: null, error: new Error('connection lost') });
    await expect(lessonRecordPage(learner)).rejects.toThrow('connection lost');
  });
});

describe('a learner\'s skill map (PRG-03, M4-07)', () => {
  it('fills in every area from the rolled-up ratings the reader may see', async () => {
    answers.set('skill_progress', {
      data: [
        { skill_code: 'JUNCTIONS', rating: 4, times: 3, last_rated_at: '2026-09-08T06:00:00+00:00' },
        // A row the view could only send with nothing in it is not an area worked on.
        { skill_code: null, rating: null, times: null, last_rated_at: null },
      ],
      error: null,
    });

    const map = await learnerSkillMap(learner);

    expect(calls).toContainEqual(['from', 'skill_progress']);
    expect(calls).toContainEqual(['eq', 'learner_id', learner]);
    expect(map).toHaveLength(23);
    expect(map.find((one) => one.area.code === 'JUNCTIONS')).toMatchObject({
      rating: 4,
      times: 3,
      lastRatedAt: new Date('2026-09-08T06:00:00Z'),
    });
    expect(map.filter((one) => one.rating !== null)).toHaveLength(1);
  });

  it('passes on a failed read', async () => {
    answers.set('skill_progress', { data: null, error: new Error('connection lost') });
    await expect(learnerSkillMap(learner)).rejects.toThrow('connection lost');
  });
});
