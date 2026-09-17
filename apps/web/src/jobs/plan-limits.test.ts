import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/service', () => ({ getSupabaseServiceClient: () => ({ rpc }) }));

const { planLimitsFrom, readPlanLimits, smsAllowance } = await import('./plan-limits');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('plan limits for the text message jobs (NTF-01, ADM-05, M5-20)', () => {
  it('takes the allowance a super admin set for a plan', async () => {
    rpc.mockResolvedValueOnce({ data: { pro: { sms_reminders_per_month: 250 }, school: { sms_reminders_per_month: 400 } }, error: null });
    const limits = await readPlanLimits();
    expect(rpc).toHaveBeenCalledWith('system_plan_limits');
    expect(smsAllowance('pro', limits)).toBe(250);
    expect(smsAllowance('school', limits)).toBe(400);
  });

  it("falls back to the plan's own allowance, and gives nothing to a plan that is not one", () => {
    const limits = planLimitsFrom({ pro: { sms_reminders_per_month: '250' }, school: null });
    expect(limits).toEqual({});
    expect(smsAllowance('pro', limits)).toBe(200);
    expect(smsAllowance('free', limits)).toBe(0);
    expect(smsAllowance('gold', limits)).toBe(0);
    expect(smsAllowance(null, limits)).toBe(0);
  });

  it('fails loudly when the limits cannot be read, rather than texting without a cap', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'permission denied' } });
    await expect(readPlanLimits()).rejects.toThrow('Could not read the plan limits: permission denied');
  });
});
