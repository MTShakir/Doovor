import 'server-only';
import { resolveBookingRules } from '@repo/core/booking-rules';
import type { CancellationPolicy } from '@repo/core/cancellation';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface CancellationRules {
  cancellationWindowHours: number;
  lateFeePercent: number;
}

/**
 * What a cancellation would mean for an instructor's lessons, for the warning before one (R-06,
 * BOK-09): the platform's defaults, then the Business's own, then the instructor's.
 */
export async function cancellationRules(instructorProfileId: string): Promise<CancellationRules> {
  const supabase = await createSupabaseServerClient();
  const [profile, platform] = await Promise.all([
    supabase
      .from('instructor_profiles')
      .select('buffer_minutes, instant_book, businesses!instructor_profiles_business_id_fkey(settings)')
      .eq('id', instructorProfileId)
      .maybeSingle(),
    supabase.from('platform_settings').select('value').eq('key', 'booking_defaults').maybeSingle(),
  ]);

  const rules = resolveBookingRules(
    platform.data?.value as Record<string, unknown> | null,
    profile.data?.businesses.settings as Record<string, unknown> | null,
    { bufferMinutes: profile.data?.buffer_minutes, instantBook: profile.data?.instant_book },
  );
  return { cancellationWindowHours: rules.cancellationWindowHours, lateFeePercent: rules.lateFeePercent };
}

/**
 * The cancellation policy of a Business, for a learner of it to read before buying its credit
 * (R-06, BOK-09): the platform's defaults, then the Business's own. The window and the fee are set
 * for the whole Business, so every lesson the credit pays for is booked under the same policy.
 * Read as the learner, who may see a Business they learn with. Null when either cannot be read, so
 * the page goes without the line rather than saying a policy that may not be this Business's.
 */
export async function businessCancellationPolicy(businessId: string): Promise<CancellationPolicy | null> {
  const supabase = await createSupabaseServerClient();
  const [business, platform] = await Promise.all([
    supabase.from('businesses').select('settings').eq('id', businessId).maybeSingle(),
    supabase.from('platform_settings').select('value').eq('key', 'booking_defaults').maybeSingle(),
  ]);
  if (business.error || platform.error || business.data === null) return null;

  const rules = resolveBookingRules(
    platform.data?.value as Record<string, unknown> | null,
    business.data.settings as Record<string, unknown> | null,
    null,
  );
  return { windowHours: rules.cancellationWindowHours, lateFeePercent: rules.lateFeePercent };
}
