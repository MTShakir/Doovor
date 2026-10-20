import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LearnerJoinedNotice } from './learner-notices';

const rpc = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));

const { notifyLearnerJoined, planLearnerJoined } = await import('./learner-notices');

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

const atSchool: LearnerJoinedNotice = {
  invitation_id: 'invite-1',
  business_id: 'school-1',
  learner_id: 'liz-1',
  learner_name: 'Liz Three',
  instructor_name: 'Ian',
  recipients: [
    { user_id: 'ian-1', audience: 'instructor' },
    { user_id: 'ben-1', audience: 'school' },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('a learner who accepted an invitation (NTF-03, Appendix B, D-297)', () => {
  it('tells the instructor and the school, by push and in the inbox, each taken to their own screen', () => {
    expect(planLearnerJoined(atSchool)).toEqual([
      expect.objectContaining({
        userId: 'ian-1',
        kind: 'learner.joined',
        channels: ['in_app', 'push'],
        title: 'Liz Three joined you',
        body: 'They can be booked in now.',
        link: '/app/instructor/learners/liz-1',
        dedupeKey: 'learner.joined:invite-1:0:ian-1',
      }),
      expect.objectContaining({ userId: 'ben-1', audience: 'school', title: 'Liz Three joined you', link: '/app/school/learners' }),
    ]);
  });

  it('is not a service message, so somebody who switched it off is not sent it', () => {
    expect(planLearnerJoined(atSchool, new Map([['ben-1', ['in_app', 'push']]])).map((one) => one.userId)).toEqual(['ian-1']);
  });

  it('reads the invitation and writes each notice once against the Business, and nothing once it is gone', async () => {
    database({
      system_learner_joined_notice: (args) => ({ data: args.p_invitation_id === 'invite-1' ? atSchool : null, error: null }),
      system_notification_mutes: () => ({ data: [], error: null }),
      system_notify: (args) => ({ data: (args.p_rows as unknown[]).length, error: null }),
    });

    expect(await notifyLearnerJoined('invite-1')).toEqual({ written: 2 });
    expect(rpc).toHaveBeenCalledWith('system_notification_mutes', { p_user_ids: ['ian-1', 'ben-1'], p_category: 'account' });
    expect(rowsWritten()).toEqual([
      expect.objectContaining({ user_id: 'ian-1', business_id: 'school-1', kind: 'learner.joined', entity_type: 'invitation', entity_id: 'invite-1' }),
      expect.objectContaining({ user_id: 'ben-1', business_id: 'school-1' }),
    ]);
    expect(await notifyLearnerJoined('invite-2')).toEqual({ written: 0 });
  });

  it('says so when the database cannot be read', async () => {
    database({ system_learner_joined_notice: () => ({ data: null, error: { message: 'boom' } }) });
    await expect(notifyLearnerJoined('invite-1')).rejects.toThrow('Could not read who to tell about a learner joining: boom');
  });
});
