import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAccess = vi.fn<() => Promise<unknown>>();
const rpc = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const eq = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const update = vi.fn(() => ({ eq }));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: () => Promise.resolve({ rpc: (...args: unknown[]) => rpc(...args), from: () => ({ update }) }),
}));
vi.mock('@/lib/auth/session', () => ({ requireAccess: () => requireAccess() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));

const { saveAccountName } = await import('./actions');

function signedInAs(role: 'owner' | 'instructor', businessType: 'independent' | 'school' = 'independent') {
  requireAccess.mockResolvedValue({
    session: { userId: 'user-1' },
    access: {
      memberships: [{ businessId: 'biz-1', businessName: 'Khan Driving', businessType, role, instructorProfileId: 'profile-1' }],
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: null, error: null });
  eq.mockResolvedValue({ error: null });
});

describe('the name on the account (AUTH-09, D-217)', () => {
  it('stores the two halves as the one name that is shown', async () => {
    signedInAs('owner');
    const result = await saveAccountName({ firstName: ' Sarah ', lastName: ' Khan ' });
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ full_name: 'Sarah Khan' });
    expect(eq).toHaveBeenCalledWith('id', 'user-1');
  });

  it('keeps a name with no last half whole', async () => {
    signedInAs('owner');
    await saveAccountName({ firstName: 'Prince', lastName: '' });
    expect(update).toHaveBeenCalledWith({ full_name: 'Prince' });
  });

  it('renames the Business through the RPC when its owner sends one', async () => {
    signedInAs('owner');
    await saveAccountName({ firstName: 'Sarah', lastName: 'Khan', businessName: 'Khan School of Motoring' });
    expect(rpc).toHaveBeenCalledWith('set_business_name', { p_business_id: 'biz-1', p_name: 'Khan School of Motoring' });
  });

  it('refuses a business name from somebody who owns nothing, before the database has to (D-196)', async () => {
    signedInAs('instructor', 'school');
    const result = await saveAccountName({ firstName: 'Emma', lastName: 'Clarke', businessName: 'Not my school' });
    expect(result).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
    // And the name is not saved either: nothing about a refused change is half done.
    expect(update).not.toHaveBeenCalled();
  });

  it('lets somebody at a school change their own name', async () => {
    signedInAs('instructor', 'school');
    const result = await saveAccountName({ firstName: 'Emma', lastName: 'Clarke' });
    expect(result.ok).toBe(true);
    expect(update).toHaveBeenCalledWith({ full_name: 'Emma Clarke' });
  });

  it('says which field is wrong rather than failing silently', async () => {
    signedInAs('owner');
    const result = await saveAccountName({ firstName: '   ', lastName: 'Khan' });
    expect(result).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(result.ok ? null : result.fields?.firstName).toBe('Enter your first name');
  });
});
