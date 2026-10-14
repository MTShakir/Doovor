import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));

const { notifyBadgeExpiring, notifyVerificationDecided, planBadgeExpiring, planVerificationDecided } = await import('./instructor-notices');

/** Ian teaches for a school, whose owner and manager hear as well. */
const ian = {
  instructor_profile_id: 'profile-1',
  business_id: 'school-1',
  user_id: 'ian',
  name: 'Ian One',
  verification_status: 'rejected',
  reason: 'The photo is too blurred to read',
  badge_expiry: '2027-03-31',
  decisions: 1,
  school_staff_ids: ['owner', 'manager'],
};

const warning = { instructor_profile_id: 'profile-1', days_before: 30, summary: 'Your instructor badge expires in 30 days' };

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

describe('a badge decided (INS-02, Appendix B, D-260)', () => {
  it('tells the instructor why it was refused and where to send it again, and their school by name', () => {
    const [instructor, owner, manager, ...more] = planVerificationDecided(ian);
    expect(more).toEqual([]);
    expect(instructor).toMatchObject({
      userId: 'ian',
      audience: 'instructor',
      channels: ['in_app', 'push', 'email'],
      title: 'Your badge was not verified',
      body: 'The photo is too blurred to read. Send it again from your profile and we will check it.',
      link: '/app/instructor/profile',
    });
    expect(owner).toMatchObject({ userId: 'owner', audience: 'school', title: 'Ian One was not verified', link: '/app/school/instructors' });
    expect(manager?.userId).toBe('manager');
  });

  it('tells them they are verified, and a later decision is a notice of its own', () => {
    const [approved] = planVerificationDecided({ ...ian, verification_status: 'approved', reason: null, decisions: 2 });
    expect(approved?.title).toBe('You are verified');
    const [refused] = planVerificationDecided(ian);
    expect(approved?.dedupeKey).not.toBe(refused?.dedupeKey);
    // A retried event is the same decision, and the same key.
    expect(planVerificationDecided(ian)[0]?.dedupeKey).toBe(refused?.dedupeKey);
  });

  it('tells an independent instructor alone, and leaves off what they switched off', () => {
    const planned = planVerificationDecided({ ...ian, school_staff_ids: [] }, new Map([['ian', ['push' as const]]]));
    expect(planned.map((one) => one.userId)).toEqual(['ian']);
    expect(planned[0]?.channels).toEqual(['in_app', 'email']);
  });

  it('writes the notices from what the database says, about the profile and its Business', async () => {
    database({
      system_instructor_notice: (args) => ({ data: args.p_instructor_profile_id === 'profile-1' ? ian : null, error: null }),
      system_notification_mutes: () => ({ data: [], error: null }),
      system_notify: (args) => ({ data: (args.p_rows as unknown[]).length, error: null }),
    });

    expect(await notifyVerificationDecided('profile-1')).toEqual({ written: 3 });
    expect(rowsWritten()).toContainEqual(
      expect.objectContaining({ user_id: 'ian', business_id: 'school-1', kind: 'verification.decided', entity_type: 'instructor_profile', entity_id: 'profile-1' }),
    );
    rpc.mockClear();
    expect(await notifyVerificationDecided('profile-gone')).toEqual({ written: 0 });
    expect(rowsWritten()).toEqual([]);
  });
});

describe('a badge running out (INS-03, Appendix B, D-260)', () => {
  it('warns the instructor in the sweep’s words and the school with the day it runs out', () => {
    const [instructor, owner] = planBadgeExpiring(ian, warning);
    expect(instructor).toMatchObject({
      title: 'Your badge is running out',
      body: 'Your instructor badge expires in 30 days. Renew it with the DVSA. Once the old one runs out, send the new one from your profile and we will check it.',
    });
    expect(owner).toMatchObject({
      title: "Ian One's badge is running out",
      body: 'It expires on Wed 31 Mar. They can send the new one from their profile once they have renewed it.',
    });
  });

  it('is one notice for each warning about each badge', () => {
    const thirty = planBadgeExpiring(ian, warning)[0]?.dedupeKey;
    expect(planBadgeExpiring(ian, { ...warning, days_before: 7 })[0]?.dedupeKey).not.toBe(thirty);
    expect(planBadgeExpiring({ ...ian, badge_expiry: '2032-03-31' }, warning)[0]?.dedupeKey).not.toBe(thirty);
    expect(planBadgeExpiring(ian, warning)[0]?.dedupeKey).toBe(thirty);
  });

  it('writes the warnings, and says so when the database cannot be read', async () => {
    database({
      system_instructor_notice: () => ({ data: ian, error: null }),
      system_notification_mutes: () => ({ data: [], error: null }),
      system_notify: (args) => ({ data: (args.p_rows as unknown[]).length, error: null }),
    });
    expect(await notifyBadgeExpiring(warning)).toEqual({ written: 3 });

    database({ system_instructor_notice: () => ({ data: null, error: { message: 'down' } }) });
    await expect(notifyBadgeExpiring(warning)).rejects.toThrow('Could not read the instructor to notify about: down');
  });
});
