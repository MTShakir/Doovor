import { beforeEach, describe, expect, it, vi } from 'vitest';

const createUser = vi.fn();

vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ auth: { admin: { createUser } } }) }));

const { createUnclaimedLearnerAccount } = await import('./account');

beforeEach(() => {
  vi.clearAllMocks();
  createUser.mockResolvedValue({ data: { user: { id: 'learner-1' } }, error: null });
});

describe('the account a learner added by hand claims later (LRN-03, D-068, D-331)', () => {
  it('is unconfirmed, and says it was made for them until they choose a password', async () => {
    expect(await createUnclaimedLearnerAccount({ fullName: 'Ivy Import', email: 'ivy@example.com', phone: null })).toEqual({ ok: true, userId: 'learner-1' });
    expect(createUser).toHaveBeenCalledWith({
      email: 'ivy@example.com',
      phone: undefined,
      email_confirm: false,
      phone_confirm: false,
      user_metadata: { full_name: 'Ivy Import', intended_role: 'learner', made_for_them: true },
    });
  });

  it('says when the details belong to an account already, without saying whose', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'A user with this email address has already been registered' } });
    expect(await createUnclaimedLearnerAccount({ fullName: 'Ivy Import', email: 'ivy@example.com', phone: null })).toEqual({ ok: false, taken: true });
  });
});
