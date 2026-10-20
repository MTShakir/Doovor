import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SchoolNotice } from './school-notices';

const rpc = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));

const { notifySchoolNotice, planSchoolNotice, schoolNoticeLink } = await import('./school-notices');

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

const asha = { user_id: 'asha-1', audience: 'instructor' as const };
const school = { business_id: 'asha-biz', entity_id: 'row-1', version: null, recipients: [asha], school_name: 'Quayside Driving School' };

const offered: SchoolNotice = {
  ...school,
  kind: 'pupil.offered',
  entity_type: 'school_enquiry_offer',
  version: '1792000000000000',
  learner_name: 'Pat',
  area: 'M1',
  transmission: 'automatic',
  // 14:30 in London, in summer time.
  expires_at: '2026-10-21T13:30:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("telling people about a school's own arrangements (M9-28, NTF-03, D-295)", () => {
  it('offers a pupil to the instructor with what they see before accepting, and when to answer by', () => {
    expect(planSchoolNotice(offered)).toEqual([
      expect.objectContaining({
        userId: 'asha-1',
        kind: 'pupil.offered',
        channels: ['in_app', 'push', 'email'],
        title: 'Quayside Driving School has a pupil for you',
        body: 'Pat, near M1, for automatic lessons. Answer by Wed 21 Oct at 14:30.',
        link: '/app/instructor/school',
        dedupeKey: 'pupil.offered:row-1:1792000000000000:asha-1',
      }),
    ]);
  });

  it('tells a linked instructor their terms, each fee due and each one settled, in the words of their statement', () => {
    const terms: SchoolNotice = {
      ...school,
      kind: 'school_fee.terms_set',
      entity_type: 'school_link',
      terms: { period: 'weekly', fee_pence: 1500, fees_start_on: '2026-11-02', free_weeks: 2, pupil_fee_pence: 1000 },
    };
    expect(planSchoolNotice(terms)[0]?.body).toBe('£15 a week, the first due Mon 16 Nov, after 2 free weeks. £10 for each pupil the school introduces.');
    const none: SchoolNotice = { ...terms, terms: { period: null, fee_pence: null, fees_start_on: null, free_weeks: 0, pupil_fee_pence: null } };
    expect(planSchoolNotice(none)[0]?.body).toBe('No fees from now on.');

    const fee = { kind: 'period' as const, amount_pence: 1500, period_starts_on: '2026-11-16', period_ends_on: '2026-11-22', learner_name: null };
    const due: SchoolNotice = { ...school, kind: 'school_fee.due', entity_type: 'school_fee', fee };
    expect(planSchoolNotice(due)[0]).toMatchObject({
      title: 'A fee to Quayside Driving School is due',
      body: '£15 for the week from Mon 16 Nov. Pay it as you agreed, and they mark it paid.',
      link: '/app/instructor/school',
    });
    const settled: SchoolNotice = {
      ...due,
      kind: 'school_fee.settled',
      outcome: 'written_off',
      fee: { ...fee, kind: 'pupil', amount_pence: 1000, period_starts_on: null, period_ends_on: null, learner_name: 'Pat Pupil' },
    };
    expect(planSchoolNotice(settled)[0]).toMatchObject({ title: 'Quayside Driving School wrote off a fee', body: '£10 for introducing Pat Pupil. You do not owe it.' });
  });

  it('asks a learner to choose, and takes them to where they answer', () => {
    const move: SchoolNotice = {
      ...school,
      kind: 'learner.move_asked',
      entity_type: 'learner_move',
      recipients: [{ user_id: 'lee-1', audience: 'learner' }],
      business_name: 'Patel Driving',
      instructor_name: 'Asha Patel',
      outcome: 'left_school',
    };
    expect(planSchoolNotice(move)[0]).toMatchObject({
      userId: 'lee-1',
      title: 'Patel Driving no longer works with Quayside Driving School',
      link: '/app/learner',
    });
  });

  it('takes each side of a parting to the screen that answers it', () => {
    const parted: SchoolNotice = { ...school, kind: 'school.left', entity_type: 'school_link', outcome: 'let_go' };
    expect(schoolNoticeLink(parted, 'instructor')).toBe('/app/instructor');
    expect(schoolNoticeLink({ ...parted, outcome: 'left' }, 'school')).toBe('/app/school/instructors');
    expect(schoolNoticeLink({ ...parted, outcome: 'switched_off', business_name: 'Patel Driving' }, 'instructor')).toBe('/paused');
    expect(schoolNoticeLink({ ...parted, outcome: 'switched_off' }, 'instructor')).toBe('/start');
    expect(schoolNoticeLink({ ...school, kind: 'pupil.taken', entity_type: 'school_enquiry_offer' }, 'school')).toBe('/app/school/pupils');
  });

  it('keeps an offer in the inbox for somebody who switched the rest off', () => {
    const [notice] = planSchoolNotice(offered, new Map([['asha-1', ['email', 'push']]]));
    expect(notice?.channels).toEqual(['in_app']);
  });

  it('reads the change, writes each notice once against the Business, and nothing for a change that moved on', async () => {
    database({
      system_school_notice: (args) => ({ data: args.p_id === 'row-1' ? offered : null, error: null }),
      system_notification_mutes: () => ({ data: [], error: null }),
      system_notify: (args) => ({ data: (args.p_rows as unknown[]).length, error: null }),
    });

    expect(await notifySchoolNotice({ kind: 'pupil.offered', id: 'row-1' })).toEqual({ written: 1 });
    expect(rpc).toHaveBeenCalledWith('system_school_notice', { p_kind: 'pupil.offered', p_id: 'row-1' });
    expect(rowsWritten()).toEqual([
      expect.objectContaining({ user_id: 'asha-1', business_id: 'asha-biz', kind: 'pupil.offered', entity_type: 'school_enquiry_offer', entity_id: 'row-1' }),
    ]);

    expect(await notifySchoolNotice({ kind: 'pupil.offered', id: 'row-2' })).toEqual({ written: 0 });
    expect(await notifySchoolNotice({ kind: 'something.else', id: 'row-1' })).toEqual({ written: 0 });
    expect(rpc).not.toHaveBeenCalledWith('system_school_notice', expect.objectContaining({ p_kind: 'something.else' }));
  });

  it('says so when the database cannot be read', async () => {
    database({ system_school_notice: () => ({ data: null, error: { message: 'boom' } }) });
    await expect(notifySchoolNotice({ kind: 'pupil.taken', id: 'row-1' })).rejects.toThrow('Could not read what to tell about a school: boom');
  });
});
