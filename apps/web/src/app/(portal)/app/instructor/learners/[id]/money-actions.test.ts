import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const revalidatePath = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({
  requirePortal: () => Promise.resolve({ session: { userId: 'instructor-1' }, access: {} }),
}));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => { revalidatePath(path); } }));

const { recordOfflinePackage } = await import('./money-actions');

const learnerId = '11111111-1111-4111-8111-111111111111';
const packageId = '33333333-3333-4333-8333-333333333333';
const lotId = '44444444-4444-4444-8444-444444444444';

beforeEach(() => {
  vi.clearAllMocks();
  rpc.mockResolvedValue({ data: lotId, error: null });
});

describe('a package paid for in person (PAY-04, PAY-05, M3-16)', () => {
  it('records it through the function that writes the payment and the credit together', async () => {
    expect(await recordOfflinePackage({ learnerId, packageId, method: 'cash' })).toEqual({ ok: true, data: { lotId } });
    expect(rpc).toHaveBeenCalledWith('record_offline_package', {
      p_learner_id: learnerId,
      p_package_id: packageId,
      p_method: 'cash',
    });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/instructor/learners/${learnerId}`);
  });

  it('asks nothing of the database for a learner, package or method it does not recognise', async () => {
    expect(await recordOfflinePackage({ learnerId, packageId, method: 'cheque' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(await recordOfflinePackage({ learnerId: 'nope', packageId, method: 'cash' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('passes on what the database refused', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await recordOfflinePackage({ learnerId, packageId, method: 'bank' })).toMatchObject({
      ok: false,
      code: 'NOT_ALLOWED',
    });

    rpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "package"}' } });
    expect(await recordOfflinePackage({ learnerId, packageId, method: 'bank' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
