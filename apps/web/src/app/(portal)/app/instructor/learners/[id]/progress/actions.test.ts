import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => Promise.resolve({ session: { userId: 'instructor-1' }, access: {} }) }));
vi.mock('next/cache', () => ({ revalidatePath: (...args: unknown[]) => { revalidatePath(...args); } }));

const { rateSkill } = await import('./actions');

const learnerId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: 'assessment-1', error: null });
});

describe('setting a skill on the map by hand (PRG-02, D-169)', () => {
  it('asks the database to set it, and redraws the map and the card', async () => {
    expect(await rateSkill({ learnerId, skillCode: 'MOVEOFF', rating: 3 })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('rate_skill', { p_learner_id: learnerId, p_skill_code: 'MOVEOFF', p_rating: 3 });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/instructor/learners/${learnerId}/progress`);
    expect(revalidatePath).toHaveBeenCalledWith(`/app/instructor/learners/${learnerId}`);
  });

  it('asks nothing for a rating off the scale, or an area that is not one', async () => {
    expect(await rateSkill({ learnerId, skillCode: 'MOVEOFF', rating: 6 })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(await rateSkill({ learnerId, skillCode: 'FLYING', rating: 3 })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes on a learner who is not theirs', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await rateSkill({ learnerId, skillCode: 'MOVEOFF', rating: 3 })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
