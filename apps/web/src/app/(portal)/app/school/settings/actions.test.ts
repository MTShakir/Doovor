import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const savePrices = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const savePackage = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const expireAll = vi.fn<() => void>();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('@/lib/catalogue/save', () => ({
  savePrices: (...args: unknown[]) => savePrices(...args),
  savePackage: (...args: unknown[]) => savePackage(...args),
}));
vi.mock('@/lib/public/instructor-profile', () => ({ expireAllInstructorProfiles: () => { expireAll(); } }));

const { saveSchoolPackage, saveSchoolPrices, saveSchoolRules } = await import('./actions');

const manager = { businessId: 'school-1', businessType: 'school', role: 'manager' };
const rules = { noticeHours: '24', horizonWeeks: '8', cancellationWindowHours: '24', lateFeePercent: '50', requestExpiryHours: '12', reminderHoursBefore: '24,2' };

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { memberships: [manager] } });
  rpc.mockResolvedValue({ data: null, error: null });
  savePrices.mockResolvedValue({ ok: true, data: null });
  savePackage.mockResolvedValue({ ok: true, data: { packageId: 'p-1' } });
});

describe('the school settings (SCH-04, M5-15)', () => {
  it('saves the school prices and packages for the school the person runs', async () => {
    await saveSchoolPrices({ prices: [] });
    expect(savePrices).toHaveBeenCalledWith('school-1', null, { prices: [] });
    await saveSchoolPackage({ packageId: null });
    expect(savePackage).toHaveBeenCalledWith('school-1', { packageId: null });
  });

  it('saves the rules for the whole school, then has every profile read them fresh (R-06)', async () => {
    expect(await saveSchoolRules(rules)).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('set_booking_rules', {
      p_business_id: 'school-1',
      p_rules: {
        notice_hours: 24,
        horizon_weeks: 8,
        cancellation_window_hours: 24,
        late_fee_percent: 50,
        request_expiry_hours: 12,
        reminder_hours_before: [24, 2],
      },
    });
    expect(expireAll).toHaveBeenCalled();
  });

  it('is for somebody running a school, and says what to fix', async () => {
    requirePortal.mockResolvedValue({ access: { memberships: [{ ...manager, role: 'instructor' }] } });
    expect(await saveSchoolPrices({ prices: [] })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(await saveSchoolPackage({})).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(await saveSchoolRules(rules)).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(savePrices).not.toHaveBeenCalled();

    expect(await saveSchoolRules({ ...rules, lateFeePercent: '30' })).toMatchObject({
      ok: false,
      fields: { lateFeePercent: 'Choose 0, 50 or 100 per cent' },
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});
