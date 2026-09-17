import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const requirePortal = vi.fn<() => Promise<unknown>>();
const revalidatePath = vi.fn();
const expireAllInstructorProfiles = vi.fn();
const expireFeatureFlags = vi.fn();

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));
vi.mock('@/lib/auth/session', () => ({ requirePortal: () => requirePortal() }));
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => { revalidatePath(path); } }));
vi.mock('@/lib/public/instructor-profile', () => ({ expireAllInstructorProfiles: () => { expireAllInstructorProfiles(); } }));
vi.mock('@/lib/flags', () => ({ expireFeatureFlags: () => { expireFeatureFlags(); } }));

const { saveBookingDefaults, saveFeatureFlags, saveMarketplaceFee, savePlanLimits, saveSwitchOnRule } = await import('./actions');

const rules = {
  bufferMinutes: '15',
  noticeHours: '12',
  horizonWeeks: '10',
  cancellationWindowHours: '24',
  lateFeePercent: '50',
  requestExpiryHours: '6',
  reminderHoursBefore: '24,2',
};

beforeEach(() => {
  vi.clearAllMocks();
  requirePortal.mockResolvedValue({ access: { staffRole: 'super_admin' } });
  rpc.mockResolvedValue({ data: null, error: null });
});

describe('saving the platform settings (ADM-05, M5-20)', () => {
  it('saves the default booking rules, and has every profile read its free times again', async () => {
    expect(await saveBookingDefaults(rules)).toEqual({ ok: true, data: null });
    expect(requirePortal).toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('admin_set_platform_setting', {
      p_key: 'booking_defaults',
      p_value: {
        buffer_minutes: 15,
        notice_hours: 12,
        horizon_weeks: 10,
        cancellation_window_hours: 24,
        late_fee_percent: 50,
        request_expiry_hours: 6,
        reminder_hours_before: [24, 2],
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/settings');
    expect(expireAllInstructorProfiles).toHaveBeenCalledOnce();
  });

  it('saves the switch-on rule, plan limits and marketplace fee, each in the shape the settings keep', async () => {
    await saveSwitchOnRule({ instructors: '30', hours: '200' });
    expect(rpc).toHaveBeenLastCalledWith('admin_set_platform_setting', {
      p_key: 'marketplace_switch_on',
      p_value: { verified_instructors: 30, open_hours_14_days: 200 },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/regions');

    await savePlanLimits({ proSms: '250', schoolSms: '400' });
    expect(rpc).toHaveBeenLastCalledWith('admin_set_platform_setting', {
      p_key: 'plan_limits',
      p_value: { pro: { sms_reminders_per_month: 250 }, school: { sms_reminders_per_month: 400 } },
    });

    await saveMarketplaceFee({ percent: '4', cap: '1.50' });
    expect(rpc).toHaveBeenLastCalledWith('admin_set_platform_setting', { p_key: 'marketplace_fee', p_value: { percent: 4, cap_pence: 150 } });
    expect(expireAllInstructorProfiles).not.toHaveBeenCalled();
  });

  it('saves the feature flags, and has every page read them again at once', async () => {
    expect(await saveFeatureFlags({ googleSignIn: false, appleSignIn: false, marketplace: false })).toEqual({ ok: true, data: null });
    expect(rpc).toHaveBeenCalledWith('admin_set_platform_setting', {
      p_key: 'feature_flags',
      p_value: { google_sign_in: false, apple_sign_in: false, marketplace: false },
    });
    expect(expireFeatureFlags).toHaveBeenCalledOnce();
  });

  it('says which field is wrong, whether the form or the database finds it, and changes nothing', async () => {
    expect(await saveSwitchOnRule({ instructors: '0', hours: '200' })).toMatchObject({
      ok: false,
      code: 'VALIDATION_FAILED',
      fields: { instructors: 'Choose between 1 and 1,000 instructors' },
    });
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'VALIDATION_FAILED', details: '{"field": "notice_hours"}' } });
    expect(await saveBookingDefaults(rules)).toMatchObject({ ok: false, fields: { noticeHours: 'Choose a value in range' } });

    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'NOT_ALLOWED' } });
    expect(await saveFeatureFlags({ googleSignIn: true, appleSignIn: false, marketplace: false })).toMatchObject({ ok: false, code: 'NOT_ALLOWED' });
    expect(expireAllInstructorProfiles).not.toHaveBeenCalled();
    expect(expireFeatureFlags).not.toHaveBeenCalled();
  });
});
