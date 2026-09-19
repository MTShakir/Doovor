import 'server-only';
import { resolveBookingRules } from '@repo/core/booking-rules';
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
