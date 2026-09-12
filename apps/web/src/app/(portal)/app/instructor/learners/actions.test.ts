import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UnclaimedAccount, UnclaimedLearner } from '@/lib/learners/account';

const maybeSingle = vi.fn();
const rpc = vi.fn();
const chain = {
  select: () => chain,
  eq: () => chain,
  limit: () => chain,
  maybeSingle,
};
const from = vi.fn(() => chain);

const createAccount = vi.fn<(learner: UnclaimedLearner) => Promise<UnclaimedAccount>>();
const removeAccount = vi.fn<(userId: string) => Promise<void>>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => ({ from, rpc }) }));
vi.mock('@/lib/auth/session', () => ({
  requirePortal: () =>
    Promise.resolve({
      session: { userId: 'instructor-user', email: null, aal: 'aal1' },
      access: { memberships: [{ businessId: 'biz-1', instructorProfileId: 'profile-1' }] },
    }),
}));
vi.mock('@/lib/learners/account', () => ({
  createUnclaimedLearnerAccount: (learner: UnclaimedLearner) => createAccount(learner),
  removeUnclaimedLearnerAccount: (id: string) => removeAccount(id),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const { addLearner } = await import('./actions');

const ruby = { fullName: 'Ruby Shah', phone: '07700 900123', email: '', postcode: 'LS1 4DY', transmission: 'manual' };

beforeEach(() => {
  vi.clearAllMocks();
  maybeSingle.mockResolvedValue({ data: null, error: null });
  createAccount.mockResolvedValue({ ok: true, userId: 'learner-1' });
  rpc.mockResolvedValue({ data: 'link-1', error: null });
});

describe('addLearner (LRN-03, M2-08)', () => {
  it('makes the account, then links them through the caller’s own session', async () => {
    const result = await addLearner(ruby);

    expect(result).toMatchObject({ ok: true, data: { learnerId: 'learner-1' } });
    expect(createAccount).toHaveBeenCalledWith({
      fullName: 'Ruby Shah',
      // Normalised by the schema, so the account carries the number a phone can ring.
      phone: '+447700900123',
      email: null,
    });
    expect(rpc).toHaveBeenCalledWith('add_learner', {
      p_instructor_id: 'profile-1',
      p_learner_id: 'learner-1',
      p_postcode: 'LS1 4DY',
      p_transmission: 'manual',
      p_source: 'manual',
    });
  });

  it('asks for one way of reaching them', async () => {
    const result = await addLearner({ ...ruby, phone: '', email: '' });

    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(result.ok ? null : result.fields?.form).toMatch(/email address or a mobile number/);
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('names the learner already on the list rather than adding them twice', async () => {
    maybeSingle.mockResolvedValueOnce({ data: { full_name: 'Ruby Shah' }, error: null });

    const result = await addLearner(ruby);

    expect(result).toMatchObject({ ok: false, code: 'DUPLICATE_CONTACT' });
    expect(result.ok ? '' : result.message).toContain('Ruby Shah is already on your list');
    expect(createAccount).not.toHaveBeenCalled();
  });

  it('sends them to the invite link when those details already belong to an account', async () => {
    createAccount.mockResolvedValueOnce({ ok: false, taken: true });

    const result = await addLearner(ruby);

    expect(result).toMatchObject({ ok: false, code: 'DUPLICATE_CONTACT' });
    expect(result.ok ? '' : result.message).toContain('Send them a link instead');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('takes the account back when the link cannot be made', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'permission denied' } });

    const result = await addLearner(ruby);

    expect(result).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(removeAccount).toHaveBeenCalledWith('learner-1');
  });
});
