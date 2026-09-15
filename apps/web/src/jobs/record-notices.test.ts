import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));

const { inRoom, notifyLessonRecordAdded, planLessonRecordAdded } = await import('./record-notices');

const notice = {
  lesson_record_id: 'record-1',
  business_id: 'business-1',
  learner_user_id: 'learner-1',
  learner_name: 'Jack Taylor',
  instructor_name: 'Sarah Khan',
  lesson_starts_at: '2026-09-15T08:00:00+00:00',
  summary: 'Good junctions, and mirrors checked early',
};

type Answers = Record<string, (args: Record<string, unknown>) => { data: unknown; error: { message: string } | null }>;

/** Answers each `system_*` function by name, the way the database would. */
function database(answers: Answers) {
  rpc.mockImplementation((name: string, args: Record<string, unknown> = {}) => {
    const answer = answers[name];
    if (answer === undefined) throw new Error(`Nothing answers ${name}`);
    return Promise.resolve(answer(args));
  });
}

const rowsWritten = () =>
  rpc.mock.calls.filter(([name]) => name === 'system_notify').flatMap(([, args]) => (args as { p_rows: Record<string, unknown>[] }).p_rows);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('telling a learner their lesson record is ready (NTF-03, M4-12)', () => {
  it('tells the learner, in the inbox and on their phone, with the lesson and the line, and opens their progress', () => {
    const [planned, ...more] = planLessonRecordAdded(notice);
    expect(more).toEqual([]);
    expect(planned).toMatchObject({
      userId: 'learner-1',
      audience: 'learner',
      channels: ['in_app', 'push'],
      title: 'Your lesson record is ready',
      body: 'Tue 15 Sep at 09:00 with Sarah Khan. Good junctions, and mirrors checked early.',
      link: '/app/learner/progress',
    });
  });

  it('leaves off the phone what the learner switched off there, and keeps one key for the record', () => {
    const [muted] = planLessonRecordAdded(notice, new Map([['learner-1', ['push' as const]]]));
    const [again] = planLessonRecordAdded(notice);
    expect(muted?.channels).toEqual(['in_app']);
    expect(muted?.dedupeKey).toBe(again?.dedupeKey);
  });

  it('cuts a long record at a word to fit a notification, which has room for 400 characters', () => {
    const long = `${'Worked on junctions and roundabouts in heavy traffic. '.repeat(10)}The end.`;
    const [planned] = planLessonRecordAdded({ ...notice, summary: long });
    expect(planned?.body.length).toBeLessThanOrEqual(400);
    expect(planned?.body.endsWith('...')).toBe(true);
    // Cut after a whole word, never part way through one.
    expect(inRoom(long).length).toBeLessThanOrEqual(300);
    expect(long.startsWith(inRoom(long).slice(0, -3))).toBe(true);
    expect(long.charAt(inRoom(long).length - 3)).toMatch(/[ .]/);
    expect(inRoom('  Short,\n and sweet  ')).toBe('Short, and sweet');
  });

  it('writes the notification from what the database says about the record', async () => {
    database({
      system_lesson_record_notice: (args) => ({ data: args.p_lesson_record_id === 'record-1' ? notice : null, error: null }),
      system_notification_mutes: () => ({ data: [], error: null }),
      system_notify: (args) => ({ data: (args.p_rows as unknown[]).length, error: null }),
    });

    expect(await notifyLessonRecordAdded('record-1')).toEqual({ written: 1 });
    expect(rowsWritten()).toEqual([
      expect.objectContaining({ user_id: 'learner-1', business_id: 'business-1', entity_type: 'lesson_record', entity_id: 'record-1' }),
    ]);
  });

  it('tells nobody about a record kept for the Business, or one that is gone', async () => {
    database({ system_lesson_record_notice: () => ({ data: null, error: null }) });
    expect(await notifyLessonRecordAdded('kept')).toEqual({ written: 0 });
    expect(rowsWritten()).toEqual([]);
  });

  it('fails loudly when the record cannot be read, so the job tries again', async () => {
    database({ system_lesson_record_notice: () => ({ data: null, error: { message: 'connection lost' } }) });
    await expect(notifyLessonRecordAdded('record-1')).rejects.toThrow('connection lost');
  });
});
