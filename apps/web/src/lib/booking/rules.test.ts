import { cancellationPolicyWords } from '@repo/core/cancellation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** What each table answers, as the signed-in learner reads it. */
const answers = new Map<string, { data: unknown; error: unknown }>();
const asked = vi.fn<(table: string, column: string, value: string) => void>();

function table(name: string) {
  const chain = {
    select: () => chain,
    eq: (column: string, value: string) => {
      asked(name, column, value);
      return chain;
    },
    maybeSingle: () => Promise.resolve(answers.get(name) ?? { data: null, error: null }),
  };
  return chain;
}
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: () => Promise.resolve({ from: table }) }));

const { businessCancellationPolicy } = await import('./rules');

const businessId = '6f1d2c8a-4b3e-4a7f-9d21-0c5e8b7a3f64';

function platformSays(value: Record<string, unknown> | null) {
  answers.set('platform_settings', { data: value === null ? null : { value }, error: null });
}

function businessSays(settings: Record<string, unknown> | null) {
  answers.set('businesses', { data: { settings }, error: null });
}

beforeEach(() => {
  vi.clearAllMocks();
  answers.clear();
  platformSays({ buffer_minutes: 30, notice_hours: 24, cancellation_window_hours: 24, late_fee_percent: 50 });
});

describe("a Business's cancellation policy, before its credit is bought (R-06, BOK-09)", () => {
  it('is the platform policy for a Business that changed nothing, in the words the booking link uses', async () => {
    businessSays({});

    const policy = await businessCancellationPolicy(businessId);
    expect(policy).toEqual({ windowHours: 24, lateFeePercent: 50 });
    expect(policy === null ? null : cancellationPolicyWords(policy)).toBe(
      'You can cancel for free up to 24 hours before the lesson. After that, cancelling or missing it costs half the price.',
    );
    expect(asked).toHaveBeenCalledWith('businesses', 'id', businessId);
    expect(asked).toHaveBeenCalledWith('platform_settings', 'key', 'booking_defaults');
  });

  it("is the Business's own window and fee where it set them", async () => {
    businessSays({ cancellation_window_hours: 12, late_fee_percent: 0 });
    expect(await businessCancellationPolicy(businessId)).toEqual({ windowHours: 12, lateFeePercent: 0 });
  });

  it('takes the platform window where the Business set only its fee', async () => {
    businessSays({ late_fee_percent: 100 });
    expect(await businessCancellationPolicy(businessId)).toEqual({ windowHours: 24, lateFeePercent: 100 });
  });

  it('is what the platform ships with when neither says, as cancelling then charges', async () => {
    platformSays(null);
    businessSays(null);
    expect(await businessCancellationPolicy(businessId)).toEqual({ windowHours: 48, lateFeePercent: 100 });
  });

  it('is nothing when the Business cannot be read, so no policy that may not be its own is shown', async () => {
    expect(await businessCancellationPolicy(businessId)).toBeNull();

    answers.set('businesses', { data: null, error: { message: 'permission denied' } });
    expect(await businessCancellationPolicy(businessId)).toBeNull();
  });

  it("is nothing when the platform's policy cannot be read, rather than the one it ships with", async () => {
    businessSays({});
    answers.set('platform_settings', { data: null, error: { message: 'timeout' } });
    expect(await businessCancellationPolicy(businessId)).toBeNull();
  });
});
