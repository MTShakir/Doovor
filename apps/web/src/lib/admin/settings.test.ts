import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ rpc }) }));

const { adminSettings } = await import('./settings');

const at = '2026-09-14T23:40:00+00:00';
const stored = {
  booking_defaults: {
    value: {
      buffer_minutes: 15,
      notice_hours: 12,
      horizon_weeks: 10,
      cancellation_window_hours: 24,
      late_fee_percent: 50,
      request_expiry_hours: 6,
      reminder_hours_before: [48, 2],
    },
    updated_at: at,
  },
  marketplace_switch_on: { value: { verified_instructors: 30, open_hours_14_days: 200 }, updated_at: at },
  plan_limits: { value: { pro: { sms_reminders_per_month: 250 }, school: { sms_reminders_per_month: 400 } }, updated_at: at },
  marketplace_fee: { value: { percent: 4, cap_pence: 150 }, updated_at: at },
  feature_flags: { value: { google_sign_in: false, apple_sign_in: true, marketplace: false }, updated_at: at },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('platform settings for the Settings screen (ADM-05, M5-20)', () => {
  it('reads each setting as its form shows it, with when it was changed in London', async () => {
    rpc.mockResolvedValueOnce({ data: stored, error: null });
    expect(await adminSettings()).toEqual({
      bookingDefaults: {
        bufferMinutes: 15,
        noticeHours: 12,
        horizonWeeks: 10,
        cancellationWindowHours: 24,
        lateFeePercent: 50,
        requestExpiryHours: 6,
        instantBook: true,
        reminderHoursBefore: [48, 2],
      },
      switchOnRule: { instructors: 30, hours: 200 },
      planLimits: { proSms: 250, schoolSms: 400 },
      marketplaceFee: { percent: 4, capPence: 150 },
      flags: { googleSignIn: false, appleSignIn: true, marketplace: false },
      changedOn: {
        bookingDefaults: 'Tue 15 Sep 2026',
        switchOnRule: 'Tue 15 Sep 2026',
        planLimits: 'Tue 15 Sep 2026',
        marketplaceFee: 'Tue 15 Sep 2026',
        flags: 'Tue 15 Sep 2026',
      },
    });
    expect(rpc).toHaveBeenCalledWith('admin_platform_settings');
  });

  it("shows the product's own values for anything a setting leaves out", async () => {
    rpc.mockResolvedValueOnce({
      data: { ...stored, plan_limits: { value: {}, updated_at: at }, feature_flags: { value: {}, updated_at: at } },
      error: null,
    });
    const settings = await adminSettings();
    expect(settings.planLimits).toEqual({ proSms: 200, schoolSms: 200 });
    expect(settings.flags).toEqual({ googleSignIn: true, appleSignIn: false, marketplace: false });
  });

  it('fails loudly when the settings cannot be read', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'NOT_ALLOWED' } });
    await expect(adminSettings()).rejects.toThrow('Could not read the platform settings: NOT_ALLOWED');
  });
});
