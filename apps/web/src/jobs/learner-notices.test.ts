import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));

const { notifyLearnerJoined, planLearnerJoined } = await import('./learner-notices');

/** Liz accepted Ian's invitation; Ian teaches for a school, whose owner and manager hear as well. */
const liz = {
  invitation_id: 'invitation-1',
  business_id: 'school-1',
  learner_user_id: 'liz',
  learner_name: 'Liz Three',
  instructor_user_id: 'ian',
  instructor_name: 'Ian One',
  school_staff_ids: ['owner', 'manager'],
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

describe('a learner who accepted an invitation (LRN-03, Appendix B, D-301)', () => {
  it('tells the instructor who sent it, and the school who joined and who invited them', () => {
    const [instructor, owner, manager, ...more] = planLearnerJoined(liz);
    expect(more).toEqual([]);
    expect(instructor).toMatchObject({
      userId: 'ian',
      audience: 'instructor',
      kind: 'learner.joined',
      channels: ['in_app', 'push'],
      title: 'Liz Three joined you',
      body: 'They accepted your invitation and can be booked in now.',
      link: '/app/instructor/learners/liz',
    });
    expect(owner).toMatchObject({
      userId: 'owner',
      audience: 'school',
      title: 'Liz Three joined',
      body: 'Ian One invited them. They can be booked in now.',
      link: '/app/school/learners',
    });
    expect(manager?.userId).toBe('manager');
  });

  it('tells an independent instructor alone, and leaves off what they switched off', () => {
    const planned = planLearnerJoined({ ...liz, school_staff_ids: [] }, new Map([['ian', ['push' as const]]]));
    expect(planned.map((one) => one.userId)).toEqual(['ian']);
    expect(planned[0]?.channels).toEqual(['in_app']);
  });

  it('is one notice for each invitation, however often the event arrives', () => {
    const first = planLearnerJoined(liz)[0]?.dedupeKey;
    expect(planLearnerJoined(liz)[0]?.dedupeKey).toBe(first);
    expect(planLearnerJoined({ ...liz, invitation_id: 'invitation-2' })[0]?.dedupeKey).not.toBe(first);
  });

  it('still tells the school when the instructor has gone, and names nobody it was not told', () => {
    const planned = planLearnerJoined({ ...liz, instructor_user_id: null, instructor_name: null, learner_name: null });
    expect(planned.map((one) => one.audience)).toEqual(['school', 'school']);
    expect(planned[0]).toMatchObject({ title: 'Somebody joined', body: 'They accepted an invitation and can be booked in now.' });
  });

  it('writes the notices from what the database says, about the invitation and its Business', async () => {
    database({
      system_learner_joined_notice: (args) => ({ data: args.p_invitation_id === 'invitation-1' ? liz : null, error: null }),
      system_notification_mutes: () => ({ data: [], error: null }),
      system_notify: (args) => ({ data: (args.p_rows as unknown[]).length, error: null }),
    });

    expect(await notifyLearnerJoined('invitation-1')).toEqual({ written: 3 });
    expect(rowsWritten()).toContainEqual(
      expect.objectContaining({ user_id: 'ian', business_id: 'school-1', kind: 'learner.joined', entity_type: 'invitation', entity_id: 'invitation-1' }),
    );
    rpc.mockClear();
    expect(await notifyLearnerJoined('invitation-gone')).toEqual({ written: 0 });
    expect(rowsWritten()).toEqual([]);
  });

  it('says so when the database cannot be read', async () => {
    database({ system_learner_joined_notice: () => ({ data: null, error: { message: 'down' } }) });
    await expect(notifyLearnerJoined('invitation-1')).rejects.toThrow('Could not read the invitation to notify about: down');
  });
});
