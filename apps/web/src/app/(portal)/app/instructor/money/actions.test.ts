import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const maybeSingle = vi.fn();
const revalidatePath = vi.fn();
const access = { memberships: [{ businessId: 'business-1', role: 'owner', instructorProfileId: 'profile-1' }] };

const chain = { select: () => chain, eq: () => chain, maybeSingle };
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ from: () => chain, rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requireAccess: () => Promise.resolve({ session: { userId: 'owner-1' }, access }) }));
// Refusing to write anything while staff are looking through somebody's eyes (ADM-06) reads the
// session itself, which no unit test has.
vi.mock('@/lib/auth/view-as', () => ({ refuseWhileViewing: () => Promise.resolve(null) }));
vi.mock('@/lib/payments/provider', () => ({ paymentsProvider: () => ({}) }));
vi.mock('@/lib/app-url', () => ({ getAppUrl: () => 'https://app.example.test' }));
vi.mock('next/cache', () => ({
  revalidatePath: (path: string) => {
    revalidatePath(path);
  },
}));

const { setPaymentMode } = await import('./actions');

beforeEach(() => {
  vi.clearAllMocks();
  access.memberships = [{ businessId: 'business-1', role: 'owner', instructorProfileId: 'profile-1' }];
  maybeSingle.mockResolvedValue({ data: { id: 'business-1', name: 'Asha Driving', stripe_account_id: 'acct_1' }, error: null });
  rpc.mockResolvedValue({ data: 'after_lesson', error: null });
});

describe('how learners pay (PAY-03, M3-09)', () => {
  it('saves the owner’s choice, and the money screens read it fresh', async () => {
    expect(await setPaymentMode({ mode: 'after_lesson' })).toEqual({ ok: true, data: { mode: 'after_lesson' } });
    expect(rpc).toHaveBeenCalledWith('set_payment_mode', { p_business_id: 'business-1', p_mode: 'after_lesson' });
    expect(revalidatePath).toHaveBeenCalledWith('/app/instructor/money/setup');
    expect(revalidatePath).toHaveBeenCalledWith('/app/school/money/setup');
  });

  it('says charging the day before is part of Pro when the plan does not carry it (D-302)', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'PLAN_REQUIRED', code: 'P0001' } });
    expect(await setPaymentMode({ mode: 'before_lesson' })).toEqual({
      ok: false,
      code: 'PLAN_REQUIRED',
      message: 'Charging the saved card the day before the lesson is part of Pro.',
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('asks nothing of the database for somebody who does not own the business', async () => {
    access.memberships = [{ businessId: 'business-1', role: 'manager', instructorProfileId: 'profile-1' }];
    expect(await setPaymentMode({ mode: 'after_lesson' })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses a way of paying that does not exist', async () => {
    expect(await setPaymentMode({ mode: 'whenever' })).toMatchObject({ ok: false, code: 'VALIDATION_FAILED' });
    expect(rpc).not.toHaveBeenCalled();
  });
});
